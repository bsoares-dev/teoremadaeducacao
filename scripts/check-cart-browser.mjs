// Next + real migration/RPC SQL in PGlite. Auth/REST/Storage transport is local only.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { cartDatabase } from "./fixtures/cart-database.mjs";
import { fixtureSelect, fixtureTables } from "./fixtures/rest-select.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const { db, users, ids, service } = await cartDatabase();
const origin = "http://localhost:3105", api = "http://127.0.0.1:54142", serviceKey = "local-service-fixture";
const sessions = users.map(user => {
  const record = { ...user, aud: "authenticated", role: "authenticated", email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(), is_anonymous: false };
  const exp = Math.floor(Date.now() / 1000) + 7200;
  return { access_token: `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp, role: "authenticated", aud: "authenticated" })).toString("base64url")}.local-fixture`, refresh_token: "local-refresh", expires_at: exp, expires_in: 7200, token_type: "bearer", user: record };
});
let dropResponse = false, droppedOperation = null;
let dropOrderResponse = false;
let dropDecisionResponse = false;
const signedDownloads = new Map();
let pdfCacheControl = "max-age=0";
const fixture = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-supabase-api-version");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url, api), token = req.headers.authorization?.replace(/^Bearer /i, "");
  const session = sessions.find(session => session.access_token === token);
  let text = ""; for await (const chunk of req) text += chunk;
  const body = text ? JSON.parse(text) : {};
  try {
    if (url.pathname === "/auth/v1/user") {
      res.writeHead(session ? 200 : 401); res.end(JSON.stringify(session?.user || { message: "No session", code: "session_not_found" })); return;
    }
    if (url.pathname === "/auth/v1/token") {
      const selected = body.auth_code ? sessions[1] : sessions.find(session => session.user.email === body.email);
      res.writeHead(selected ? 200 : 400); res.end(JSON.stringify(selected || { message: "Invalid fixture login" })); return;
    }
    if (url.pathname === "/auth/v1/signup") { res.end(JSON.stringify({ user: sessions[1].user })); return; }
    if (url.pathname === "/auth/v1/verify") { res.end(JSON.stringify(sessions[1])); return; }
    if (url.pathname === "/auth/v1/logout") { res.writeHead(204); res.end(); return; }
    if (url.pathname.startsWith("/storage/v1/object/")) {
      const match = url.pathname.match(/^\/storage\/v1\/object\/(info|sign)\/teorema-pdfs\/(.+)$/);
      if (!match) { res.writeHead(404); res.end("{}"); return; }
      const [, action, key] = match;
      if (action === "sign" && req.method === "GET") {
        const ticket = signedDownloads.get(url.searchParams.get("token"));
        if (!ticket || ticket.key !== key || ticket.expiresAt <= Date.now()) { res.writeHead(403); res.end('{"message":"Expired fixture URL"}'); return; }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${url.searchParams.get('download') || 'material.pdf'}"`);
        res.setHeader("Cache-Control", "private, no-store");
        const pdf = Buffer.alloc(100, 32); pdf.write("%PDF-1.7\nFixture download only\n%%EOF"); res.end(pdf); return;
      }
      assert.equal(token, serviceKey, "Storage metadata/signing must use server credentials");
      const file = (await service(tx => tx.query("select f.size_bytes from product_files f join storage.objects o on o.bucket_id=f.bucket_id and o.name=f.object_key where f.object_key=$1", [key]))).rows[0];
      if (!file) { res.writeHead(404); res.end('{"message":"Missing fixture object"}'); return; }
      if (action === "info") { res.end(JSON.stringify({ size: Number(file.size_bytes), content_type: "application/pdf", cache_control: pdfCacheControl })); return; }
      assert.equal(req.method, "POST"); assert.equal(body.expiresIn, 60);
      const signedToken = crypto.randomUUID(); signedDownloads.set(signedToken, { key, expiresAt: Date.now() + 60000 });
      res.end(JSON.stringify({ signedURL: `/object/sign/teorema-pdfs/${key}?token=${signedToken}` })); return;
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      assert.equal(token, serviceKey, "RPC must use server credentials");
      let value;
      if (url.pathname.endsWith("/teorema_read_library")) value = await service(async tx => (await tx.query("select teorema_read_library($1,$2) as value", [body.p_user_id, body.p_page])).rows[0].value);
      else if (url.pathname.endsWith("/teorema_resolve_pdf")) value = await service(async tx => (await tx.query("select teorema_resolve_pdf($1,$2) as value", [body.p_user_id, body.p_product_id])).rows[0].value);
      else if (url.pathname.endsWith("/teorema_read_cart")) value = await service(async tx => (await tx.query("select teorema_read_cart($1) as value", [body.p_user_id])).rows[0].value);
      else if (url.pathname.endsWith("/teorema_sync_cart")) {
        value = await service(async tx => (await tx.query("select teorema_sync_cart($1,$2,$3,$4,$5,$6) as value", [body.p_user_id, body.p_operation_id, body.p_cart_id, body.p_revision, body.p_add_ids, body.p_remove_ids])).rows[0].value);
        if (dropResponse || droppedOperation === body.p_operation_id) {
          dropResponse = false; droppedOperation = body.p_operation_id;
          res.writeHead(503); res.end(JSON.stringify({ message: "Simulated lost response after commit", code: "08006" })); return;
        }
      } else if (url.pathname.endsWith("/teorema_create_order")) {
        value = await service(async tx => (await tx.query("select teorema_create_order($1,$2,$3,$4,$5) as value", [body.p_user_id, body.p_cart_id, body.p_idempotency_key, body.p_expected_total, JSON.stringify(body.p_expected_prices)])).rows[0].value);
        if (dropOrderResponse) { res.writeHead(503); res.end(JSON.stringify({ code: "08006", message: "Lost order response" })); return; }
      } else if (url.pathname.endsWith("/teorema_admin_check")) {
        value = await service(async tx => (await tx.query("select teorema_admin_check($1) as value", [body.p_actor_id])).rows[0].value);
      } else if (url.pathname.endsWith("/teorema_confirm_order")) {
        value = await service(async tx => (await tx.query("select teorema_confirm_order($1,$2) as value", [body.p_actor_id, body.p_order_id])).rows[0].value);
        if (dropDecisionResponse) { res.writeHead(503); res.end(JSON.stringify({ code: "08006", message: "Lost confirmation response" })); return; }
      } else if (url.pathname.endsWith("/teorema_cancel_order")) {
        value = await service(async tx => (await tx.query("select teorema_cancel_order($1,$2,$3) as value", [body.p_actor_id, body.p_order_id, body.p_reason])).rows[0].value);
      } else if (url.pathname.endsWith("/teorema_set_access_state")) {
        value = await service(async tx => (await tx.query("select teorema_set_access_state($1,$2,$3,$4,$5) as value", [body.p_actor_id, body.p_grant_id, body.p_state, body.p_reason, body.p_operation_id])).rows[0].value);
      } else throw new Error("Unknown fixture RPC");
      res.end(JSON.stringify(value)); return;
    }
    if (["/rest/v1/products", "/rest/v1/carts", "/rest/v1/cart_items", ...fixtureTables.map(t => "/rest/v1/" + t)].includes(url.pathname)) {
      const rows = await db.transaction(async tx => {
        await tx.exec(`set local role ${token === serviceKey ? "service_role" : session ? "authenticated" : "anon"}`);
        if (session) await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [session.user.id]);
        if (fixtureTables.includes(url.pathname.split("/").at(-1))) return fixtureSelect(tx, url, res, req.headers.accept?.includes("vnd.pgrst.object"));
        if (url.pathname.endsWith("/carts")) return (await tx.query("select id from carts where status='OPEN' order by created_at limit 1")).rows[0] || null;
        if (url.pathname.endsWith("/cart_items")) return (await tx.query("select product_id from cart_items where cart_id=$1 limit 50", [url.searchParams.get("cart_id").slice(3)])).rows;
        assert.equal(url.searchParams.has("publication_status"), false, "Column must not require extra client grants");
        let data = (await tx.query("select id,name,description,price,image_url from products where is_active=true order by id")).rows;
        const filtered = url.searchParams.get("id"); if (filtered) data = data.filter(item => filtered.includes(item.id));
        res.setHeader("Content-Range", `0-${Math.max(0, data.length - 1)}/${data.length}`);
        return url.searchParams.get("select") === "id" ? data.map(item => ({ id: item.id })) : data;
      });
      res.end(JSON.stringify(rows)); return;
    }
    res.writeHead(404); res.end("{}");
  } catch (error) { res.writeHead(error.code ? 400 : 500); res.end(JSON.stringify({ code: error.code || "FIXTURE", message: error.message })); }
});
await new Promise(resolve => fixture.listen(54142, "127.0.0.1", resolve));
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3105"], {
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "development", VERCEL_ENV: "preview",
    TEOREMA_CATALOG_SELECTION_ENABLED: "true", TEOREMA_CART_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: api,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-public-fixture", SUPABASE_SERVICE_ROLE_KEY: serviceKey },
});
let output = "", browser;
child.stdout.on("data", chunk => { output = (output + chunk.toString()).slice(-7000); });
child.stderr.on("data", chunk => { output = (output + chunk.toString()).slice(-7000); });
try {
  for (let i = 0; i < 120 && !output.includes("Ready in"); i++) {
    if (child.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(60000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", req => console.error("Fixture request failed:", new URL(req.url()).pathname, req.failure()?.errorText));
  page.on("console", msg => { if (msg.type() === "error") console.error("Browser:", msg.text()); });
  page.on("request", req => { if (req.url().startsWith(api + "/auth/")) console.log("Local Auth request:", req.method(), new URL(req.url()).pathname); });
  page.on("response", res => { if (res.url().startsWith(api + "/auth/")) console.log("Local Auth response:", res.status(), new URL(res.url()).pathname); });
  async function login(email) {
    // Navigation can expose the server-rendered form before React hydration.
    await page.waitForFunction(() => [...document.querySelectorAll('a')].some(a => a.textContent === 'Ainda não tenho uma conta' && a.getAttribute('href').includes('next=')));
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill("fixture-password-only");
    await page.getByRole("button", { name: /Entrar/ }).click();
    assert.equal(await page.locator("form").evaluate(form => form.checkValidity()), true, "Fixture form must be valid before submitting");
    await Promise.race([
      page.waitForURL("**/carrinho"),
      page.locator(".auth-feedback").waitFor().then(async () => { throw new Error("Fixture login: " + await page.locator(".auth-feedback").innerText()); }),
    ]);
    await page.getByRole("button", { name: "Atualizar e recuperar seleção", exact: true }).waitFor();
  }
  async function ready() { await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent === 'Atualizar e recuperar seleção'); return b && !b.disabled && (document.querySelector('.pdf-cart-empty') || document.querySelector('.pdf-cart-layout')); }); }
  await page.goto(origin + "/materiais");
  await page.getByRole("button", { name: "Adicionar ao carrinho: Material de estudo 1", exact: true }).click();
  await page.getByText("1 material selecionado", { exact: true }).waitFor();
  await page.getByRole("link", { name: /Ir para o carrinho/ }).click();
  await page.waitForURL("**/login?next=**");
  await page.getByRole("link", { name: "Ainda não tenho uma conta", exact: true }).click();
  await page.waitForURL("**/cadastro?next=**");
  await page.getByRole("link", { name: "Já tenho uma conta", exact: true }).click();
  await login("alice@example.test"); await ready();
  assert.equal(await page.locator(".pdf-cart-item").count(), 1);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("teorema:pdf-selection:v1")).ids), []);
  await page.reload(); await ready(); assert.equal(await page.locator(".pdf-cart-item").count(), 1);
  await page.getByRole("link", { name: /Continuar escolhendo/ }).click();
  await page.getByRole("button", { name: "Adicionar ao carrinho: Material de estudo 2", exact: true }).click();
  await page.getByText("2 materiais selecionados", { exact: true }).waitFor();
  dropResponse = true;
  await page.getByRole("link", { name: /Ir para o carrinho/ }).click();
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).waitFor(); await ready();
  assert.ok(await page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith("teorema:cart-pending:"))));
  droppedOperation = null;
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click(); await ready();
  assert.equal(await page.locator(".pdf-cart-item").count(), 2);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("teorema:pdf-selection:v1")).ids), []);
  await service(tx => tx.query("update products set price=41.23 where id=$1", [ids[0]]));
  await page.getByRole("button", { name: "Atualizar e recuperar seleção", exact: true }).click(); await ready();
  await page.getByText(/Preço atualizado: de/).waitFor();
  assert.match(await page.locator(".pdf-cart-total").innerText(), /81,13/);
  await mkdir(".data/cart-check", { recursive: true });
  await page.screenshot({ path: ".data/cart-check/desktop.png", fullPage: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow ${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".data/cart-check/mobile.png", fullPage: true });
  await service(tx => tx.query("update products set is_active=false,publication_status='UNPUBLISHED' where id=$1", [ids[1]]));
  await page.getByRole("button", { name: "Atualizar e recuperar seleção", exact: true }).click(); await ready();
  await page.getByText("Indisponível para novas compras. Remova para continuar.").waitFor();
  assert.match(await page.locator(".pdf-cart-total").innerText(), /41,23/);
  await page.getByRole("button", { name: "Remover Material de estudo 2", exact: true }).click(); await ready();
  assert.equal(await page.locator(".pdf-cart-item").count(), 1);
  await page.getByRole("button", { name: "Sair", exact: true }).click(); await page.waitForURL("**/login");
  await page.goto(origin + "/login?next=/carrinho"); await login("bob@example.test"); await ready();
  await page.getByRole("heading", { name: "Um espaço para novas descobertas." }).waitFor();
  await page.getByRole("button", { name: "Sair", exact: true }).click(); await page.waitForURL("**/login");
  await page.goto(origin + "/login?next=/carrinho"); await login("alice@example.test"); await ready();
  assert.equal(await page.locator(".pdf-cart-item").count(), 1);
  // Expired session leaves the server cart intact and brings the user back to login.
  await context.clearCookies(); await page.reload(); await page.waitForURL("**/login?next=**");
  await page.goto(origin + "/auth/confirm?token_hash=fixture-token&type=signup&next=/carrinho");
  await page.waitForURL("**/carrinho"); await ready();
  assert.equal(await page.locator(".pdf-cart-item").count(), 1);
  const forged = await context.request.post(origin + "/api/cart", { headers: { Origin: origin }, data: { userId: users[2].id, price: 1 } });
  assert.equal(forged.status(), 400);
  // Popup blocked: the saved order must still provide a usable WhatsApp link.
  await page.evaluate(() => { window.open = () => null; });
  await page.getByRole("button", { name: "Revisar pedido", exact: true }).click();
  await service(tx => tx.query("update products set price=42.34 where id=$1", [ids[0]]));
  await page.getByRole("button", { name: "Registrar pedido e falar no WhatsApp", exact: true }).click();
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).waitFor();
  assert.equal((await db.query("select count(*)::int as n from orders")).rows[0].n, 0);
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click(); await ready();
  await page.getByRole("button", { name: "Revisar pedido", exact: true }).click();
  dropOrderResponse = true;
  await page.getByRole("button", { name: "Registrar pedido e falar no WhatsApp", exact: true }).click();
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).waitFor();
  assert.equal((await db.query("select count(*)::int as n from orders")).rows[0].n, 1);
  assert.ok(await page.evaluate(() => Object.keys(sessionStorage).some(k => k.startsWith("teorema:order-pending:"))));
  dropOrderResponse = false;
  await page.reload(); await page.waitForURL("**/pedidos/*");
  const saved = (await db.query("select id,code,total_amount,status from orders")).rows[0];
  assert.equal(Number(saved.total_amount), 42.34);
  assert.equal(saved.status, "AGUARDANDO_CONFIRMACAO");
  assert.equal((await db.query("select count(*)::int as n from orders")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from access_grants")).rows[0].n, 0);
  const wa = page.locator('a[href^="https://wa.me/"]');
  await wa.waitFor();
  assert.match(new URL(await wa.getAttribute("href")).searchParams.get("text"), /42,34/);
  assert.match(new URL(await wa.getAttribute("href")).searchParams.get("text"), new RegExp(saved.code));
  await mkdir(".data/order-check", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Order overflow ${width}`);
    if (width === 390 || width === 1440) await page.screenshot({ path: `.data/order-check/${width}.png`, fullPage: true });
  }
  await page.getByRole("link", { name: "Meus materiais", exact: true }).click();
  await page.waitForURL("**/meus-materiais"); await page.getByText("Aguardando liberação", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Baixar PDF:/ }).count(), 0);
  assert.equal((await context.request.post(origin + "/api/library/download", { headers: { Origin: origin }, data: { productId: ids[0] } })).status(), 403);
  await page.goto(origin + "/pedidos"); await page.getByText(saved.code, { exact: true }).waitFor();
  assert.equal((await context.request.get(origin + "/api/admin/orders")).status(), 403);
  await context.clearCookies(); await page.goto(origin + "/login?next=/carrinho"); await login("bob@example.test"); await ready();
  const denied = await page.goto(origin + "/pedidos/" + saved.id); assert.equal(denied.status(), 404);
  assert.equal((await context.request.post(origin + "/api/admin/orders/" + saved.id, { headers: { Origin: origin }, data: { action: "confirm", paymentVerified: true } })).status(), 403);
  await page.goto(origin + "/pedidos"); await page.getByText("Nenhum pedido nesta página.", { exact: true }).waitFor();
  await context.clearCookies(); await page.goto(origin + "/login?next=/carrinho"); await login("bernardozsoares11@gmail.com"); await ready();
  const adminOrders = await context.request.get(origin + "/api/admin/orders?code=" + saved.code);
  assert.equal(adminOrders.status(), 200); assert.equal((await adminOrders.json()).items[0].code, saved.code);
  // Another customer's two-PDF order proves the all-items/account boundary.
  const bobCart = await service(async tx => (await tx.query("select teorema_sync_cart($1,$2,null,0,$3,'{}') as value", [users[2].id, crypto.randomUUID(), [ids[0], ids[2]]])).rows[0].value.cart);
  const bobOrder = await service(async tx => (await tx.query("select teorema_create_order($1,$2,$3,$4,$5) as value", [users[2].id, bobCart.id, crypto.randomUUID(), 82.24, JSON.stringify({ [ids[0]]: 42.34, [ids[2]]: 39.90 })])).rows[0].value);
  await page.goto(origin + "/admin");
  await page.getByRole("button", { name: "Pedidos e acessos", exact: true }).click();
  await page.getByRole("button", { name: "Ver pedido", exact: true }).first().waitFor();
  await page.getByLabel("Código do pedido", { exact: true }).fill(saved.code);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.commerce-list article').length === 1);
  await page.getByRole("button", { name: "Ver pedido", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar compra e liberar materiais", exact: true }).click();
  const confirmDialog = page.getByRole("dialog");
  assert.equal(await confirmDialog.getByRole("button", { name: "Confirmar compra e liberar materiais", exact: true }).isDisabled(), true);
  await confirmDialog.getByRole("checkbox").check();
  dropDecisionResponse = true;
  const failedConfirmation = page.waitForResponse(response => response.url() === origin + "/api/admin/orders/" + saved.id && response.request().method() === "POST" && response.status() === 503);
  await confirmDialog.getByRole("button", { name: "Confirmar compra e liberar materiais", exact: true }).click();
  await failedConfirmation;
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Recuperar tentativa' && !button.disabled));
  assert.equal((await db.query("select count(*)::int as n from access_grants where user_id=$1", [users[1].id])).rows[0].n, 1);
  assert.ok(await page.evaluate(() => Object.keys(sessionStorage).some(k => k.startsWith("teorema:admin-decision:"))));
  dropDecisionResponse = false;
  await page.reload(); await page.getByRole("button", { name: "Pedidos e acessos", exact: true }).click();
  await page.getByRole("button", { name: "Recuperar tentativa", exact: true }).click();
  await page.getByRole("button", { name: "Revogar acesso", exact: true }).waitFor();
  assert.equal((await db.query("select count(*)::int as n from admin_audit_events where entity_id=$1 and action='ORDER_CONFIRMED'", [saved.id])).rows[0].n, 1);
  // Two independent API requests serialize through the real transaction RPC.
  const confirmations = await Promise.all([1, 2].map(() => context.request.post(origin + "/api/admin/orders/" + bobOrder, { headers: { Origin: origin }, data: { action: "confirm", paymentVerified: true } })));
  for (const response of confirmations) assert.equal(response.status(), 200);
  assert.equal((await db.query("select count(*)::int as n from access_grants where user_id=$1", [users[2].id])).rows[0].n, 2);
  assert.equal((await db.query("select count(*)::int as n from admin_audit_events where entity_id=$1 and action='ORDER_CONFIRMED'", [bobOrder])).rows[0].n, 1);
  await page.getByRole("button", { name: "Revogar acesso", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Motivo", { exact: true }).fill("Revisão administrativa sintética");
  await page.getByRole("dialog").getByRole("button", { name: "Revogar acesso", exact: true }).click();
  await page.getByRole("button", { name: "Reliberar acesso", exact: true }).waitFor();
  const revoked = (await db.query("select id from access_grants where user_id=$1 and state='REVOGADO'", [users[1].id])).rows[0].id;
  await assert.rejects(service(tx => tx.query("select teorema_resolve_pdf($1,$2)", [users[1].id, ids[0]])), /not authorized/);
  await page.getByRole("button", { name: "Reliberar acesso", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Motivo", { exact: true }).fill("Conferência concluída em teste");
  await page.getByRole("dialog").getByRole("button", { name: "Reliberar acesso", exact: true }).click();
  await page.getByRole("button", { name: "Revogar acesso", exact: true }).waitFor();
  assert.equal((await db.query("select state from access_grants where id=$1", [revoked])).rows[0].state, "ATIVO");
  // Withdraw from catalog without changing buyers' authorizations.
  await service(tx => tx.query("update products set is_active=false,publication_status='UNPUBLISHED' where id=$1", [ids[0]]));
  await service(tx => tx.query("select teorema_resolve_pdf($1,$2)", [users[1].id, ids[0]]));
  await mkdir(".data/admin-commerce-check", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Admin overflow ${width}`);
    if (width === 390 || width === 1440) await page.screenshot({ path: `.data/admin-commerce-check/${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Acessos", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.commerce-list article').length === 3);
  await page.getByLabel("E-mail do cliente", { exact: true }).fill("bob@example.test");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.commerce-list article').length === 2);
  assert.match(await page.locator(".commerce-list").innerText(), /bob@example.test/);
  // Cancellation affects a pending order only, leaves no grants and stores reason.
  const cancelCart = await service(async tx => (await tx.query("select teorema_sync_cart($1,$2,null,0,$3,'{}') as value", [users[0].id, crypto.randomUUID(), [ids[2]]])).rows[0].value.cart);
  const cancelOrder = await service(async tx => (await tx.query("select teorema_create_order($1,$2,$3,39.90,$4) as value", [users[0].id, cancelCart.id, crypto.randomUUID(), JSON.stringify({ [ids[2]]: 39.90 })])).rows[0].value);
  const cancelCode = (await service(tx => tx.query("select code from orders where id=$1", [cancelOrder]))).rows[0].code;
  await page.getByRole("button", { name: "Pedidos", exact: true }).click();
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await page.getByLabel("Código do pedido", { exact: true }).fill(cancelCode);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.waitForFunction(code => document.querySelectorAll('.commerce-list article').length === 1 && document.querySelector('.commerce-list')?.textContent.includes(code), cancelCode);
  await page.getByRole("button", { name: "Ver pedido", exact: true }).click();
  await page.getByRole("button", { name: "Cancelar pedido", exact: true }).click();
  assert.equal(await page.getByRole("dialog").locator("form").evaluate(form => form.checkValidity()), false);
  await page.getByRole("dialog").getByLabel("Motivo", { exact: true }).fill("Solicitação sintética do cliente");
  const cancelResponse = page.waitForResponse(response => response.url() === origin + "/api/admin/orders/" + cancelOrder && response.request().method() === "POST");
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar pedido", exact: true }).click();
  const canceled = await cancelResponse;
  assert.equal(canceled.status(), 200); assert.equal((await canceled.json()).order.status, "CANCELADO");
  assert.equal((await db.query("select count(*)::int as n from access_grants where user_id=$1", [users[0].id])).rows[0].n, 0);
  assert.equal((await context.request.post(origin + "/api/admin/orders/" + cancelOrder, { headers: { Origin: "https://other.test" }, data: { action: "cancel", reason: "Teste de origem" } })).status(), 400);
  assert.equal((await context.request.post(origin + "/api/admin/orders/" + cancelOrder, { headers: { Origin: origin }, data: { action: "confirm", paymentVerified: true, actorId: users[0].id } })).status(), 400);
  assert.equal((await context.request.post(origin + "/api/admin/orders/" + bobOrder, { headers: { Origin: origin }, data: { action: "access", grantId: revoked, state: "REVOGADO", reason: "Origem errada em teste", operationId: crypto.randomUUID() } })).status(), 404);
  assert.equal((await context.request.get(origin + "/api/admin/orders?status=PAID")).status(), 400);
  const confirmedFilter = await context.request.get(origin + "/api/admin/orders?status=CONFIRMADO&email=bob%40example.test");
  assert.equal(confirmedFilter.status(), 200); assert.equal((await confirmedFilter.json()).total, 1);
  assert.equal((await (await context.request.get(origin + "/api/admin/orders?email=missing%40example.test")).json()).total, 0);
  assert.equal((await (await context.request.get(origin + "/api/admin/orders?page=2")).json()).items.length, 0);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
  // A corrupted recovery journal must not permit a fresh, ambiguous decision.
  await page.evaluate(actor => sessionStorage.setItem('teorema:admin-decision:v1:' + actor, '{broken'), users[0].id);
  await page.reload(); await page.getByRole("button", { name: "Pedidos e acessos", exact: true }).click();
  await page.getByText(/Tentativa pendente ilegível/).waitFor();
  await page.getByLabel("Código do pedido", { exact: true }).fill(saved.code);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.waitForFunction(code => document.querySelectorAll('.commerce-list article').length === 1 && document.querySelector('.commerce-list')?.textContent.includes(code), saved.code);
  await page.getByRole("button", { name: "Ver pedido", exact: true }).click();
  await page.getByRole("button", { name: "Revogar acesso", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Revogar acesso", exact: true }).isDisabled(), true);
  console.log("PASS stage 7: verified admin, payment checkbox, lost confirmation recovery after reload, one audit/no duplicate grants, all PDFs for correct customer, revoke/restore, unpublished access preserved, customer filter, cancel without grants, forged actor/origin/foreign grant rejected, responsive dashboard.");
  // Stage 8: account -> own library -> server authorization -> short Storage link.
  await context.clearCookies(); await page.goto(origin + "/login?next=/carrinho"); await login("alice@example.test"); await ready();
  await page.goto(origin + "/perfil"); await page.locator('a[href="/meus-materiais"]').click();
  await page.waitForURL("**/meus-materiais");
  await page.getByRole("button", { name: "Baixar PDF: Material de estudo 1", exact: true }).waitFor();
  assert.equal(await page.locator(".library-grid article").count(), 1);
  const ownLibrary = await context.request.get(origin + "/api/library");
  assert.equal(ownLibrary.status(), 200); assert.match(ownLibrary.headers()["cache-control"], /no-store/);
  assert.doesNotMatch(await ownLibrary.text(), /object_key|bucket_id|sha256|reason|granted_by|cpf|token/);
  const ticketResponse = await context.request.post(origin + "/api/library/download", { headers: { Origin: origin }, data: { productId: ids[0] } });
  assert.equal(ticketResponse.status(), 200, ticketResponse.status() === 200 ? undefined : await ticketResponse.text()); assert.match(ticketResponse.headers()["cache-control"], /no-store/);
  const ticket = await ticketResponse.json();
  assert.equal(ticket.version, 1); assert.ok(Date.parse(ticket.expiresAt) - Date.now() <= 60000);
  assert.equal((await context.request.get(ticket.url)).status(), 200);
  assert.equal((await context.request.post(origin + "/api/library/download", { headers: { Origin: origin }, data: { productId: ids[2] } })).status(), 403);
  assert.equal((await context.request.post(origin + "/api/library/download", { headers: { Origin: origin }, data: { productId: ids[0], userId: users[2].id } })).status(), 400);
  assert.equal((await context.request.post(origin + "/api/library/download", { headers: { Origin: "https://other.test" }, data: { productId: ids[0] } })).status(), 400);
  assert.equal((await context.request.get(origin + "/api/library/download")).status(), 405);
  async function downloadFromCard(version) {
    const transfer = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar PDF: Material de estudo 1", exact: true }).click();
    const downloaded = await transfer;
    assert.equal(downloaded.suggestedFilename(), "Material-de-estudo-1.pdf");
    assert.equal(await downloaded.failure(), null);
    assert.match(page.url(), /\/meus-materiais$/);
    await page.getByText(/Download solicitado/).waitFor();
    assert.match(await page.locator(".library-grid").innerText(), new RegExp(`Versão ${version}`));
  }
  await downloadFromCard("1.0");
  const updatedFile = crypto.randomUUID(), updatedKey = `products/${ids[0]}/${updatedFile}.pdf`;
  await service(async tx => {
    await tx.query("update product_files set is_current=false where product_id=$1", [ids[0]]);
    await tx.query("insert into product_files(id,product_id,version,version_label,object_key,size_bytes,mime_type,sha256,validation_status,validated_at,is_current,uploaded_by) values($1,$2,2,'2.0',$3,100,'application/pdf',$4,'VALIDATED',now(),true,$5)", [updatedFile, ids[0], updatedKey, "b".repeat(64), users[0].id]);
    await tx.query("insert into storage.objects(bucket_id,name) values('teorema-pdfs',$1)", [updatedKey]);
  });
  await page.getByRole("button", { name: "Atualizar biblioteca", exact: true }).click();
  await page.getByText(/Versão 2.0/).waitFor(); await downloadFromCard("2.0");
  const currentTicket = await (await context.request.post(origin + "/api/library/download", { headers: { Origin: origin }, data: { productId: ids[0] } })).json();
  assert.ok(new URL(currentTicket.url).pathname.endsWith(updatedFile + ".pdf"));
  const issued = signedDownloads.size; pdfCacheControl = "max-age=3600";
  assert.equal((await context.request.post(origin + "/api/library/download", { headers: { Origin: origin }, data: { productId: ids[0] } })).status(), 503);
  assert.equal(signedDownloads.size, issued, "Unsafe cache must not receive a signed link"); pdfCacheControl = "max-age=0";
  await db.query("delete from storage.objects where name=$1", [updatedKey]);
  await page.getByRole("button", { name: "Atualizar biblioteca", exact: true }).click();
  await page.getByText(/Você possui acesso, mas o arquivo está temporariamente indisponível/).waitFor();
  assert.equal(await page.getByRole("button", { name: /Baixar PDF:/ }).count(), 0);
  assert.equal((await context.request.post(origin + "/api/library/download", { headers: { Origin: origin }, data: { productId: ids[0] } })).status(), 503);
  await db.query("insert into storage.objects(bucket_id,name) values('teorema-pdfs',$1)", [updatedKey]);
  await page.getByRole("button", { name: "Atualizar biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Baixar PDF: Material de estudo 1", exact: true }).waitFor();
  await service(tx => tx.query("select teorema_set_access_state($1,$2,'REVOGADO','Teste de autorização na biblioteca',$3)", [users[0].id, revoked, crypto.randomUUID()]));
  await page.getByRole("button", { name: "Baixar PDF: Material de estudo 1", exact: true }).click();
  const libraryError = page.locator('.library [role="alert"]');
  await libraryError.waitFor(); assert.match(await libraryError.innerText(), /autorização ativa/);
  assert.equal(await page.getByRole("button", { name: /Baixar PDF:/ }).count(), 0);
  await page.getByRole("button", { name: "Atualizar biblioteca", exact: true }).click();
  await page.getByText("Acesso revogado", { exact: true }).waitFor();
  // An already issued bearer link is not recalled by revocation. Its TTL still applies.
  assert.equal((await context.request.get(currentTicket.url)).status(), 200);
  signedDownloads.get(new URL(currentTicket.url).searchParams.get("token")).expiresAt = Date.now() - 1;
  assert.equal((await context.request.get(currentTicket.url)).status(), 403);
  await context.clearCookies(); await page.goto(origin + "/login?next=/carrinho"); await login("bob@example.test"); await ready();
  await page.goto(origin + "/meus-materiais");
  await page.getByRole("button", { name: "Baixar PDF: Material de estudo 3", exact: true }).waitFor();
  assert.equal(await page.locator(".library-grid article").count(), 2);
  assert.equal(await page.getByText("Acesso revogado", { exact: true }).count(), 0);
  await mkdir(".data/library-check", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Library overflow ${width}`);
    if (width === 390 || width === 1440) await page.screenshot({ path: `.data/library-check/${width}.png`, fullPage: true });
  }
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
  assert.equal(await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => value.includes('/object/sign/'))), false);
  await context.clearCookies();
  assert.equal((await context.request.get(origin + "/api/library")).status(), 401);
  await page.reload(); await page.waitForURL("**/login?next=**");
  assert.equal(new URL(page.url()).searchParams.get("next"), "/meus-materiais");
  console.log("PASS stage 8: pending/active/revoked library, profile/order links, private no-store API, own-session-only download, rejected forged identity/origin/GET, actual browser download, current version, missing object, unsafe cache blocked, stale-card revocation, 60s token expiry, no persisted URLs, account isolation, logout redirect, responsive 320/390/768/1440.");
  assert.deepEqual(errors, []);
  console.log("PASS stage 6: changed price requires review; lost committed response recovered as the same order; blocked popup fallback; persisted WhatsApp code/price; no grants; customer isolation; verified admin listing; responsive order pages.");
  console.log("PASS: visitor -> login/register links -> atomic merge -> reload -> lost response/retry -> price update -> unavailable/removal -> logout/login -> second-user isolation -> expired session -> confirmation callback. Responsive at 320/390/768/1440. No browser runtime errors.");
  console.log("Real migration/RPC SQL on isolated PGlite; simulated Auth/REST/Storage transport. No remote mutations or messages.");
} catch (error) { console.error(output); throw error; }
finally {
  await browser?.close();
  // Next starts a worker process. Stop only this fixture's process tree before
  // another Next command can read or regenerate the same build directory.
  let cleanupError;
  if (process.platform === "win32" && child.exitCode === null) {
    const termination = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, encoding: "utf8" });
    if (termination.status !== 0) {
      cleanupError = new Error(`Unable to stop fixture Next PID ${child.pid}; stop that process tree before building. ${termination.stderr || ''}`);
      child.stdout?.destroy(); child.stderr?.destroy(); child.unref();
    }
  } else child.kill();
  fixture.closeAllConnections(); fixture.close(); await db.close();
  if (cleanupError) throw cleanupError;
}
