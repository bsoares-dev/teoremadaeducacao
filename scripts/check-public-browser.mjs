// Read-only production browser smoke. No signup, checkout or WhatsApp navigation.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const { chromium } = playwright.chromium ? playwright : playwright.default;
const base = process.env.TEST_BASE_URL || "http://localhost:3100";
const screenshots = process.env.BROWSER_SCREENSHOT_DIR;
if (screenshots) await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage();
  const failures = [];
  page.on("pageerror", () => failures.push("Runtime error"));
  page.on("console", message => { if (message.type() === "error" && /content security policy|violates the following/i.test(message.text())) failures.push("CSP violation"); });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/materiais", "/questionarios", "/login", "/cadastro"]) {
      const response = await page.goto(base + path);
      assert.equal(response.status(), 200, "Public route " + path);
      await page.locator("h1").waitFor();
      assert.equal(await page.locator("h1").count(), 1, "One primary heading " + path);
      assert.ok((await page.title()).length > 8, "Page title");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow ${path} at ${width}`);
      if (path === "/login" || path === "/cadastro") assert.match(response.headers()["x-robots-tag"] || "", /noindex/);
      else if (path === "/questionarios") assert.match(await page.locator('meta[name="robots"]').getAttribute("content") || "", /noindex/);
      else assert.ok(!response.headers()["x-robots-tag"], "Production public pages must remain indexable");
      if (path === "/") {
        assert.ok((await page.locator('meta[name="description"]').getAttribute("content")).length > 20, "Public description");
        const hotmart = page.getByRole("link", { name: "Quero ser aprovado", exact: true });
        assert.equal(await hotmart.getAttribute("href"), "https://hotmart.com/pt-br/club/henrique-hirsch");
        assert.equal(await hotmart.getAttribute("target"), "_blank");
        assert.match(await hotmart.getAttribute("rel"), /noopener/);
        assert.equal(await page.getByRole("link", { name: "Quero praticar", exact: true }).getAttribute("href"), "/questionarios");
        if (width <= 768) {
          const menu = page.getByRole("button", { name: "Abrir menu", exact: true });
          assert.equal(await menu.locator("svg").count(), 1, "Mobile menu uses an SVG icon");
          assert.equal(await menu.getAttribute("aria-expanded"), "false");
          await menu.click();
          const close = page.getByRole("button", { name: "Fechar menu", exact: true });
          assert.equal(await close.getAttribute("aria-expanded"), "true");
          assert.ok(await page.locator("#home-navigation").isVisible(), "Expanded mobile navigation");
          await close.click();
        }
      }
      if (path === "/questionarios") {
        await page.getByText("Em desenvolvimento", { exact: true }).waitFor();
        assert.equal(await page.getByRole("link", { name: "Explorar materiais", exact: true }).getAttribute("href"), "/materiais");
      }
      if (screenshots && [390, 1440].includes(width) && ["/", "/questionarios"].includes(path)) {
        if (path === "/") await page.locator("#materiais").scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(screenshots, `${path === "/" ? "home-materials" : "questionarios"}-${width}.png`), fullPage: path !== "/" });
      }
    }
  }
  await page.goto(base + "/");
  await page.getByRole("link", { name: "Quero praticar", exact: true }).click();
  await page.getByRole("heading", { name: "Questionários gratuitos.", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/questionarios", "Questionnaire card navigation");
  await page.goto(base + "/login");
  await page.getByLabel("E-mail", { exact: true }).waitFor();
  await page.getByLabel("Senha", { exact: true }).waitFor();
  assert.deepEqual(failures, []);
  console.log("PASS: home/catalog/questionnaires/login/register at 320/390/768/1440; correct card destinations, SVG mobile menu, development noindex, headings, no overflow, runtime or CSP failures. No writes/messages.");
} finally { await browser.close(); }
