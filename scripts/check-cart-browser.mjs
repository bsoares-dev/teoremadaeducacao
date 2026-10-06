// Next + real migration/RPC SQL in PGlite. Auth/REST transport is local only.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { cartDatabase } from "./fixtures/cart-database.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const { db, users, ids, service } = await cartDatabase();
const origin = "http://localhost:3105", api = "http://127.0.0.1:54142", serviceKey = "local-service-fixture";
const sessions = users.map(user => {
  const record = { ...user, aud: "authenticated", role: "authenticated", email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(), is_anonymous: false };
  const exp = Math.floor(Date.now() / 1000) + 7200;
  return { access_token: `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp, role: "authenticated", aud: "authenticated" })).toString("base64url")}.local-fixture`, refresh_token: "local-refresh", expires_at: exp, expires_in: 7200, token_type: "bearer", user: record };
});
let dropResponse = false, droppedOperation = null;
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
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      assert.equal(token, serviceKey, "RPC must use server credentials");
      let value;
      if (url.pathname.endsWith("/teorema_read_cart")) value = await service(async tx => (await tx.query("select teorema_read_cart($1) as value", [body.p_user_id])).rows[0].value);
      else if (url.pathname.endsWith("/teorema_sync_cart")) {
        value = await service(async tx => (await tx.query("select teorema_sync_cart($1,$2,$3,$4,$5,$6) as value", [body.p_user_id, body.p_operation_id, body.p_cart_id, body.p_revision, body.p_add_ids, body.p_remove_ids])).rows[0].value);
        if (dropResponse || droppedOperation === body.p_operation_id) {
          dropResponse = false; droppedOperation = body.p_operation_id;
          res.writeHead(503); res.end(JSON.stringify({ message: "Simulated lost response after commit", code: "08006" })); return;
        }
      } else throw new Error("Unknown fixture RPC");
      res.end(JSON.stringify(value)); return;
    }
    if (["/rest/v1/products", "/rest/v1/access_grants", "/rest/v1/carts", "/rest/v1/cart_items"].includes(url.pathname)) {
      const rows = await db.transaction(async tx => {
        await tx.exec(`set local role ${session ? "authenticated" : "anon"}`);
        if (session) await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [session.user.id]);
        if (url.pathname.endsWith("/carts")) return (await tx.query("select id from carts where status='OPEN' order by created_at limit 1")).rows[0] || null;
        if (url.pathname.endsWith("/cart_items")) return (await tx.query("select product_id from cart_items where cart_id=$1 limit 50", [url.searchParams.get("cart_id").slice(3)])).rows;
        if (url.pathname.endsWith("access_grants")) return (await tx.query("select product_id from access_grants where state='ATIVO'")).rows;
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
  page.on("requestfailed", req => console.error("Fixture request failed:", req.url(), req.failure()?.errorText));
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
  assert.deepEqual(errors, []);
  console.log("PASS: visitor -> login/register links -> atomic merge -> reload -> lost response/retry -> price update -> unavailable/removal -> logout/login -> second-user isolation -> expired session -> confirmation callback. Responsive at 320/390/768/1440. No browser runtime errors.");
  console.log("Real migration/RPC SQL on isolated PGlite; simulated Auth/REST only. No remote mutations or messages.");
} catch (error) { console.error(output); throw error; }
finally { await browser?.close(); child.kill(); fixture.close(); await db.close(); }
