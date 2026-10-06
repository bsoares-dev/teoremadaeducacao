import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseSelection, serializeSelection, mergeSelectionIds, SELECTION_LIMIT, materialStates, selectionRequest, selectionPreviewEnabled, publicCover } from "../lib/catalog-selection";

test("visitor selection stores only unique valid IDs and survives reload", () => {
  const first = randomUUID(), second = randomUUID();
  assert.deepEqual(parseSelection(serializeSelection([first, second, first.toUpperCase(), "bad"])), [first, second]);
  assert.deepEqual(parseSelection(JSON.stringify({ version: 1, ids: [first, { price: 1 }, null], token: "ignored" })), [first]);
  for (const raw of [null, "broken", "null", "[]", '{"version":2,"ids":[]}', "x".repeat(5001)]) assert.deepEqual(parseSelection(raw), []);
});

test("future cart merge preserves persisted IDs first and enforces 50 distinct PDFs", () => {
  const ids = Array.from({ length: 60 }, () => randomUUID());
  const merged = mergeSelectionIds(ids.slice(0, 30), ids.slice(20));
  assert.deepEqual(merged, ids.slice(0, SELECTION_LIMIT));
});

test("active ownership wins even after unpublishing; missing products stay unavailable", () => {
  const [published, acquired, hidden] = [randomUUID(), randomUUID(), randomUUID()];
  assert.deepEqual(materialStates([published, acquired, hidden], [published], [acquired]), {
    [published]: "available", [acquired]: "owned", [hidden]: "unavailable",
  });
});

test("status request rejects identity, prices, paths and unbounded selection", () => {
  const id = randomUUID();
  assert.equal(selectionRequest.safeParse({ ids: [id] }).success, true);
  for (const body of [{ ids: [id], user_id: id }, { ids: [id], price: 1 }, { ids: ["../secret.pdf"] }, { ids: Array(63).fill(id) }]) {
    assert.equal(selectionRequest.safeParse(body).success, false);
  }
});

test("incomplete checkout is never activated in production, even with flag true", () => {
  const flag = { TEOREMA_CATALOG_SELECTION_ENABLED: "true" };
  assert.equal(selectionPreviewEnabled({ ...flag, VERCEL_ENV: "production" }), false);
  assert.equal(selectionPreviewEnabled({ ...flag, NODE_ENV: "production" }), false);
  assert.equal(selectionPreviewEnabled({ ...flag, VERCEL_ENV: "preview", NODE_ENV: "production" }), true);
  assert.equal(selectionPreviewEnabled({ ...flag, NODE_ENV: "development" }), true);
  assert.equal(selectionPreviewEnabled({ VERCEL_ENV: "preview" }), false);
});

test("catalog images accept only validated public covers from this project", () => {
  const base = "https://example.supabase.co", path = `/storage/v1/object/public/teorema-covers/products/${randomUUID()}/${randomUUID()}.webp`;
  assert.equal(publicCover(base + path, base), base + path);
  for (const value of [base + path + "?token=x", base + path.replace("teorema-covers", "teorema-pdfs"), "https://evil.example" + path, "http://example.supabase.co" + path, "javascript:alert(1)", null]) {
    assert.equal(publicCover(value, base), null);
  }
});
