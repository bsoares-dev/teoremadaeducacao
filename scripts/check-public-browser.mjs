// Read-only production browser smoke. No signup, checkout or WhatsApp navigation.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.TEST_BASE_URL || "http://localhost:3100";
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage();
  const failures = [];
  page.on("pageerror", () => failures.push("Runtime error"));
  page.on("console", message => { if (message.type() === "error" && /content security policy|violates the following/i.test(message.text())) failures.push("CSP violation"); });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/materiais", "/login", "/cadastro"]) {
      const response = await page.goto(base + path);
      assert.equal(response.status(), 200, "Public route " + path);
      await page.locator("h1").waitFor();
      assert.equal(await page.locator("h1").count(), 1, "One primary heading " + path);
      assert.ok((await page.title()).length > 8, "Page title");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow ${path} at ${width}`);
      if (path === "/login" || path === "/cadastro") assert.match(response.headers()["x-robots-tag"] || "", /noindex/);
      else assert.ok(!response.headers()["x-robots-tag"], "Production public pages must remain indexable");
      if (path === "/") assert.ok((await page.locator('meta[name="description"]').getAttribute("content")).length > 20, "Public description");
    }
  }
  await page.goto(base + "/login");
  await page.getByLabel("E-mail", { exact: true }).waitFor();
  await page.getByLabel("Senha", { exact: true }).waitFor();
  assert.deepEqual(failures, []);
  console.log("PASS: production home/catalog/login/register at 320/390/768/1440; headings, description, private noindex, no overflow, runtime or CSP failures. No writes/messages.");
} finally { await browser.close(); }
