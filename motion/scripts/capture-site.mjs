// Public-page captures only. Fresh anonymous contexts; no form submissions or purchase actions.
// /api/catalog/selection uses POST for read-only queries (verified in its existing route handler).
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'public', 'assets', 'screens');
const base = process.env.CAPTURE_SITE_URL || 'https://teoremadaeducacao.com.br';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const imported = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const { chromium } = imported.chromium ? imported : imported.default;
const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };
const captures = [
  { name: 'home-desktop', route: '/', viewport: desktop },
  { name: 'home-mobile', route: '/', viewport: mobile },
  { name: 'materials-desktop', route: '/materiais', viewport: desktop, section: '.materials-catalog' },
  { name: 'materials-mobile', route: '/materiais', viewport: mobile, section: '.materials-catalog' },
  { name: 'questionnaires-mobile', route: '/questionarios', viewport: mobile },
  { name: 'courses-desktop', route: '/#materiais', viewport: desktop, section: '#materiais' },
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
const evidence = {
  capturedAt: new Date().toISOString(),
  baseUrl: base,
  method: 'Playwright, fresh anonymous context, GET/HEAD/OPTIONS plus verified read-only POST /api/catalog/selection; no clicks or form submissions',
  captures: [],
};
try {
  for (const capture of captures) {
    const context = await browser.newContext({
      viewport: capture.viewport,
      deviceScaleFactor: 1,
      locale: 'pt-BR',
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    await context.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      const publicHost = new URL(base).hostname.replace(/^www\./, '');
      const catalogRead = request.method() === 'POST'
        && url.hostname.replace(/^www\./, '') === publicHost
        && url.pathname === '/api/catalog/selection';
      return ['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || catalogRead
        ? route.continue() : route.abort('blockedbyclient');
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', () => errors.push('Uncaught page error'));
      const response = await page.goto(new URL(capture.route, base).href, { waitUntil: 'networkidle', timeout: 45_000 });
      assert.equal(response?.status(), 200, `${capture.name}: public page must respond 200`);
      await page.locator('h1').waitFor({ state: 'visible' });
      assert.equal(await page.locator('h1').count(), 1, `${capture.name}: one primary heading`);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => image.complete
          ? Promise.resolve()
          : new Promise(resolve => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); })));
      });
      if (capture.section === '#materiais') {
        const hotmart = page.getByRole('link', { name: 'Quero ser aprovado', exact: true });
        assert.equal(await hotmart.getAttribute('href'), 'https://hotmart.com/pt-br/club/henrique-hirsch');
      }
      if (capture.section) {
        await page.locator(capture.section).scrollIntoViewIfNeeded();
        await page.evaluate(selector => {
          const section = document.querySelector(selector);
          const frame = selector === '#materiais' ? section.querySelector('.section-label') : section;
          window.scrollTo({ top: frame.getBoundingClientRect().top + scrollY - 20, behavior: 'instant' });
        }, capture.section);
      } else {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      }
      if (capture.route === '/questionarios') {
        await page.getByText('Em desenvolvimento', { exact: true }).waitFor({ state: 'visible' });
        assert.match(await page.locator('main').innerText(), /questionários ainda não estão disponíveis/i);
      }
      const layout = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        scrollY,
        h1: document.querySelector('h1')?.textContent?.trim(),
        missingImages: Array.from(document.images).filter(image => !image.complete || image.naturalWidth === 0).length,
      }));
      assert.equal(layout.horizontalOverflow, false, `${capture.name}: horizontal overflow`);
      assert.equal(layout.missingImages, 0, `${capture.name}: images must load`);
      assert.deepEqual(errors, [], `${capture.name}: browser errors`);
      const title = await page.title();
      assert.ok(title.length > 8, `${capture.name}: public title`);
      const catalogStatus = capture.route === '/materiais'
        ? await page.locator('.materials-catalog').innerText()
        : undefined;
      if (catalogStatus) assert.equal(await page.locator('.materials-catalog [role="alert"]').count(), 0, `${capture.name}: catalog must render without read errors`);
      await page.screenshot({ path: join(output, `${capture.name}.png`), fullPage: false, animations: 'disabled' });
      evidence.captures.push({
        file: `${capture.name}.png`,
        requestedUrl: new URL(capture.route, base).href,
        url: page.url(),
        status: response.status(),
        title,
        capturedAt: new Date().toISOString(),
        viewport: capture.viewport,
        ...layout,
        ...(capture.route === '/questionarios' ? { availability: 'Em desenvolvimento; questionários ainda não disponíveis' } : {}),
        ...(capture.section === '#materiais' ? { availability: 'Vitrine pública; curso completo encaminha ao Hotmart externo' } : {}),
        ...(catalogStatus ? { catalogStatus } : {}),
      });
      console.log(`Captured ${capture.name}: HTTP ${response.status()} / ${capture.viewport.width}x${capture.viewport.height}`);
    } finally {
      await context.close();
    }
  }
  await writeFile(join(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`Saved ${evidence.captures.length} verified public captures and evidence.json`);
} finally {
  await browser.close();
}
