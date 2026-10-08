// Inspect only client assets; report variable names/counts, never secret values.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const names = ["SUPABASE_SERVICE_ROLE_KEY", "POSTGRES_URL", "ENCRYPTION_KEY", "ADMIN_PASSWORD", "TEOREMA_TEST_ADMIN_PASSWORD"];
const secrets = names.filter(name => process.env[name]?.length >= 8).map(name => ({ name, value: process.env[name] }));
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + entry.name;
    if (entry.isDirectory()) await walk(path);
    else if (/\.(js|json|map)$/.test(entry.name)) files.push(path);
  }
}
await walk(".next/static");
assert.ok(files.length > 0, "Production client build missing");
const violations = new Set();
for (const path of files) {
  const content = await readFile(path, "utf8");
  for (const secret of secrets) if (content.includes(secret.value) || content.includes(encodeURIComponent(secret.value))) violations.add(secret.name);
}
assert.equal(violations.size, 0, `Server credential values present in client bundle: ${[...violations].join(", ")}`);
console.log(`PASS: ${files.length} client assets scanned; no configured server credential values found. Source/env files were not printed.`);
