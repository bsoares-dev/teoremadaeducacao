import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !pub || !admin) throw new Error("Configure as três variáveis Supabase antes de verificar.");

// HEAD checks schema/grants and count visibility, never retrieves personal records.
for (const [table, columns] of [
  ["profiles", "id,email,cpf,phone,created_at"],
  ["products", "id,name,description,price,image_url,is_active,created_at"],
  ["carts", "id,user_id,status,total_amount,created_at,updated_at"],
  ["cart_items", "id,cart_id,product_id,quantity,unit_price,created_at"],
  ["registrations", "id"],
]) {
  const response = await fetch(base + "/rest/v1/" + table + "?select=" + columns + "&limit=0", {
    method: "HEAD", headers: { apikey: admin, Authorization: "Bearer " + admin },
    signal: AbortSignal.timeout(15000),
  });
  console.log(table + ": contrato " + (response.ok ? "OK" : "HTTP " + response.status));
  if (!response.ok) process.exitCode = 1;
}
for (const table of ["profiles", "registrations", "carts", "cart_items"]) {
  const response = await fetch(base + "/rest/v1/" + table + "?select=id&limit=0", {
    method: "HEAD", headers: { apikey: pub, Prefer: "count=exact" }, signal: AbortSignal.timeout(15000),
  });
  const count = response.headers.get("content-range")?.split("/").at(-1);
  const visible = response.ok && count && count !== "*" && Number(count) > 0;
  const denied = [401,403].includes(response.status);
  console.log(table + ": acesso anônimo " + (visible ? "FALHA: registros visíveis" : response.ok ? "nenhuma linha visível (não comprova RLS sozinho)" : denied ? "bloqueado HTTP " + response.status : "INCONCLUSIVO HTTP " + response.status));
  if (!response.ok && !denied) process.exitCode = 1;
  if (visible) process.exitCode = 1;
}
const catalog = await fetch(base + "/rest/v1/products?select=id,name,description,price,image_url&limit=0", {
  method: "HEAD", headers: { apikey: pub }, signal: AbortSignal.timeout(15000),
});
console.log("Catálogo público: HTTP " + catalog.status);
if (!catalog.ok) process.exitCode = 1;
const auth = await fetch(base + "/auth/v1/settings", {
  headers: { apikey: pub }, signal: AbortSignal.timeout(15000),
});
if (auth.ok) {
  const data = await auth.json();
  console.log("Confirmação de e-mail: " + (data.mailer_autoconfirm ? "desabilitada" : "habilitada"));
}
console.log("Triggers e políticas completas exigem executar supabase/audit.sql no SQL Editor.");
