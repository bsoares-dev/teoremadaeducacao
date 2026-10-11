import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commercialFeatureEnabled, productUploadsEnabled } from "../lib/commerce-policy";
import { selectionPreviewEnabled } from "../lib/catalog-selection";
import { cartPreviewEnabled } from "../lib/cart-contract";

test("authorized production defaults enable catalog, commerce and admin uploads without changing secrets", () => {
  for (const env of [{ VERCEL_ENV: "production", NODE_ENV: "production" }, { NODE_ENV: "production" }]) {
    assert.equal(selectionPreviewEnabled(env), true);
    assert.equal(cartPreviewEnabled(env), true);
    assert.equal(productUploadsEnabled(env), true);
  }
});

test("each explicit false remains an emergency stop and malformed flags fail closed", () => {
  for (const value of ["false", "TRUE", "1", "", " true", "false ", "yes"]) {
    const env = { VERCEL_ENV: "production" };
    assert.equal(commercialFeatureEnabled(value, env), false);
    assert.equal(cartPreviewEnabled({ ...env, TEOREMA_CART_ENABLED: value }), false);
    assert.equal(cartPreviewEnabled({ ...env, TEOREMA_CATALOG_SELECTION_ENABLED: value }), false);
    assert.equal(productUploadsEnabled({ ...env, TEOREMA_PRODUCT_UPLOADS_ENABLED: value }), false);
  }
  assert.equal(productUploadsEnabled({ VERCEL_ENV: "production", TEOREMA_CART_ENABLED: "false" }), true);
});

test("Preview/development remain opt-in and unknown environments never enable commerce", () => {
  for (const env of [{ VERCEL_ENV: "preview", NODE_ENV: "production" }, { VERCEL_ENV: "development" }, { NODE_ENV: "development" }]) {
    assert.equal(cartPreviewEnabled(env), false);
    assert.equal(productUploadsEnabled(env), false);
    assert.equal(cartPreviewEnabled({ ...env, TEOREMA_CART_ENABLED: "true", TEOREMA_CATALOG_SELECTION_ENABLED: "true" }), true);
    assert.equal(productUploadsEnabled({ ...env, TEOREMA_PRODUCT_UPLOADS_ENABLED: "true" }), true);
  }
  for (const env of [{}, { NODE_ENV: "test" }, { NODE_ENV: "production", VERCEL_ENV: "staging" }, { VERCEL_ENV: "" }]) {
    assert.equal(cartPreviewEnabled({ ...env, TEOREMA_CART_ENABLED: "true", TEOREMA_CATALOG_SELECTION_ENABLED: "true" }), false);
    assert.equal(productUploadsEnabled({ ...env, TEOREMA_PRODUCT_UPLOADS_ENABLED: "true" }), false);
  }
});

test("release keeps the same availability decision on every customer and administrative boundary", () => {
  for (const path of ["app/api/cart/route.ts", "app/api/orders/route.ts", "app/pedidos/page.tsx", "app/pedidos/[id]/page.tsx",
    "app/meus-materiais/page.tsx", "app/carrinho/page.tsx", "app/admin/page.tsx", "lib/library.ts", "lib/admin-commerce.ts"])
    assert.match(readFileSync(path, "utf8"), /cartPreviewEnabled\(process.env\)/, path);
  assert.match(readFileSync("lib/admin-products.ts", "utf8"), /productUploadsEnabled\(process.env\)/);
});

test("release does not bypass identity, confirmed payment, private storage, rate limits or session rechecks", () => {
  const library = readFileSync("lib/library.ts", "utf8"), admin = readFileSync("lib/admin-commerce.ts", "utf8");
  assert.match(library, /getAuth\(\)/); assert.match(library, /email_confirmed_at/); assert.match(library, /is_anonymous/);
  assert.match(admin, /adminAccess\(\)/); assert.match(admin, /teorema_admin_check/);
  const route = readFileSync("app/api/library/download/route.ts", "utf8");
  assert.match(route, /requireActivePdfSession/); assert.match(route, /consumeRequest/); assert.match(route, /downloadPersonalizedPdf/);
  assert.doesNotMatch(route, /getPublicUrl|createSignedUrl/);
  assert.match(readFileSync("app/materiais/page.tsx", "utf8"), /\[HOMOLOGACAO\]/);
});
