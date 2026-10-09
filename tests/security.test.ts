import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson, privateJson } from "../lib/http";
import { verifiedAdmin, ADMIN_EMAIL } from "../lib/auth-policy";
import { signupSchema } from "../lib/schemas";
import { securityHeaders, headerRules } from "../config/security-headers.mjs";

test("administrator reads require the private UUID eligibility, not email alone", async () => {
  const user = { id: "test-uuid", email: ADMIN_EMAIL, email_confirmed_at: "2026-01-01" };
  let checked = "";
  assert.equal(await verifiedAdmin(user, async id => { checked = id; return { data: true, error: null }; }), true);
  assert.equal(checked, user.id);
  assert.equal(await verifiedAdmin(user, async () => ({ data: null, error: { code: "42501" } })), false);
  assert.equal(await verifiedAdmin(user, async () => ({ data: "true", error: null })), false);
  await assert.rejects(() => verifiedAdmin(user, async () => ({ data: null, error: { code: "PGRST000" } })));
  const forbidden = async () => { throw new Error("Checker must not run"); };
  for (const visitor of [null, { ...user, email: "student@example.test" }, { ...user, email_confirmed_at: undefined }, { ...user, is_anonymous: true }]) {
    assert.equal(await verifiedAdmin(visitor, forbidden), false);
  }
});

test("signup rejects injected admin/identity attributes", () => {
  const input = { fullName: "João da Silva", email: "fixture@example.test", password: "fixture123", cpf: "52998224725", phone: "48900000000" };
  assert.equal(signupSchema.safeParse(input).success, true);
  for (const extra of [{ role: "admin" }, { id: "other-uuid" }, { email_confirmed_at: "2026-01-01" }, { user_metadata: { admin: true } }]) {
    assert.equal(signupSchema.safeParse({ ...input, ...extra }).success, false);
  }
});

test("JSON writes enforce same-origin, exact media type and bounded streamed bytes", async () => {
  const make = (body: string, headers: Record<string, string> = {}) => new Request("https://site.example/api/test", {
    method: "POST", headers: { origin: "https://site.example", "content-type": "application/json", ...headers }, body,
  });
  assert.deepEqual(await readJson(make('{"valid":true}', { "content-type": "Application/JSON; charset=utf-8" })), { valid: true });
  const invalidHeaders: Record<string, string>[] = [{ origin: "https://evil.example" }, { origin: "null" }, { "content-type": "text/plain" }, { "content-type": "application/json-evil" }];
  for (const headers of invalidHeaders) {
    await assert.rejects(() => readJson(make("{}", headers)));
  }
  await assert.rejects(() => readJson(new Request("https://site.example/api/test", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })));
  await assert.rejects(() => readJson(make("{broken")));
  await assert.rejects(() => readJson(make("x".repeat(10001))));
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode("x".repeat(5000))); controller.enqueue(new TextEncoder().encode("x".repeat(5001))); controller.close();
  } });
  const streamed = new Request("https://site.example/api/test", {
    method: "POST", headers: { origin: "https://site.example", "content-type": "application/json", "content-length": "1" },
    body: stream, duplex: "half",
  } as RequestInit);
  await assert.rejects(() => readJson(streamed));
  for (const status of [200, 400, 401, 403, 404, 409, 429, 503]) assert.equal(privateJson({}, status).headers.get("cache-control"), "private, no-store");
});

test("browser policy restricts external sources without leaking configuration secrets", () => {
  const prod = Object.fromEntries(securityHeaders({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" }).map(h => [h.key, h.value]));
  assert.equal(prod["Referrer-Policy"], "no-referrer");
  assert.equal(prod["X-Frame-Options"], "DENY"); assert.equal(prod["X-Content-Type-Options"], "nosniff");
  assert.match(prod["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.match(prod["Content-Security-Policy"], /object-src 'none'/);
  assert.match(prod["Content-Security-Policy"], /https:\/\/example.storage.supabase.co/);
  assert.ok(!/unsafe-eval|ws:|https:;/.test(prod["Content-Security-Policy"]));
  for (const value of ["https://user:password@example.supabase.co", "https://example.supabase.co/?token=private", "http://127.0.0.1:5000"]) {
    assert.throws(() => securityHeaders({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: value }));
  }
  assert.doesNotThrow(() => securityHeaders({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:5000" }));
  const privateRules = headerRules({ NODE_ENV: "production" }).filter(r => r.headers.some(h => h.key === "X-Robots-Tag"));
  for (const route of ["/login", "/cadastro", "/admin/:path*", "/auth/:path*", "/api/:path*", "/pedidos/:path*", "/meus-materiais/:path*"]) {
    assert.ok(privateRules.some(r => r.source === route));
  }
  assert.ok(!privateRules.some(r => r.source === "/:path*"), "Public pages can remain indexable in production");
  assert.ok(headerRules({ NODE_ENV: "production", VERCEL_ENV: "preview" }).some(r => r.source === "/:path*" && r.headers.some(h => h.key === "X-Robots-Tag")));
});
