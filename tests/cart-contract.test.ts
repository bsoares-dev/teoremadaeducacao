import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cartMutation, parsePending, cartPendingKey, remainingSelection, cartPreviewEnabled, cartMoney } from "../lib/cart-contract";

test("cart input cannot forge ownership, price, quantity or conflicting operations", () => {
  const id = randomUUID(), valid = { operationId: randomUUID(), cartId: null, revision: 0, addIds: [id], removeIds: [] };
  assert.equal(cartMutation.safeParse(valid).success, true);
  for (const patch of [{ userId: id }, { price: 1 }, { quantity: 2 }, { revision: -1 }, { addIds: [] }, { removeIds: [id] }, { addIds: Array(51).fill(id) }]) {
    assert.equal(cartMutation.safeParse({ ...valid, ...patch }).success, false);
  }
});
test("pending operations survive reload unchanged and are scoped to the account", () => {
  const first = randomUUID(), second = randomUUID();
  const input = { operationId: randomUUID(), cartId: first, revision: 4, addIds: [second], removeIds: [] };
  assert.deepEqual(parsePending(JSON.stringify(input)), input);
  assert.notEqual(cartPendingKey(first), cartPendingKey(second));
  assert.throws(() => parsePending("broken"));
  assert.equal(parsePending(null), null);
});
test("acknowledgement removes only accepted IDs, preserves rejected and concurrent selections", () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  assert.deepEqual(remainingSelection(ids, [ids[0]]), ids.slice(1));
  assert.deepEqual(remainingSelection(ids, []), ids);
});
test("cart remains opt-in and cannot expose incomplete checkout in production", () => {
  const enabled = { TEOREMA_CART_ENABLED: "true", TEOREMA_CATALOG_SELECTION_ENABLED: "true" };
  assert.equal(cartPreviewEnabled({ ...enabled, VERCEL_ENV: "production" }), false);
  assert.equal(cartPreviewEnabled({ ...enabled, VERCEL_ENV: "preview" }), true);
  assert.equal(cartPreviewEnabled({ ...enabled, NODE_ENV: "development" }), true);
  assert.equal(cartPreviewEnabled({ TEOREMA_CART_ENABLED: "true", VERCEL_ENV: "preview" }), false);
  assert.match(cartMoney(3991), /39,91/);
});
