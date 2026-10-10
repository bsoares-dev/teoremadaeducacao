// MUTATING acceptance test: opt-in, one explicit project, labelled data only.
// Never runs in npm test/CI. Keeps audit history; archives materials, revokes
// test accesses and bans ONLY the newly created test accounts on exit.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";

nextEnv.loadEnvConfig(process.cwd(), true);
const project = "urgzsaftoiebsjkgyhsg", origin = "http://localhost:3108";
assert.equal(process.env.TEOREMA_LIVE_TEST_APPROVED, project, "Explicit project opt-in required; this script creates test records.");
assert.equal(process.env.TEOREMA_LIVE_PUBLICATION_APPROVED, "true", "Test-only temporary publication must be explicitly approved.");
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, `https://${project}.supabase.co`, "Unexpected test target");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(key && process.env.SUPABASE_SERVICE_ROLE_KEY, "Supabase configuration missing");
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, clientOptions);
const publicClient = () => createClient(url, key, clientOptions);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const runId = randomUUID(), dir = `.data/etapa9-live/${runId}`;
const manifest = { runId, project, products: [], users: [], orders: [], checks: [], cleanup: [], network: [], complete: false };
let stage = "preflight", browser, child, actor, adminPassword, adminClient;
const save = async () => { await mkdir(dir, { recursive: true }); await writeFile(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2)); };
const pass = async label => { manifest.checks.push(label); await save(); console.log("PASS: " + label); };
const checked = (result, label) => { assert.ok(!result.error, `${label}: ${result.error?.code || "unavailable"}`); return result.data; };
const hash = bytes => createHash("sha256").update(bytes instanceof ArrayBuffer ? Buffer.from(bytes) : bytes).digest("hex");
const cpf = seed => { let value = seed.padStart(9, "0").slice(0, 9); for (let length = 9; length <= 10; length++) {
  let sum = 0; for (let i = 0; i < length; i++) sum += Number(value[i]) * (length + 1 - i); value += (sum * 10) % 11 % 10;
} return value; };
async function api(context, path, data, expected = 200) {
  const response = data === undefined ? await context.request.get(origin + path) : await context.request.post(origin + path, {
    headers: { origin, "content-type": "application/json" }, data,
  });
  assert.equal(response.status(), expected, `API ${path.split("?")[0]} status`);
  assert.match(response.headers()["cache-control"] || "", /no-store/, "Private API cache");
  assert.match(response.headers()["x-robots-tag"] || "", /noindex/, "Private API noindex");
  if (response.headers()["content-type"] === "application/pdf") {
    const bytes = await response.body(), pdf = await PDFDocument.load(bytes);
    assert.match(pdf.getSubject(), /^Licensed copy: LIC-[0-9A-F]{32}$/);
    return { bytes, version: Number(response.headers()["x-material-version"]), subject: pdf.getSubject() };
  }
  return response.json();
}
async function pdfBytes(label) {
  const pdf = await PDFDocument.create(), page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("HOMOLOGACAO - NAO E UM PRODUTO COMERCIAL", { x: 35, y: 780, size: 14, font });
  page.drawText(label, { x: 35, y: 740, size: 12, font });
  return Buffer.from(await pdf.save());
}
async function login(page, email, password, target) {
  await page.goto(`${origin}/login?next=${encodeURIComponent(target)}`);
  await page.waitForFunction(() => document.querySelector('.auth-switch')?.getAttribute('href')?.includes('next='));
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^Entrar/ }).click();
  await Promise.race([page.waitForURL(origin + target), page.locator(".auth-feedback").waitFor().then(() => { throw new Error("Login unavailable; no credentials logged"); })]);
}
async function upload(page, kind, bytes, label) {
  stage = `products/upload/${kind}/selection`;
  await page.getByLabel("Tipo de envio").selectOption(kind);
  if (kind === "PDF") await page.getByLabel("Identificação da versão").fill(label);
  await page.locator('input[type="file"]').setInputFiles({ name: kind === "PDF" ? "homologacao.pdf" : "homologacao.png", mimeType: kind === "PDF" ? "application/pdf" : "image/png", buffer: bytes });
  stage = `products/upload/${kind}/transfer`;
  const result = Promise.race([
    page.waitForResponse(res => /\/api\/admin\/products\/[^/]+\/uploads\/[^/]+$/.test(new URL(res.url()).pathname) && res.request().method() === "POST"),
    // Next's development tools also contain alerts; only the catalogue's error
    // is a failure of this operation. Do not treat framework toasts as uploads.
    page.locator(".catalog-manager > .account-notice.error").waitFor({ state: "visible" }).then(async () => {
      const message = await page.locator(".catalog-manager > .account-notice.error").textContent();
      const code = /Envio interrompido/.test(message) ? "TUS_TRANSFER_INTERRUPTED"
        : /temporariamente indisponível/.test(message) ? "SERVER_TEMPORARILY_UNAVAILABLE"
        : /Formato ou origem/.test(message) ? "INPUT_ORIGIN_REJECTED"
        : /Confira formato/.test(message) ? "CLIENT_FILE_REJECTED" : "OTHER_UPLOAD_UI_ERROR";
      manifest.network.push({ boundary: "catalogue-error", code });
      throw new Error(code);
    }),
  ]).then(response => ({ response }), error => ({ error }));
  await page.getByRole("button", { name: kind === "PDF" ? "Enviar e validar PDF" : "Enviar e validar capa", exact: true }).click();
  const outcome = await result;
  if (outcome.error) throw outcome.error;
  const response = outcome.response;
  stage = `products/upload/${kind}/finalization`;
  assert.equal(response.status(), 200, "Actual upload/finalization status");
  const detail = await response.json();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector('.product-form fieldset')?.disabled);
  return detail;
}
async function state(context, productId, value) {
  const detail = await api(context, `/api/admin/products/${productId}`);
  return api(context, `/api/admin/products/${productId}/state`, { state: value, revision: detail.product.revision, operationId: randomUUID() });
}

try {
  await save();
  // Password arrives over stdin (not argv, source, manifest or echoed terminal).
  console.log("Using local administrator credential or non-echoed stdin. No account settings will be changed.");
  adminPassword = process.env.TEOREMA_TEST_ADMIN_PASSWORD;
  if (!adminPassword) {
    const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const input = createInterface({ input: process.stdin, output: muted, terminal: Boolean(process.stdin.isTTY) });
    adminPassword = await new Promise((resolve, reject) => {
      input.once("line", line => { resolve(line.trim()); input.close(); });
      input.once("close", () => reject(new Error("No administrator credential provided on stdin")));
    });
  }
  assert.ok(adminPassword.length > 0, "Administrator credential missing");
  adminClient = publicClient();
  const signedIn = checked(await adminClient.auth.signInWithPassword({ email: "bernardozsoares11@gmail.com", password: adminPassword }), "Existing admin login");
  actor = signedIn.user.id;
  assert.equal(checked(await db.rpc("teorema_admin_check", { p_actor_id: actor }), "Admin UUID"), true);
  await pass("Existing administrator Auth login and private UUID eligibility");
  const original = checked(await db.from("products").select("id,name,description,price,image_url,is_active,publication_status,revision").order("id"), "Original product snapshot");
  const originalHash = hash(JSON.stringify(original));
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3108"], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "development", VERCEL_ENV: "preview",
      TEOREMA_PRODUCT_UPLOADS_ENABLED: "true", TEOREMA_CATALOG_SELECTION_ENABLED: "true", TEOREMA_CART_ENABLED: "true" },
  });
  let ready = false;
  child.stdout.on("data", chunk => { if (chunk.toString().includes("Ready in")) ready = true; });
  child.stderr.on("data", () => { /* Never echo credentials, callback queries or signed URLs from runtime logs. */ });
  for (let n = 0; n < 120 && !ready; n++) { assert.equal(child.exitCode, null, "Local Next server startup"); await new Promise(resolve => setTimeout(resolve, 500)); }
  assert.ok(ready, "Local server startup timeout");
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const errors = [], policies = [];
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  pages.forEach(page => { page.setDefaultTimeout(90000); page.on("pageerror", () => errors.push("pageerror"));
    page.on("console", message => { if (message.type() === "error" && /content security policy|violates the following/i.test(message.text())) policies.push("CSP violation"); }); });
  const [admin, alice, bob] = pages, [adminContext, aliceContext, bobContext] = contexts;
  admin.on("pageerror", () => { if (manifest.network.length < 60) manifest.network.push({ boundary: "browser-runtime-error" }); });
  // Never persist headers, request/response bodies, queries or signed URLs.
  admin.on("response", response => {
    const pathname = new URL(response.url()).pathname;
    const boundary = pathname.startsWith("/storage/v1/upload/resumable") ? "TUS"
      : /^\/api\/admin\/products\/[^/]+\/uploads$/.test(pathname) ? "reservation"
      : /^\/api\/admin\/products\/[^/]+\/uploads\/[^/]+$/.test(pathname) ? "finalization" : null;
    if (boundary && manifest.network.length < 60) manifest.network.push({ boundary, method: response.request().method(), status: response.status() });
  });
  admin.on("request", request => {
    if (!new URL(request.url()).pathname.startsWith("/storage/v1/upload/resumable") || request.method() === "OPTIONS") return;
    const signature = request.headers()["x-signature"];
    if (manifest.network.length < 60) manifest.network.push({ boundary: "TUS-signature-format", present: Boolean(signature), segments: signature?.split(".").length || 0 });
  });
  await login(admin, "bernardozsoares11@gmail.com", adminPassword, "/admin");
  adminPassword = undefined;
  await admin.getByRole("button", { name: "Produtos", exact: true }).click();
  const cover = await sharp({ create: { width: 600, height: 800, channels: 3, background: "#0d334e" } }).png().toBuffer();
  const versions = new Map();
  stage = "products/upload";
  for (const [index, price] of [[1, "12.34"], [2, "7.89"]]) {
    const name = `[HOMOLOGACAO] etapa9-${runId.slice(0, 8)} material ${index}`;
    await admin.getByRole("button", { name: "Novo material", exact: true }).click();
    await admin.getByLabel("Nome do material").fill(name); await admin.getByLabel("Preço (R$)").fill(price);
    await admin.getByLabel("Descrição", { exact: true }).fill("Material sintetico exclusivo do ensaio autorizado da etapa 9. Nao comprar.");
    const created = admin.waitForResponse(res => new URL(res.url()).pathname === "/api/admin/products" && res.request().method() === "POST");
    await admin.getByRole("button", { name: "Criar rascunho", exact: true }).click();
    const response = await created; assert.equal(response.status(), 200, "Draft creation");
    const product = (await response.json()).product; manifest.products.push(product.id); await save();
    await admin.getByLabel("Tipo de envio").waitFor();
    assert.equal(await admin.getByRole("button", { name: "Publicar", exact: true }).isDisabled(), true, "Cannot publish incomplete files");
    const bytes = await pdfBytes(`Test material ${index}, version 1`); versions.set(product.id, { hash: hash(bytes), bytes });
    await upload(admin, "PDF", bytes, "homologacao-v1");
    await upload(admin, "COVER", cover, "");
    await state(adminContext, product.id, "PUBLISHED");
  }
  await pass("Actual admin UI -> TUS Storage -> bounded PDF worker/covers -> SQL publication, two labelled materials");
  stage = "test accounts/Auth";
  const customers = [];
  for (const suffix of ["a", "b"]) {
    const email = `homologacao-etapa9-${runId.slice(0, 8)}-${suffix}@example.test`, password = randomBytes(24).toString("base64url");
    const data = checked(await db.auth.admin.createUser({ email, password, email_confirm: false,
      user_metadata: { full_name: suffix === "a" ? "João da Silva" : "Débora França", cpf: cpf(String(Math.floor(100000000 + Math.random() * 800000000))), phone: "48900000000", role: "admin", purpose: "HOMOLOGACAO_ETAPA9" } }), "Test-only account create");
    manifest.users.push(data.user.id); await save();
    const profile = checked(await db.from("profiles").select("id,cpf,phone").eq("id", data.user.id).single(), "Signup trigger/profile");
    assert.ok(profile.cpf && profile.phone, "Auth trigger persisted normalized profile");
    const client = publicClient();
    assert.ok((await client.auth.signInWithPassword({ email, password })).error, "Unconfirmed account cannot login");
    checked(await db.auth.admin.updateUserById(data.user.id, { email_confirm: true }), "Confirm test-only account (not SMTP)");
    checked(await client.auth.signInWithPassword({ email, password }), "Actual customer login");
    customers.push({ id: data.user.id, email, password, client });
  }
  await pass("Two real Auth accounts, profiles trigger, denied unconfirmed login; explicit test-only email confirmation (SMTP not tested)");
  stage = "visitor/cart/order";
  for (const page of [alice, bob]) {
    await page.goto(origin + "/materiais");
    for (const id of manifest.products) {
      const name = checked(await db.from("products").select("name").eq("id", id).single(), "Test material name").name;
      await page.getByRole("button", { name: "Adicionar ao carrinho: " + name, exact: true }).click();
    }
  }
  await login(alice, customers[0].email, customers[0].password, "/carrinho");
  await login(bob, customers[1].email, customers[1].password, "/carrinho");
  const readyCart = page => page.waitForFunction(() => document.querySelector('.pdf-cart-summary button') && !document.querySelector('.pdf-cart-summary button').disabled);
  await Promise.all([readyCart(alice), readyCart(bob)]);
  const cart = (await api(aliceContext, "/api/cart")).cart;
  assert.equal(cart.items.length, 2); assert.equal(cart.totalCents, 2023);
  assert.equal((await api(aliceContext, "/api/library/download", { productId: manifest.products[0] }, 403)).url, undefined);
  assert.equal((await api(bobContext, "/api/admin/dashboard?section=users", undefined, 403)).items, undefined);
  assert.equal((await api(bobContext, "/api/admin/products", undefined, 403)).items, undefined);
  const injection = { operationId: randomUUID(), cartId: cart.id, totalCents: 2023, items: cart.items.map(i => ({ id: i.id, priceCents: i.priceCents })), userId: actor };
  await api(aliceContext, "/api/orders", injection, 400);
  await alice.getByRole("button", { name: "Revisar pedido", exact: true }).click();
  await alice.getByRole("dialog").waitFor(); await alice.keyboard.press("Escape");
  assert.equal(await alice.getByRole("dialog").count(), 0, "Review dialog keyboard dismissal");
  const checkout = { operationId: randomUUID(), cartId: cart.id, totalCents: cart.totalCents, items: cart.items.map(i => ({ id: i.id, priceCents: i.priceCents })) };
  const results = await Promise.all([api(aliceContext, "/api/orders", checkout), api(aliceContext, "/api/orders", checkout)]);
  assert.equal(results[0].order.id, results[1].order.id, "Concurrent HTTP requests create only one order");
  const order = results[0].order; manifest.orders.push(order.id); await save();
  assert.equal(order.status, "AGUARDANDO_CONFIRMACAO"); assert.equal(order.totalCents, 2023);
  await alice.goto(origin + "/pedidos/" + order.id);
  const wa = new URL(await alice.getByRole("link", { name: /WhatsApp/ }).first().getAttribute("href"));
  assert.equal(wa.origin, "https://wa.me"); assert.equal(wa.pathname, "/5548935011911");
  assert.ok(wa.searchParams.get("text").includes(order.code));
  assert.ok(!/48900000000|example\.test|token=|cpf|\/object\/sign\//i.test(wa.searchParams.get("text")), "Message excludes private data; no WhatsApp navigation/message sent");
  await api(bobContext, "/api/orders/" + order.id, undefined, 404);
  const foreign = await customers[1].client.from("orders").select("id").eq("id", order.id);
  assert.ok(!foreign.error && foreign.data.length === 0, "Real RLS prevents cross-customer order reads");
  await pass("Visitor selection survives actual login; real cart/pending order, concurrent idempotency, WhatsApp summary without sending, RLS isolation");
  stage = "confirmation/download/version/revocation";
  const confirmed = await Promise.all([api(adminContext, `/api/admin/orders/${order.id}`, { action: "confirm" }), api(adminContext, `/api/admin/orders/${order.id}`, { action: "confirm" })]);
  assert.equal(confirmed[0].order.status, "CONFIRMADO"); assert.equal(confirmed[1].order.status, "CONFIRMADO");
  const grants = checked(await db.from("access_grants").select("id,product_id,state").eq("user_id", customers[0].id), "Test grants");
  assert.equal(grants.length, 2); assert.ok(grants.every(g => g.state === "ATIVO"));
  await alice.goto(origin + "/meus-materiais"); await alice.getByRole("button", { name: /^Baixar PDF:/ }).first().waitFor();
  const download = alice.waitForEvent("download"); await alice.getByRole("button", { name: /^Baixar PDF:/ }).first().click();
  const received = await download, stream = await received.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.ok([...versions.values()].every(v => v.hash !== hash(Buffer.concat(chunks))), "Browser receives personalized bytes, never the original");
  assert.match((await PDFDocument.load(Buffer.concat(chunks))).getSubject(), /^Licensed copy: LIC-[0-9A-F]{32}$/);
  const productId = manifest.products[0];
  await api(bobContext, "/api/library/download", { productId }, 403);
  const oldFile = checked(await db.rpc("teorema_resolve_pdf", { p_user_id: customers[0].id, p_product_id: productId }), "Current test PDF");
  assert.ok((await customers[0].client.storage.from("teorema-pdfs").createSignedUrl(oldFile.object_key, 60)).error, "Even entitled customers cannot sign directly in Storage");
  const anonymous = await fetch(url + "/storage/v1/object/public/teorema-pdfs/" + oldFile.object_key);
  assert.ok(!anonymous.ok, "PDF is not publicly downloadable");
  const copy = await api(aliceContext, "/api/library/download", { productId });
  assert.notEqual(hash(copy.bytes), versions.get(productId).hash);
  const card = admin.locator(".product-list article").filter({ hasText: `[HOMOLOGACAO] etapa9-${runId.slice(0, 8)} material 1` });
  await card.getByRole("button", { name: "Gerenciar material", exact: true }).click();
  const v2 = await pdfBytes("Test material 1, version 2, purchased access includes updates");
  await upload(admin, "PDF", v2, "homologacao-v2");
  const updated = await api(aliceContext, "/api/library/download", { productId });
  assert.equal(updated.version, 2); assert.notEqual(hash(updated.bytes), hash(v2)); assert.equal(updated.subject, copy.subject);
  await state(adminContext, productId, "UNPUBLISHED");
  assert.equal((await api(aliceContext, "/api/library/download", { productId })).version, 2);
  const grant = grants.find(g => g.product_id === productId);
  await api(adminContext, `/api/admin/orders/${order.id}`, { action: "access", grantId: grant.id, state: "REVOGADO", reason: "Encerramento do ensaio de homologacao etapa 9", operationId: randomUUID() });
  await api(aliceContext, "/api/library/download", { productId }, 403);
  assert.equal(updated.url, undefined, "No original bearer URL was issued");
  await pass("Real concurrent admin confirmation grants all items once; private browser download, Storage denial, version update, unpublication and revocation");
  stage = "persistent account budgets";
  // Saturate ONLY the new synthetic account; concurrent real Postgres connections.
  const budgets = await Promise.all(Array.from({ length: 25 }, () => db.rpc("teorema_consume_request", { p_user_id: customers[1].id, p_action: "PDF_DOWNLOAD" })));
  assert.ok(budgets.every(r => !r.error));
  assert.ok(budgets.some(r => r.data.allowed === false), "Concurrent request budget enforced");
  const blocked = await bobContext.request.post(origin + "/api/library/download", { headers: { origin, "content-type": "application/json" }, data: { productId } });
  assert.equal(blocked.status(), 429); assert.ok(Number(blocked.headers()["retry-after"]) >= 1);
  assert.equal((await blocked.json()).url, undefined);
  assert.equal((await api(aliceContext, "/api/library")).items.length, 2, "Other account/action unaffected");
  await pass("Real concurrent database budget, private HTTP 429/Retry-After without signed URL, account/action isolation");
  stage = "responsive/private-cache/no-original-ticket";
  for (const width of [320, 390, 768, 1440]) {
    for (const page of [alice, bob]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin + "/meus-materiais"); await page.getByRole("button", { name: "Atualizar biblioteca", exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Library overflow ${width}`);
    }
  }
  assert.ok(!await alice.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(v => v.includes('/object/sign/'))), "Signed links are not persisted");
  assert.deepEqual(errors, []); assert.deepEqual(policies, []);
  console.log("Verifying personalized delivery has no original bearer token (not a publication).");
  assert.equal(copy.url, undefined); assert.equal(updated.expiresAt, undefined, "Personalized delivery does not issue original tokens");
  await alice.goto(origin + "/perfil"); await alice.getByRole("button", { name: "Sair", exact: true }).click(); await alice.waitForURL(origin + "/login");
  await api(aliceContext, "/api/library", undefined, 401);
  const afterOriginal = checked(await db.from("products").select("id,name,description,price,image_url,is_active,publication_status,revision").in("id", original.map(p => p.id)).order("id"), "Original product recheck");
  assert.equal(hash(JSON.stringify(afterOriginal)), originalHash, "Pre-existing product unchanged");
  await pass("Four viewport widths, no browser/CSP runtime failures, no original bearer URLs, logout and preserved original product");
  manifest.complete = true;
} catch (error) {
  manifest.failure = { stage, kind: error?.name || "Error" };
  if (error instanceof assert.AssertionError) manifest.failure.check = error.message.split("\n")[0].slice(0, 160);
  console.error(`FAIL at ${stage}. Details/credentials suppressed. Only this run's manifest is used for recovery.`);
  process.exitCode = 1;
} finally {
  if (actor) {
    // Reconcile ONLY this run's labelled records if a committed response was lost.
    // No broad account/product mutation and no test data deletion.
    try {
      const products = checked(await db.from("products").select("id").like("name", `[HOMOLOGACAO] etapa9-${runId.slice(0, 8)} %`), "Recover labelled products");
      const users = checked(await db.from("profiles").select("id").like("email", `homologacao-etapa9-${runId.slice(0, 8)}-%@example.test`), "Recover labelled accounts");
      manifest.products = [...new Set([...manifest.products, ...products.map(p => p.id)])];
      manifest.users = [...new Set([...manifest.users, ...users.map(u => u.id)])];
      if (manifest.users.length) {
        const orders = checked(await db.from("orders").select("id").in("user_id", manifest.users), "Recover test-only orders");
        manifest.orders = [...new Set([...manifest.orders, ...orders.map(o => o.id)])];
      }
      await save();
    } catch { manifest.cleanup.push("PENDING reconciliation for labelled run " + runId); process.exitCode = 1; }
    for (const orderId of manifest.orders) {
      try {
        const items = checked(await db.from("order_items").select("id").eq("order_id", orderId), "Cleanup item lookup");
        const grants = checked(await db.from("access_grants").select("id,state").in("order_item_id", items.map(i => i.id)), "Cleanup grant lookup");
        for (const grant of grants.filter(g => g.state === "ATIVO")) checked(await db.rpc("teorema_set_access_state", { p_actor_id: actor, p_grant_id: grant.id, p_state: "REVOGADO", p_reason: "Encerramento do ensaio identificado da etapa 9", p_operation_id: randomUUID() }), "Cleanup revocation");
        const order = checked(await db.from("orders").select("status").eq("id", orderId).single(), "Cleanup order lookup");
        if (order.status === "AGUARDANDO_CONFIRMACAO") checked(await db.rpc("teorema_cancel_order", { p_actor_id: actor, p_order_id: orderId, p_reason: "Encerramento do ensaio identificado da etapa 9" }), "Cleanup pending cancellation");
        manifest.cleanup.push("Closed test access/order " + orderId);
      } catch { manifest.cleanup.push("PENDING order " + orderId); process.exitCode = 1; }
    }
    for (const productId of manifest.products) {
      try {
        const product = checked(await db.from("products").select("revision,publication_status,name").eq("id", productId).single(), "Cleanup product lookup");
        assert.ok(product.name.startsWith(`[HOMOLOGACAO] etapa9-${runId.slice(0, 8)}`));
        if (product.publication_status !== "ARCHIVED") checked(await db.rpc("teorema_set_product_state", { p_actor_id: actor, p_product_id: productId, p_state: "ARCHIVED", p_revision: product.revision, p_operation_id: randomUUID() }), "Cleanup test archive");
        manifest.cleanup.push("Archived test product " + productId);
      } catch { manifest.cleanup.push("PENDING product " + productId); process.exitCode = 1; }
    }
    for (const userId of manifest.users) {
      try { checked(await db.auth.admin.updateUserById(userId, { ban_duration: "876000h" }), "Ban only test account"); manifest.cleanup.push("Disabled test account " + userId); }
      catch { manifest.cleanup.push("PENDING user " + userId); process.exitCode = 1; }
    }
  }
  if (process.exitCode) manifest.complete = false;
  await save();
  await browser?.close();
  if (child && child.exitCode === null) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    else child.kill();
  }
  if (adminClient) await adminClient.auth.signOut({ scope: "local" });
  console.log(`Manifest (IDs/checks only): ${dir}/manifest.json. Test history preserved; no rows or validated objects deleted.`);
}
