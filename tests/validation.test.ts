import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidCpf, signupSchema, productSchema, pagination } from "../lib/schemas";
import { isAdmin, safeNext, ADMIN_EMAIL } from "../lib/auth-policy";

test("CPF rejects repeated digits and wrong check digits, accepts formatted valid fixture", () => {
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("52998224724"), false);
  assert.equal(isValidCpf("529.982.247-25"), true);
});
test("signup normalizes identifiers and rejects short passwords and invalid phone", () => {
  const input = { email: " Example@Test.com ", password: "example123", cpf: "529.982.247-25", phone: "(48) 99999-9999" };
  const result = signupSchema.parse(input);
  assert.equal(result.cpf, "52998224725"); assert.equal(result.phone, "48999999999"); assert.equal(result.email, "example@test.com");
  assert.equal(signupSchema.safeParse({ ...input, password: "123" }).success, false);
  assert.equal(signupSchema.safeParse({ ...input, phone: "00000000000" }).success, false);
});
test("admin requires verified canonical email; metadata is not used", () => {
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin({ email: ADMIN_EMAIL }), false);
  assert.equal(isAdmin({ email: "student@example.com", email_confirmed_at: "2026-01-01" }), false);
  assert.equal(isAdmin({ email: ADMIN_EMAIL.toUpperCase(), email_confirmed_at: "2026-01-01" }), true);
});
test("redirects never accept external or protocol-relative targets", () => {
  for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/auth/callback", "javascript:alert(1)"]) assert.equal(safeNext(value), "/perfil");
  assert.equal(safeNext("/carrinho"), "/carrinho"); assert.equal(safeNext("/admin"), "/admin");
});
test("product validates HTTPS and exact two-decimal positive prices", () => {
  const input = { name: "PDF", description: "Material de estudo", price: "12.50", imageUrl: "https://example.com/cover.png" };
  assert.equal(productSchema.parse(input).price, 12.5);
  for (const price of ["", "NaN", "-1", "0", "1.999"]) assert.equal(productSchema.safeParse({ ...input, price }).success, false);
  assert.equal(productSchema.safeParse({ ...input, imageUrl: "javascript:alert(1)" }).success, false);
});
test("pagination bounds hostile input", () => {
  assert.equal(pagination("-1").page, 1); assert.equal(pagination("bad").page, 1);
  assert.equal(pagination("9999999999").page, 10000);
  assert.deepEqual(pagination("2"), { page: 2, size: 20, from: 20, to: 39 });
});
