import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

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
for (const path of ["/api/profile", "/api/admin/dashboard?section=users", "/api/admin/products?includeArchived=false", "/api/admin/products?includeArchived=true"]) {
  const response = await get(path);
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
}
// Authorized release reaches authentication, not the old Production-only 404.
// No cookies, valid signup, real purchase, upload or payment are submitted here.
for (const path of ["/meus-materiais", "/pedidos"]) {
  const response = await get(path);
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") || "", /^\/login\?next=/);
}
for (const path of ["/api/cart", "/api/orders", "/api/library", "/api/library/download", "/api/admin/orders", "/api/admin/access", "/api/admin/pdf-licenses"]) {
  const post = path === "/api/orders" || path.endsWith("download");
  // Orders validate shape before Auth. Use synthetic IDs without any cookie so
  // the request reaches, and is denied by, Auth before a write can be attempted.
  const body = path === "/api/orders" ? JSON.stringify({ operationId: randomUUID(), cartId: randomUUID(),
    totalCents: 1, items: [{ id: randomUUID(), priceCents: 1 }] }) : "{}";
  const response = await get(path, post ? { method: "POST", headers: { origin: base, "content-type": "application/json" }, body } : {});
  assert.equal(response.status, 401, path + " must require authentication after release");
  assert.match(response.headers.get("cache-control") || "", /no-store/);
}
const selection = await get("/api/catalog/selection", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: '{"ids":[]}' });
assert.equal(selection.status, 200, "Catalog selection must be available without granting access");
assert.deepEqual(await selection.json(), { states: {}, cartIds: [] });
console.log("Fluxo comercial disponível; APIs de compras/download/admin exigem autenticação.");
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
