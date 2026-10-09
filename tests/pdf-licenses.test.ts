import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Transaction } from "@electric-sql/pglite";
import { cartDatabase } from "../scripts/fixtures/cart-database.mjs";
import { generateLicenseCode } from "../lib/pdf-licenses/code";
import { licenseCodeSchema, licensePurchaseSchema, pdfLicenseSchema, PdfLicenseError } from "../lib/pdf-licenses/types";

test("license codes are opaque 128-bit crypto values; purchase input rejects forged identity", () => {
  const codes = Array.from({ length: 1000 }, generateLicenseCode);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every(code => licenseCodeSchema.safeParse(code).success));
  const purchase = { orderId: randomUUID(), productId: randomUUID() };
  assert.deepEqual(licensePurchaseSchema.parse(purchase), purchase);
  for (const input of [null, { ...purchase, userId: randomUUID() }, { ...purchase, licenseCode: codes[0] }, { ...purchase, paymentStatus: "CONFIRMADO" }, { ...purchase, orderId: "../other" }]) {
    assert.equal(licensePurchaseSchema.safeParse(input).success, false);
  }
  assert.equal(licenseCodeSchema.safeParse("LIC-0001").success, false);
});

test("license DTO validates status/timestamps; errors contain no database diagnostics", () => {
  const row = { id: randomUUID(), user_id: randomUUID(), product_id: randomUUID(), order_id: randomUUID(), order_item_id: randomUUID(), license_code: generateLicenseCode(), status: "active", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), revoked_at: null };
  assert.ok(pdfLicenseSchema.safeParse(row).success);
  assert.ok(pdfLicenseSchema.safeParse({ ...row, status: "revoked", revoked_at: row.created_at }).success);
  for (const invalid of [{ ...row, status: "revoked" }, { ...row, revoked_at: row.created_at }, { ...row, created_at: "yesterday" }, { ...row, service_role_key: "secret" }]) {
    assert.equal(pdfLicenseSchema.safeParse(invalid).success, false);
  }
  assert.equal(new PdfLicenseError("ACCESS_DENIED").message, "Você não possui acesso a este material.");
});

test("license persistence and Auth entry points remain server-only", () => {
  for (const name of ["repository", "service"]) {
    const source = readFileSync(new URL(`../lib/pdf-licenses/${name}.ts`, import.meta.url), "utf8");
    assert.match(source, /^import "server-only";/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY|console\.|@ts-ignore/);
  }
  const service = readFileSync(new URL("../lib/pdf-licenses/service.ts", import.meta.url), "utf8");
  assert.match(service, /getAuth\(\)/);
  assert.match(service, /userId: user.id/);
  assert.match(service, /LICENSE_REVOKED/);
  const source = readFileSync(new URL("../lib/pdf-licenses/code.ts", import.meta.url), "utf8");
  assert.match(source, /randomBytes\(16\)/);
  assert.doesNotMatch(source, /Math.random|process.env/);
});

test("PDF license foundation: purchase, isolation, stable identity and unique origins", async t => {
  const { db, users, ids, service } = await cartDatabase();
  const alice = users[1].id, bob = users[2].id, admin = users[0].id;
  const order = (owner: string, products: string[]) => service(async (tx: Transaction) => {
    const cart = (await tx.query<{ value: { cart: { id: string } } }>("select teorema_sync_cart($1,$2,null,0,$3,'{}') as value", [owner, randomUUID(), products])).rows[0].value.cart;
    return (await tx.query<{ value: string }>("select teorema_create_order($1,$2,$3,$4,$5) as value", [owner, cart.id, randomUUID(), products.length * 39.9, JSON.stringify(Object.fromEntries(products.map(id => [id, 39.9])))])).rows[0].value;
  });
  const ensure = (owner: string, orderId: string, product: string, code = generateLicenseCode()) => service(async (tx: Transaction) => pdfLicenseSchema.parse(
    (await tx.query<{ value: unknown }>("select teorema_get_or_create_pdf_license($1,$2,$3,$4) as value", [owner, orderId, product, code])).rows[0].value));
  const confirm = (id: string) => service((tx: Transaction) => tx.query("select teorema_confirm_order($1,$2)", [admin, id]));
  const revokeGrant = (id: string, state = "REVOGADO") => service((tx: Transaction) => tx.query("select teorema_set_access_state($1,$2,$3,'License fixture decision',$4)", [admin, id, state, randomUUID()]));
  let purchased: string, license: ReturnType<typeof pdfLicenseSchema.parse>, grant: string;
  try {
    await t.test("pending, canceled, foreign and missing purchases are denied without licenses", async () => {
      purchased = await order(alice, [ids[0], ids[1]]);
      await assert.rejects(ensure(alice, purchased, ids[0]), { code: "42501" });
      await assert.rejects(ensure(bob, purchased, ids[0]), { code: "42501" });
      await assert.rejects(ensure(alice, randomUUID(), ids[0]), { code: "42501" });
      const canceled = await order(bob, [ids[2]]);
      await service((tx: Transaction) => tx.query("select teorema_cancel_order($1,$2,'Synthetic cancellation')", [admin, canceled]));
      await assert.rejects(ensure(bob, canceled, ids[2]), { code: "42501" });
      assert.equal((await db.query<{ n: number }>("select count(*)::int n from pdf_licenses")).rows[0].n, 0);
      await confirm(purchased);
      assert.equal((await db.query<{ n: number }>("select count(*)::int n from pdf_licenses")).rows[0].n, 0, "Confirmation is unchanged: no automatic licensing yet");
    });
    await t.test("retries/parallel requests reuse one license per purchased PDF", async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => ensure(alice, purchased, ids[0])));
      license = results[0];
      assert.ok(results.every(row => row.id === license.id && row.license_code === license.license_code));
      const second = await ensure(alice, purchased, ids[1]);
      assert.notEqual(second.id, license.id); assert.notEqual(second.license_code, license.license_code);
      assert.equal((await db.query<{ n: number }>("select count(*)::int n from pdf_licenses")).rows[0].n, 2);
      grant = (await db.query<{ id: string }>("select id from access_grants where order_item_id=$1", [license.order_item_id])).rows[0].id;
      await assert.rejects(ensure(alice, purchased, ids[2]), { code: "42501" });
      await assert.rejects(ensure(alice, purchased, ids[0], "LIC-short"), { code: "22023" });
      await assert.rejects(ensure(alice, purchased, ids[0], null as unknown as string), { code: "22023" });
    });
    await t.test("constraints reject duplicate origin and the guard prevents identity changes", async () => {
      const insert = (owner: string, product: string, item: string, code: string) => service((tx: Transaction) => tx.query(
        "insert into pdf_licenses(user_id,product_id,order_id,order_item_id,license_code) values($1,$2,$3,$4,$5)", [owner, product, purchased, item, code]));
      await assert.rejects(insert(alice, ids[0], license.order_item_id, generateLicenseCode()), { code: "23505" });
      await assert.rejects(insert(bob, ids[0], license.order_item_id, generateLicenseCode()), { code: "42501" });
      await assert.rejects(insert(alice, ids[2], license.order_item_id, generateLicenseCode()), { code: "42501" });
      for (const [column, value] of [["user_id", bob], ["product_id", ids[2]], ["order_id", randomUUID()], ["order_item_id", randomUUID()], ["id", randomUUID()], ["license_code", generateLicenseCode()], ["created_at", new Date(0).toISOString()]]) {
        await assert.rejects(service((tx: Transaction) => tx.query(`update pdf_licenses set ${column}=$1 where id=$2`, [value, license.id])), { code: "23514" });
      }
      await assert.rejects(service((tx: Transaction) => tx.query("delete from pdf_licenses where id=$1", [license.id])), /permission denied/);
      const covering = (await db.query<{ indexdef: string }>("select indexdef from pg_indexes where schemaname='public' and indexname='pdf_licenses_item_owner_idx'")).rows[0];
      assert.match(covering.indexdef, /\(order_item_id, user_id, product_id\)/);
    });
    await t.test("revoked licenses are not recreated/reactivated; grant revocation remains authoritative", async () => {
      await service((tx: Transaction) => tx.query("update pdf_licenses set status='revoked' where id=$1", [license.id]));
      const revoked = await ensure(alice, purchased, ids[0]);
      assert.equal(revoked.id, license.id); assert.equal(revoked.license_code, license.license_code);
      assert.equal(revoked.status, "revoked"); assert.ok(revoked.revoked_at);
      await revokeGrant(grant);
      await assert.rejects(ensure(alice, purchased, ids[0]), { code: "42501" });
      await assert.rejects(service((tx: Transaction) => tx.query("update pdf_licenses set status='active' where id=$1", [license.id])), { code: "42501" });
      const otherOrder = await order(alice, [ids[0]]); await confirm(otherOrder);
      const other = await ensure(alice, otherOrder, ids[0]);
      assert.notEqual(other.id, license.id); assert.notEqual(other.license_code, license.license_code);
      await assert.rejects(service((tx: Transaction) => tx.query("insert into pdf_licenses(user_id,product_id,order_id,order_item_id,license_code) values($1,$2,$3,$4,$5)", [alice, ids[0], purchased, other.order_item_id, generateLicenseCode()])), { code: "42501" });
      await revokeGrant(grant, "ATIVO");
      assert.equal((await ensure(alice, purchased, ids[0])).status, "revoked");
      const bobOrder = await order(bob, [ids[2]]); await confirm(bobOrder);
      await assert.rejects(ensure(bob, bobOrder, ids[2], other.license_code), { code: "23505" });
      await ensure(bob, bobOrder, ids[2]);
    });
    await t.test("unconfirmed/banned/anonymous accounts cannot issue licenses", async () => {
      await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [alice]);
      await assert.rejects(ensure(alice, purchased, ids[1]), { code: "42501" });
      await db.query("update auth.users set banned_until=null,email_confirmed_at=null where id=$1", [alice]);
      await assert.rejects(ensure(alice, purchased, ids[1]), { code: "42501" });
      await db.query("update auth.users set email_confirmed_at=now(),is_anonymous=true where id=$1", [alice]);
      await assert.rejects(ensure(alice, purchased, ids[1]), { code: "42501" });
      await db.query("update auth.users set is_anonymous=false where id=$1", [alice]);
    });
    await t.test("RLS isolates customers and blocks client writes/RPC, even with accidental broad policies", async () => {
      await db.exec("grant select,insert,update,delete on pdf_licenses to anon,authenticated; create policy fixture_broad on pdf_licenses for all to anon,authenticated using(true) with check(true)");
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [alice]);
        const rows = (await db.query<{ user_id: string }>("select user_id from pdf_licenses")).rows;
        if (role === "anon") assert.equal(rows.length, 0);
        else { assert.equal(rows.length, 3); assert.ok(rows.every(row => row.user_id === alice)); }
        await assert.rejects(db.query("select teorema_get_or_create_pdf_license($1,$2,$3,$4)", [alice, purchased, ids[0], generateLicenseCode()]), /permission denied/);
        await assert.rejects(db.query("insert into pdf_licenses(user_id,product_id,order_id,order_item_id,license_code) values($1,$2,$3,$4,$5)", [alice, ids[0], purchased, license.order_item_id, generateLicenseCode()]), /Trusted server|row-level security/);
        assert.equal((await db.query("update pdf_licenses set status='active' returning id")).rows.length, 0);
        assert.equal((await db.query("delete from pdf_licenses returning id")).rows.length, 0);
        await db.exec("reset role");
      }
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [bob]);
      assert.equal((await db.query<{ user_id: string }>("select user_id from pdf_licenses")).rows.length, 1);
      await db.exec("reset role");
      assert.equal((await db.query<{ public: boolean }>("select public from storage.buckets where id='teorema-pdfs'")).rows[0].public, false);
      assert.equal((await service((tx: Transaction) => tx.query<{ value: { bucket_id: string } }>("select teorema_resolve_pdf($1,$2) as value", [alice, ids[1]]))).rows[0].value.bucket_id, "teorema-pdfs");
    });
  } finally { await db.close(); }
});
