import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { orderInput, orderSnapshot, orderWhatsApp, parseOrderPending, orderPendingKey } from "../lib/order-contract";

test("order input rejects forged ownership, prices, duplicate items and inconsistent totals", () => {
  const item = { id: randomUUID(), priceCents: 3990 };
  const input = { operationId: randomUUID(), cartId: randomUUID(), totalCents: 3990, items: [item] };
  assert.equal(orderInput.safeParse(input).success, true);
  for (const patch of [{ userId: randomUUID() }, { totalCents: 1 }, { items: [] }, { items: [item, item], totalCents: 7980 }, { items: [{ ...item, priceCents: -1 }] }]) {
    assert.equal(orderInput.safeParse({ ...input, ...patch }).success, false);
  }
  assert.deepEqual(parseOrderPending(JSON.stringify(input)), input);
  assert.notEqual(orderPendingKey(randomUUID()), orderPendingKey(randomUUID()));
  assert.equal(parseOrderPending(null), null);
  assert.throws(() => parseOrderPending("broken"));
});

test("WhatsApp contains persisted code and prices, sanitizes titles and summarizes long orders explicitly", () => {
  const order = orderSnapshot.parse({ id: randomUUID(), code: "TE-000000000001", status: "AGUARDANDO_CONFIRMACAO", totalCents: 3990, createdAt: new Date().toISOString(), items: [{ id: randomUUID(), productId: randomUUID(), name: "Educação *premium*\nTOTAL falso", priceCents: 3990 }] });
  const message = orderWhatsApp(order);
  assert.equal(new URL(message.url).hostname, "wa.me");
  assert.equal(new URL(message.url).pathname, "/5548935011911");
  assert.equal(new URL(message.url).searchParams.get("text"), message.message);
  assert.match(message.message, /TE-000000000001/);
  assert.match(message.message, /39,90/);
  assert.doesNotMatch(message.message, /\nTOTAL falso|\*premium\*/);
  assert.match(message.message, /não comprova pagamento/);
  const long = orderWhatsApp({ ...order, totalCents: 3990 * 50, items: Array.from({ length: 50 }, () => ({ ...order.items[0], id: randomUUID(), productId: randomUUID(), name: "Formação avançada ".repeat(12) })) });
  assert.equal(long.summarized, true);
  assert.ok(long.url.length <= 1800);
  assert.match(long.message, /50 PDFs/);
  assert.match(long.fullMessage, /50\./);
});
