import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { homeProducts } from "../lib/home-products";
import { adminProductListUrl, productArchiveFilter, includeArchivedProducts } from "../lib/admin-product-list";
import { publicSitemap } from "../lib/seo";

test("home cards use the requested destinations and preserve the PDF catalog", () => {
  assert.deepEqual(homeProducts.map(product => [product.cta, product.href, product.external]), [
    ["Quero ser aprovado", "https://hotmart.com/pt-br/club/henrique-hirsch", true],
    ["Quero praticar", "/questionarios", false],
    ["Garantir kit", "/materiais", false],
  ]);
  const source = readFileSync("app/home-content.tsx", "utf8");
  assert.match(source, /<a href=\{product.href\} target="_blank" rel="noopener noreferrer"/);
  assert.match(source, /<Link href=\{product.href\}/);
});

test("responsive interfaces use SVG icons instead of Unicode emoji/symbol glyphs", () => {
  for (const file of ["app/home-content.tsx", "app/login/page.tsx", "app/materiais/page.tsx", "app/materiais/catalog.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.ok(!/[\u2190-\u21ff\u2600-\u27bf\ufe0f\u00d7]/u.test(source), file);
    assert.match(source, /lucide-react/, file);
  }
  const source = readFileSync("app/home-content.tsx", "utf8");
  assert.match(source, /aria-expanded=\{menuOpen\}/);
  assert.match(source, /aria-controls="home-navigation"/);
  assert.match(source, /id="home-navigation"/);
});

test("questionnaires are an honest development placeholder, not advertised as ready or indexed", () => {
  const page = readFileSync("app/questionarios/page.tsx", "utf8");
  assert.match(page, /Questionários/);
  assert.match(page, /Em desenvolvimento/);
  assert.match(page, /ainda não estão disponíveis/);
  assert.match(page, /robots: \{ index: false, follow: true \}/);
  assert.ok(!publicSitemap({ NODE_ENV: "production" }).some(entry => entry.url.endsWith("/questionarios")));
  assert.ok(!page.includes("<form"), "Do not pretend to submit unpublished questionnaires");
});

test("archived listing is opt-in, never enabled by malformed values", () => {
  assert.equal(includeArchivedProducts(new URLSearchParams()), false);
  assert.equal(includeArchivedProducts(new URLSearchParams("includeArchived=true")), true);
  for (const value of ["false", "1", "TRUE", "ARCHIVED", "<script>"]) {
    assert.equal(includeArchivedProducts(new URLSearchParams({ includeArchived: value })), false);
  }
  assert.equal(adminProductListUrl(2, false), "/api/admin/products?page=2&includeArchived=false");
  assert.equal(adminProductListUrl(1, true), "/api/admin/products?page=1&includeArchived=true");
});

test("archive visibility is a read filter applied before count and pagination", async () => {
  const seen: URL[] = [];
  const fixture = [
    { id: "active", publication_status: "PUBLISHED" },
    { id: "draft", publication_status: "DRAFT" },
    { id: "archived", publication_status: "ARCHIVED" },
  ];
  const db = createClient("https://fixture.supabase.co", "fixture-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      assert.equal(init?.method, "GET");
      const url = new URL(String(input)); seen.push(url);
      const includeArchived = !url.searchParams.has("publication_status");
      if (!includeArchived) assert.equal(url.searchParams.get("publication_status"), "neq.ARCHIVED");
      const filtered = fixture.filter(product => includeArchived || product.publication_status !== "ARCHIVED");
      assert.match(new Headers(init?.headers).get("prefer") || "", /count=exact/);
      const from = Number(url.searchParams.get("offset"));
      const items = filtered.slice(from, from + Number(url.searchParams.get("limit")));
      return new Response(JSON.stringify(items), { status: 200, headers: {
        "content-type": "application/json", "content-range": `${from}-${from + items.length - 1}/${filtered.length}`,
      } });
    } },
  });
  for (const includeArchived of [false, true]) {
    const query = db.from("products").select("id,publication_status", { count: "exact" });
    const filter = productArchiveFilter(includeArchived);
    const listing = filter ? query.neq(filter.column, filter.value) : query;
    const result = await listing
      .order("created_at", { ascending: false }).range(0, 0);
    assert.equal(result.error, null);
    assert.equal(result.count, includeArchived ? 3 : 2);
    assert.equal(result.data?.length, 1);
  }
  assert.equal(seen.length, 2);
  assert.equal(fixture.length, 3, "Hiding must not delete historical products");
});

test("admin list remains authorized and does not introduce destructive operations", () => {
  const route = readFileSync("app/api/admin/products/route.ts", "utf8");
  assert.ok(route.indexOf("await productAdmin()") < route.indexOf('db.from("products")'));
  assert.ok(route.indexOf("query.neq(filter.column, filter.value)") < route.indexOf(".range(from, to)"));
  assert.ok(!route.includes(".delete("));
  const manager = readFileSync("app/admin/products-manager.tsx", "utf8");
  assert.match(manager, /includeArchived, setIncludeArchived\] = useState\(false\)/);
  assert.match(manager, /Mostrar materiais arquivados/);
  assert.match(manager, /setIncludeArchived\(show\); setPage\(1\)/);
});
