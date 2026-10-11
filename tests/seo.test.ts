import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_PATHS, SITE_URL, publicPageMetadata, publicSitemap, searchIndexingEnabled, searchRobots } from "../lib/seo";
import { headerRules } from "../config/security-headers.mjs";

const production = { NODE_ENV: "production", VERCEL_ENV: "production" };
const nonProduction = [
  {},
  { NODE_ENV: "development" },
  { NODE_ENV: "test" },
  { NODE_ENV: "production", VERCEL_ENV: "preview" },
  { NODE_ENV: "production", VERCEL_ENV: "development" },
  { NODE_ENV: "production", VERCEL_ENV: "staging" },
];

test("sitemap contains only real public pages on the canonical HTTPS domain", () => {
  assert.deepEqual(publicSitemap(production), [
    { url: "https://www.teoremadaeducacao.com.br/" },
    { url: "https://www.teoremadaeducacao.com.br/materiais" },
  ]);
  for (const path of PUBLIC_PATHS) {
    assert.ok(existsSync(join(process.cwd(), "app", path, "page.tsx")));
  }
  for (const entry of publicSitemap(production)) {
    const url = new URL(entry.url);
    assert.equal(url.origin, SITE_URL);
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.equal(entry.lastModified, undefined, "Do not fabricate modification dates");
    assert.ok(!/admin|perfil|carrinho|pedidos|meus-materiais|api|auth|\.pdf/.test(url.pathname));
  }
});

test("preview, development and unknown environments cannot publish a sitemap", () => {
  assert.equal(searchIndexingEnabled(production), true);
  assert.equal(searchIndexingEnabled({ NODE_ENV: "production" }), true);
  for (const env of nonProduction) {
    assert.equal(searchIndexingEnabled(env), false);
    assert.deepEqual(publicSitemap(env), []);
  }
});

test("production robots advertises the sitemap and avoids auth and API crawling", () => {
  assert.deepEqual(searchRobots(production), {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  });
});

test("non-production robots blocks crawling without advertising a public sitemap", () => {
  for (const env of nonProduction) {
    assert.deepEqual(searchRobots(env), { rules: { userAgent: "*", disallow: "/" } });
  }
});

test("each public page has its own canonical and share metadata, never a shared home canonical", () => {
  for (const path of PUBLIC_PATHS) {
    const metadata = publicPageMetadata(path, "Título", "Descrição", production);
    const canonical = new URL(path, SITE_URL).href;
    assert.deepEqual(metadata.alternates, { canonical });
    assert.deepEqual(metadata.robots, { index: true, follow: true });
    assert.equal(metadata.openGraph?.url, canonical);
    assert.equal(metadata.openGraph?.title, "Título");
    assert.equal(metadata.description, "Descrição");
    for (const env of nonProduction) {
      assert.deepEqual(publicPageMetadata(path, "Título", "Descrição", env).robots, { index: false, follow: false });
    }
  }
});

test("private HTML keeps existing noindex headers and production public pages remain crawlable", () => {
  const rules = headerRules(production);
  for (const path of ["/login", "/cadastro", "/perfil/:path*", "/admin/:path*", "/carrinho/:path*", "/pedidos/:path*", "/meus-materiais/:path*"]) {
    assert.ok(rules.some(rule => rule.source === path && rule.headers.some(header => header.key === "X-Robots-Tag" && header.value.includes("noindex"))));
  }
  assert.ok(!rules.some(rule => rule.source === "/:path*" && rule.headers.some(header => header.key === "X-Robots-Tag")));
});

test("catalog pagination uses self-canonicals without adding query URLs to the sitemap", () => {
  const metadata = publicPageMetadata("/materiais?page=2", "Materiais", "Descrição", production);
  assert.deepEqual(metadata.alternates, { canonical: `${SITE_URL}/materiais?page=2` });
  assert.equal(metadata.openGraph?.url, `${SITE_URL}/materiais?page=2`);
  assert.ok(publicSitemap(production).every(entry => new URL(entry.url).search === ""));
});
