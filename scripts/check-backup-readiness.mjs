import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { BACKUP_PROJECT_URL, databaseBackupConnectionConfigured, backupDirectoryOutsideWorkspace, backupReadinessSummary } from "./backup/readiness.mjs";
import { postgresTools } from "./backup/native-tools.mjs";

nextEnv.loadEnvConfig(process.cwd());
const run = promisify(execFile);
async function toolAvailable(binary) {
  try {
    const { stdout } = await run(binary, ["--version"], { timeout: 10000, windowsHide: true });
    return /PostgreSQL\) (17|18)\./.test(stdout);
  } catch { return false; }
}

// Deliberately no writes, Auth mutations, SQL execution, export or auto-install.
async function main() {
  const directory = process.env.TEOREMA_BACKUP_DIR || (process.env.USERPROFILE &&
    path.join(process.env.USERPROFILE, "CodeCommerce", "TeoremaBackups"));
  const remoteReadable = process.env.NEXT_PUBLIC_SUPABASE_URL === BACKUP_PROJECT_URL &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const tools = postgresTools(process.env);
  const [pgDump, pgRestore, psql] = await Promise.all([
    toolAvailable(tools.dump),
    toolAvailable(tools.restore),
    toolAvailable(tools.sql),
  ]);
  const summary = backupReadinessSummary({
    connection: databaseBackupConnectionConfigured(process.env.TEOREMA_BACKUP_DB_URL),
    privateDirectory: backupDirectoryOutsideWorkspace(directory, process.cwd(),
      [process.env.OneDrive, process.env.OneDriveCommercial, process.env.OneDriveConsumer]),
    pgDump, pgRestore, psql, remoteReadable,
  });
  const inventory = { buckets: [], counts: {}, pendingUploads: 0, validatedFiles: 0, missingValidatedObjects: 0 };
  if (remoteReadable) {
    const client = createClient(BACKUP_PROJECT_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) } });
    const buckets = await client.storage.listBuckets();
    if (buckets.error) throw new Error("STORAGE_INVENTORY_FAILED");
    inventory.buckets = buckets.data.map(bucket => ({ id: bucket.id, public: bucket.public }));
    for (const table of ["profiles", "products", "orders", "order_items", "product_files", "access_grants", "pdf_licenses", "pdf_download_logs", "registrations"]) {
      const result = await client.from(table).select("id", { head: true, count: "exact" });
      if (result.error || result.count === null) throw new Error("TABLE_COUNT_FAILED");
      inventory.counts[table] = result.count;
    }
    const pending = await client.from("product_uploads").select("id", { head: true, count: "exact" }).eq("state", "UPLOADING");
    if (pending.error || pending.count === null) throw new Error("UPLOAD_COUNT_FAILED");
    inventory.pendingUploads = pending.count;
    // Check only validated objects. An unfinished reservation is not a lost PDF.
    for (let offset = 0; ; offset += 100) {
      const files = await client.from("product_files").select("id,bucket_id,object_key")
        .eq("validation_status", "VALIDATED").order("id").range(offset, offset + 99);
      if (files.error || !files.data) throw new Error("FILE_INVENTORY_FAILED");
      for (const file of files.data) {
        const object = await client.storage.from(file.bucket_id).info(file.object_key);
        if (object.error) {
          const status = Number(object.error.status ?? object.error.statusCode);
          if ([400, 404].includes(status) && ["not_found", "NoSuchKey"].includes(object.error.code)) inventory.missingValidatedObjects++;
          else if (status === 404) inventory.missingValidatedObjects++;
          else throw new Error("OBJECT_INSPECTION_FAILED");
        }
        inventory.validatedFiles++;
      }
      if (files.data.length < 100) break;
    }
  }
  console.log(JSON.stringify({ ...summary, inventory }, null, 2));
  console.log("PRECHECK ONLY: nenhum backup criado, nenhum dado alterado, nenhuma recuperação ou venda habilitada.");
  process.exitCode = summary.nativeExportPrerequisitesPresent && inventory.missingValidatedObjects === 0 ? 0 : 2;
}

main().catch(() => {
  // Do not expose URLs, object paths, credentials, personal data or raw SDK errors.
  console.error("BACKUP_PRECHECK_FAILED: conferência incompleta; nenhuma alteração remota realizada.");
  process.exitCode = 1;
});
