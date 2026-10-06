// Isolated browser acceptance: a local Supabase HTTP fixture, never production.
// PLAYWRIGHT_MODULE can point to an installed Playwright entrypoint (no dependency installation).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const port = 3104, origin = `http://localhost:${port}`;
const fixtureIds = Array.from({ length: 13 }, (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const products = fixtureIds.map((id, index) => ({ id, name: index === 0 ? "Práticas inclusivas na educação" : `Caderno de estudos ${index + 1}`, description: "Material sintético para verificar a vitrine, a leitura no celular e a seleção de PDFs. Não está à venda.", price: 39.9 + index, image_url: null }));
let unavailable = false, fail = false, empty = false;
const fixture = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  res.setHeader("Content-Type", "application/json");
  if (url.pathname !== "/rest/v1/products") { res.writeHead(404); res.end("{}"); return; }
  if (fail) { res.writeHead(503); res.end(JSON.stringify({ message: "Fixture outage" })); return; }
  if (url.searchParams.get("is_active") !== "eq.true" || url.searchParams.has("publication_status")) {
    res.writeHead(400); res.end(JSON.stringify({ message: "Missing publication filter" })); return;
  }
  let data = empty ? [] : products.filter(product => !unavailable || product.id !== fixtureIds[0]);
  const ids = url.searchParams.get("id");
  if (ids) data = data.filter(product => ids.includes(product.id));
  const count = data.length;
  const from = Number(url.searchParams.get("offset") || 0), size = Number(url.searchParams.get("limit") || 100);
  data = data.slice(from, from + size);
  if (url.searchParams.get("select") === "id") data = data.map(({ id }) => ({ id }));
  res.setHeader("Content-Range", `${from}-${Math.max(from, from + data.length - 1)}/${count}`);
  res.end(JSON.stringify(data));
});
await new Promise(resolve => fixture.listen(54141, "127.0.0.1", resolve));
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "development", VERCEL_ENV: "preview", TEOREMA_CATALOG_SELECTION_ENABLED: "true",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54141", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-fixture-not-a-real-key", SUPABASE_SERVICE_ROLE_KEY: "" },
});
let output = "";
child.stdout.on("data", chunk => { output = (output + chunk.toString()).slice(-6000); });
child.stderr.on("data", chunk => { output = (output + chunk.toString()).slice(-6000); });
let browser;
try {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Dev server exited: ${output}`);
    if (output.includes("Ready in")) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/materiais");
  await page.getByRole("button", { name: "Adicionar ao carrinho: Práticas inclusivas na educação", exact: true }).waitFor();
  assert.equal(await page.locator(".catalog-product").count(), 12);
  assert.match(await page.title(), /Materiais de estudo/);
  await page.getByRole("button", { name: "Adicionar ao carrinho: Práticas inclusivas na educação", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar ao carrinho: Caderno de estudos 2", exact: true }).click();
  await page.getByText("2 materiais selecionados", { exact: true }).waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("teorema:pdf-selection:v1")));
  assert.deepEqual(stored, { version: 1, ids: fixtureIds.slice(0, 2) });
  await page.reload();
  await page.getByText("2 materiais selecionados", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Próxima", exact: true }).click();
  await page.getByRole("heading", { name: "Caderno de estudos 13", exact: true }).waitFor();
  await page.getByText("2 materiais selecionados", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Anterior", exact: true }).click();
  await page.getByRole("heading", { name: "Práticas inclusivas na educação", exact: true }).waitFor();
  const second = await context.newPage(); await second.goto(origin + "/materiais");
  await second.getByRole("button", { name: "Remover Práticas inclusivas na educação da seleção", exact: true }).click();
  await page.getByText("1 material selecionado", { exact: true }).waitFor();
  await second.close();
  unavailable = true;
  await page.getByRole("button", { name: "Adicionar ao carrinho: Práticas inclusivas na educação", exact: true }).click();
  await page.getByRole("button", { name: "Indisponível: Práticas inclusivas na educação", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Indisponível: Práticas inclusivas na educação", exact: true }).isDisabled(), true);
  unavailable = false;
  await page.route("**/api/catalog/selection", async route => {
    const response = await route.fetch(); const body = await response.json();
    if (body.states && fixtureIds[2] in body.states) body.states[fixtureIds[2]] = "owned";
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await page.getByRole("button", { name: "Já adquirido: Caderno de estudos 3", exact: true }).waitFor();
  await mkdir(".data/catalog-check", { recursive: true });
  await page.screenshot({ path: ".data/catalog-check/desktop.png", fullPage: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `Overflow at ${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".catalog-selection").scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".data/catalog-check/mobile.png" });
  // Keyboard reaches real controls and receives a visible focus outline.
  await page.keyboard.press("Tab");
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY");
  fail = true;
  await page.reload(); await page.getByText("Não foi possível carregar os materiais.", { exact: false }).waitFor();
  fail = false; empty = true;
  await page.reload(); await page.getByRole("heading", { name: "Novos caminhos estão sendo preparados." }).waitFor();
  empty = false;
  await page.goto(origin + "/materiais?page=999");
  await page.getByRole("link", { name: "Voltar à primeira página", exact: true }).waitFor();
  await page.goto(origin + "/materiais");
  await page.getByRole("link", { name: /Ir para o carrinho/ }).click();
  await page.waitForURL("**/login?next=**");
  await page.goto(origin + "/");
  assert.ok((await page.locator("h1").textContent()).length > 0);
  assert.deepEqual(errors, []);
  console.log("PASS: catalog SSR, 12-item pagination, two-PDF selection, reload, cross-tab removal, unavailable recheck, owned UI, 320/390/768/1440px, empty/error states, cart/login link and home navigation. No browser runtime errors.");
  console.log("Fixtures only; acquired-state UI mocked. No real users, purchases, PDFs or Supabase writes.");
  console.log(`Screenshots: ${resolve(".data/catalog-check")}`);
} catch (error) { console.error(output); throw error; }
finally { await browser?.close(); child.kill(); fixture.close(); }
