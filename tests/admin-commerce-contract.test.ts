import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { commerceDecision, pendingDecision, parseDecision, commerceJournalKey, commerceFilters, dateBounds } from "../lib/admin-commerce-contract";

test("administrative decisions require explicit confirmation or a bounded reason and never accept forged actors", () => {
  assert.equal(commerceDecision.safeParse({ action: "confirm", paymentVerified: true }).success, true);
  for (const input of [{ action: "confirm" }, { action: "confirm", paymentVerified: false }, { action: "confirm", paymentVerified: true, actorId: randomUUID() },
    { action: "cancel", reason: "    " }, { action: "cancel", reason: "x".repeat(1001) }, { action: "access", grantId: randomUUID(), state: "ATIVO", reason: "Teste" }]) {
    assert.equal(commerceDecision.safeParse(input).success, false);
  }
  const operation = { orderId: randomUUID(), decision: { action: "access" as const, grantId: randomUUID(), state: "REVOGADO" as const, reason: "Conferência de teste", operationId: randomUUID() } };
  assert.deepEqual(parseDecision(JSON.stringify(operation)), pendingDecision.parse(operation));
  assert.notEqual(commerceJournalKey(randomUUID()), commerceJournalKey(randomUUID()));
  assert.equal(parseDecision(null), null);
  assert.throws(() => parseDecision("broken"));
});

test("order filters normalize exact identifiers and reject invalid status/date ranges", () => {
  const result = commerceFilters(new URL("https://example.test/?code=te-000000000001&email=ALICE%40example.test&from=2026-10-07&to=2026-10-07"));
  assert.equal(result.code, "TE-000000000001"); assert.equal(result.email, "alice@example.test");
  assert.deepEqual(dateBounds(result.from, result.to), { start: "2026-10-07T00:00:00-03:00", end: "2026-10-08T00:00:00-03:00" });
  for (const query of ["code=TE-'or", "status=PAID", "state=ADMIN", "from=2026-02-30", "from=2026-10-08&to=2026-10-07", "email=bad"]) {
    assert.throws(() => commerceFilters(new URL("https://example.test/?" + query)));
  }
});
