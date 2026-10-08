import assert from "node:assert/strict";

const base = process.env.TEST_BASE_URL || "http://localhost:3100";
const get = (path, options = {}) => fetch(base + path, { redirect: "manual", ...options });
for (const path of ["/", "/login", "/cadastro", "/api/profile", "/auth/callback", "/meus-materiais"]) {
  const response = await get(path);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("content-security-policy") || "", /object-src 'none'/);
  assert.ok(!response.headers.has("x-powered-by"));
  if (path !== "/") assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
}
for (const path of ["/perfil", "/admin", "/carrinho"]) {
  const response = await get(path);
  assert.equal(response.status, 307, path + " must redirect anonymous visitors");
  assert.match(response.headers.get("location") || "", /^\/login\?next=/);
  console.log(path + ": visitante redirecionado");
}
for (const path of ["/api/profile", "/api/admin/dashboard?section=users"]) {
  const response = await get(path);
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
}
// The commercial flow remains gated in a production build, even with flags true.
assert.equal((await get("/meus-materiais")).status, 404);
for (const path of ["/api/library", "/api/library/download"]) {
  const response = await get(path, path.endsWith("download") ? { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: "{}" } : {});
  assert.equal(response.status, 404); assert.match(response.headers.get("cache-control") || "", /no-store/);
}
console.log("Biblioteca e download: bloqueados em produção");
const oldCookie = await get("/api/admin/dashboard?section=users", { headers: { cookie: "teorema_admin_session=admin.fake.fake" } });
assert.equal(oldCookie.status, 401, "legacy cookie cannot authorize admin");
assert.equal((await get("/api/admin/login", { method: "POST" })).status, 410);
assert.equal((await get("/api/admin/registrations")).status, 410);
const invalidSignup = await get("/api/register", {
  method: "POST", headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email: "fixture@example.test", password: "fixture123", cpf: "11111111111", phone: "48999999999" }),
});
assert.equal(invalidSignup.status, 400, "invalid CPF must be rejected before Auth signup");
const foreignOrigin = await get("/api/register", {
  method: "POST", headers: { "content-type": "application/json", origin: "https://other.example" }, body: "{}",
});
assert.equal(foreignOrigin.status, 400);
const callback = await get("/auth/callback?next=https://other.example");
const callbackTarget = new URL(callback.headers.get("location") || "", base);
assert.equal(callbackTarget.origin, new URL(base).origin);
assert.equal(callbackTarget.pathname, "/login");
assert.equal(callbackTarget.searchParams.get("confirmation"), "invalid");
assert.equal(callbackTarget.searchParams.get("next"), "/carrinho", "External target must use the existing safe fallback");
assert.equal((await get("/")).status, 200);
const home = await (await get("/")).text();
assert.match(home, /Fale conosco e escolha o/);
assert.ok(!home.includes('name="cpf"'), "home should not collect CPF");
const catalog = await get("/materiais");
assert.equal(catalog.status, 200);
console.log("APIs privadas, cookie legado, CPF, origem e contato: OK.");
