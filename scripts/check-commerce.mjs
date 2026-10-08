import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && publicKey && serviceKey, "Configure the Supabase environment before running.");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, serviceKey, options);
const anonymous = createClient(url, publicKey, options);

// No signup, uploads, orders, confirmation or other writes: SELECT/count checks and
// the SELECT-only PDF resolver with a nonexistent product. Never print records/keys.
for (const table of ["orders", "order_items", "product_files", "access_grants", "admin_audit_events", "product_uploads"]) {
  const { error } = await service.from(table).select("id", { head: true }).limit(0);
  assert.equal(error, null, `Server table contract failed: ${table}`);
  // GET preserves the PostgREST error code; HEAD has no JSON error body.
  const denied = await anonymous.from(table).select("id").limit(1);
  assert.equal(denied.error?.code, "42501", `Anonymous permission unexpectedly changed: ${table}`);
  console.log(`${table}: server contract OK; anonymous access denied`);
}

const candidate = await service.from("profiles").select("id").eq("email", "bernardozsoares11@gmail.com").maybeSingle();
assert.equal(candidate.error, null, "Admin profile lookup failed");
assert.ok(candidate.data, "Admin profile unavailable");
const account = await service.auth.admin.getUserById(candidate.data.id);
assert.equal(account.error, null, "Auth account validation failed");
assert.equal(account.data.user.email?.toLowerCase(), "bernardozsoares11@gmail.com");
assert.ok(account.data.user.email_confirmed_at, "Admin account must be confirmed");
const adminAllowed = await service.rpc("teorema_admin_check", { p_actor_id: account.data.user.id });
assert.equal(adminAllowed.error, null, "UUID administrator eligibility failed");
assert.equal(adminAllowed.data, true, "Administrator access must be explicitly granted");
const adminDenied = await anonymous.rpc("teorema_admin_check", { p_actor_id: account.data.user.id });
assert.equal(adminDenied.error?.code, "42501", "Anonymous admin RPC must remain denied");
const catalogContract = await service.from("products").select("id,publication_status,revision,updated_at", { head: true }).limit(0);
assert.equal(catalogContract.error, null, "Stage 3 product columns unavailable");
console.log("Stage 3: product columns and server-only UUID administrator check OK");

// A randomly generated product is first verified absent, so this request can never
// resolve an actual customer's material. The function is SELECT-only regardless.
const missingProduct = randomUUID();
const product = await service.from("products").select("id", { head: true, count: "exact" }).eq("id", missingProduct);
assert.equal(product.error, null, "Product absence verification failed");
assert.equal(product.count, 0, "Generated test product unexpectedly exists");
const resolved = await service.rpc("teorema_resolve_pdf", { p_user_id: account.data.user.id, p_product_id: missingProduct });
assert.equal(resolved.error?.code, "42501", "PDF authorization did not reject unavailable material");
assert.equal(resolved.error?.message, "Material not authorized", "Server Auth eligibility/helper failed before access verification");
console.log("PostgREST service_role -> private Auth eligibility -> PDF access guard: OK");
const rejected = await anonymous.rpc("teorema_resolve_pdf", { p_user_id: account.data.user.id, p_product_id: missingProduct });
assert.equal(rejected.error?.code, "42501", "Anonymous RPC execution must remain denied");
console.log("Anonymous PDF resolver execution: denied");
const library = await service.rpc("teorema_read_library", { p_user_id: account.data.user.id, p_page: 1 });
assert.equal(library.error, null, "Stage 8 library RPC unavailable");
assert.ok(Array.isArray(library.data?.items) && library.data.items.length <= 20 && library.data.size === 20, "Library page contract failed");
assert.doesNotMatch(JSON.stringify(library.data), /object_key|bucket_id|sha256|granted_by|cpf|token/, "Library must not expose delivery credentials");
const libraryDenied = await anonymous.rpc("teorema_read_library", { p_user_id: account.data.user.id, p_page: 1 });
assert.equal(libraryDenied.error?.code, "42501", "Anonymous library RPC must remain denied");
console.log("Stage 8: paginated server-only library contract OK; anonymous execution denied");
console.log("Read-only smoke test complete; no accounts, orders, uploads or grants created.");
