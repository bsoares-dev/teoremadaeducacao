import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Transaction } from "@electric-sql/pglite";
import type { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { consumeRequest, RequestLimitError, requestLimitResponse } from "../lib/request-limits";
import { cartDatabase } from "../scripts/fixtures/cart-database.mjs";

test("persistent request budgets isolate account/action, bound counters and reset windows", async () => {
  const { db, users, service } = await cartDatabase();
  const consume = (id: string, action: string) => service(async (tx: Transaction) => (await tx.query<{ value: { allowed: boolean; retryAfterSeconds: number } }>(
    "select teorema_consume_request($1,$2) as value", [id, action])).rows[0].value);
  try {
    for (let n = 0; n < 20; n++) assert.equal((await consume(users[1].id, "PDF_DOWNLOAD")).allowed, true);
    for (let n = 0; n < 5; n++) {
      const blocked = await consume(users[1].id, "PDF_DOWNLOAD");
      assert.equal(blocked.allowed, false); assert.ok(blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60);
    }
    assert.equal((await consume(users[2].id, "PDF_DOWNLOAD")).allowed, true);
    assert.equal((await consume(users[1].id, "LIBRARY_READ")).allowed, true);
    assert.equal((await db.query<{ requests: number }>("select requests from teorema_private.request_limits where user_id=$1 and action='PDF_DOWNLOAD'", [users[1].id])).rows[0].requests, 21);
    await db.query("update teorema_private.request_limits set window_start=now()-interval '61 seconds' where user_id=$1", [users[1].id]);
    assert.deepEqual(await consume(users[1].id, "PDF_DOWNLOAD"), { allowed: true, retryAfterSeconds: 0 });
    for (let n = 0; n < 10; n++) assert.equal((await consume(users[1].id, "ORDER_CREATE")).allowed, true);
    assert.equal((await consume(users[1].id, "ORDER_CREATE")).allowed, false);
    await assert.rejects(consume(users[1].id, "CLIENT_SELECTED_BUDGET"), /Unknown request action/);
    await assert.rejects(consume(randomUUID(), "PDF_DOWNLOAD"), /Confirmed account/);
    await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [users[2].id]);
    await assert.rejects(consume(users[2].id, "PDF_DOWNLOAD"), /Confirmed account/);
  } finally { await db.close(); }
});

test("clients cannot call budgets or inspect counters; service cannot read Auth directly", async () => {
  const { db, users, service } = await cartDatabase();
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select teorema_consume_request($1,'PDF_DOWNLOAD')", [users[1].id]), /permission denied/);
      await assert.rejects(db.exec("select * from teorema_private.request_limits"), /permission denied/);
      await db.exec("reset role");
    }
    await assert.rejects(service((tx: Transaction) => tx.query("select id from auth.users")), /permission denied/);
  } finally { await db.close(); }
});

test("HTTP budgets fail closed, never trust malformed RPC data, and return private 429 with Retry-After", async () => {
  const fake = (data: unknown, error: unknown = null) => ({ rpc: async () => ({ data, error }) }) as unknown as Pick<ReturnType<typeof getSupabaseAdmin>, "rpc">;
  await consumeRequest(fake({ allowed: true, retryAfterSeconds: 0 }), "verified-user", "PDF_DOWNLOAD");
  await assert.rejects(consumeRequest(fake({ allowed: false, retryAfterSeconds: 30 }), "verified-user", "PDF_DOWNLOAD"), RequestLimitError);
  await assert.rejects(consumeRequest(fake(null, { code: "08006" }), "verified-user", "PDF_DOWNLOAD"));
  for (const payload of [{ allowed: "true", retryAfterSeconds: 0 }, { allowed: true, retryAfterSeconds: 901 }, null]) {
    await assert.rejects(consumeRequest(fake(payload), "verified-user", "PDF_DOWNLOAD"));
  }
  const response = requestLimitResponse(new RequestLimitError(30))!;
  assert.equal(response.status, 429); assert.equal(response.headers.get("Retry-After"), "30");
  assert.match(response.headers.get("Cache-Control")!, /no-store/);
  assert.equal(requestLimitResponse(new Error("RPC unavailable")), null);
});
