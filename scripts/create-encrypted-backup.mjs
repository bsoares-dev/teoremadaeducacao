// Operator-only CLI. No restore, remote writes, scheduling or commercial enablement.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, rename } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { BACKUP_PROJECT_REF, BACKUP_PROJECT_URL, backupDirectoryOutsideWorkspace } from "./backup/readiness.mjs";
import { BACKUP_MAX_BYTES, validBackupPassphrase, encryptBackup, decryptBackup } from "./backup/encryption.mjs";
import { postgresTools, postgresEnvironment, runPostgres, readOnlyQuery, inspectArchive } from "./backup/native-tools.mjs";
import { sha256, backupRecord as record, readBackupRecord as verifyRecord, assertCoreTables } from "./backup/records.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const run = promisify(execFile);
const psqlInventory = await readFile(new URL("../supabase/backup-inventory.sql", import.meta.url), "utf8");
const localConfigurationNames = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "ENCRYPTION_KEY", "PDF_LICENSE_SECRET", "PDF_MAX_DOWNLOADS", "PDF_SHOW_CUSTOMER_NAME", "PDF_SHOW_CUSTOMER_EMAIL",
  "PDF_MASK_CUSTOMER_EMAIL", "PDF_ENCRYPTION_ENABLED", "TEOREMA_PRODUCT_UPLOADS_ENABLED", "TEOREMA_CART_ENABLED"];

async function checkDirectory(directory) {
  if (process.platform !== "win32" || !backupDirectoryOutsideWorkspace(directory, process.cwd(),
    [process.env.OneDrive, process.env.OneDriveCommercial, process.env.OneDriveConsumer])) throw new Error("BACKUP_DIRECTORY_UNSAFE");
  const physical = await realpath(directory);
  if (path.resolve(physical).toLowerCase() !== path.resolve(directory).toLowerCase()) throw new Error("BACKUP_DIRECTORY_UNSAFE");
  // Restrict existing root to the current user + SYSTEM and reject reparse points.
  const command = `$ErrorActionPreference='Stop'; $taskRoot=$env:TEOREMA_BACKUP_CHECK_DIR;
    $taskSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
    $taskAllowed=@($taskSid,'S-1-5-18'); $taskItem=Get-Item -LiteralPath $taskRoot;
    while ($taskItem) { if ($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'UNSAFE' }; $taskItem=$taskItem.Parent };
    $taskAcl=Get-Acl -LiteralPath $taskRoot; if (-not $taskAcl.AreAccessRulesProtected) { throw 'UNSAFE' };
    $taskRules=$taskAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]);
    foreach ($taskRule in $taskRules) { if ($taskRule.IdentityReference.Value -notin $taskAllowed -or $taskRule.AccessControlType -ne 'Allow') { throw 'UNSAFE' } };
    foreach ($taskOwner in $taskAllowed) { if (-not ($taskRules | Where-Object { $_.IdentityReference.Value -eq $taskOwner -and ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl })) { throw 'UNSAFE' } }; 'SAFE'`;
  try {
    const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
      env: { ...postgresEnvironment(process.env.TEOREMA_BACKUP_DB_URL, process.env), PGPASSWORD: undefined, TEOREMA_BACKUP_CHECK_DIR: directory },
      windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024,
    });
    if (stdout.trim() !== "SAFE") throw new Error();
  } catch { throw new Error("BACKUP_DIRECTORY_UNSAFE"); }
}

async function storageInventory(client) {
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error || !buckets) throw new Error("BACKUP_STORAGE_FAILED");
  const objects = [], visited = new Set();
  async function walk(bucket, prefix, depth) {
    if (depth > 64) throw new Error("BACKUP_STORAGE_TOO_LARGE");
    for (let offset = 0; ; offset += 100) {
      const result = await client.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (result.error || !result.data) throw new Error("BACKUP_STORAGE_FAILED");
      for (const entry of result.data) {
        const key = prefix ? prefix + "/" + entry.name : entry.name;
        if (!entry.name || entry.name.includes("/") || key.length > 4096) throw new Error("BACKUP_STORAGE_INVALID");
        if (!entry.id) { await walk(bucket, key, depth + 1); continue; }
        const identity = bucket + "/" + key;
        if (visited.has(identity) || objects.length >= 10000) throw new Error("BACKUP_STORAGE_INVALID");
        visited.add(identity); objects.push({ ...entry, bucket, key });
      }
      if (result.data.length < 100) break;
    }
  }
  for (const bucket of [...buckets].sort((a, b) => a.id.localeCompare(b.id))) await walk(bucket.id, "", 0);
  objects.sort((a, b) => (a.bucket + "/" + a.key).localeCompare(b.bucket + "/" + b.key));
  return { buckets: [...buckets].sort((a, b) => a.id.localeCompare(b.id)), objects };
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--create") throw new Error("BACKUP_EXPLICIT_CREATE_REQUIRED");
  const value = process.env.TEOREMA_BACKUP_DB_URL, passphrase = process.env.TEOREMA_BACKUP_PASSPHRASE;
  const environment = postgresEnvironment(value, process.env), tools = postgresTools(process.env);
  if (!validBackupPassphrase(passphrase) || passphrase === environment.PGPASSWORD) throw new Error("BACKUP_PASSPHRASE_INVALID");
  // Avoid encrypting with a silently expanded $VARIABLE instead of the saved password.
  const dotenv = await readFile(path.join(process.cwd(), ".env.local"), "utf8");
  const passphraseLine = dotenv.split(/\r?\n/).find(line => /^\s*TEOREMA_BACKUP_PASSPHRASE\s*=/.test(line));
  if (passphraseLine && /(?<!\\)\$/.test(passphraseLine)) throw new Error("BACKUP_PASSPHRASE_ESCAPE_REQUIRED");
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== BACKUP_PROJECT_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("BACKUP_PROJECT_INVALID");
  const directory = process.env.TEOREMA_BACKUP_DIR || path.join(process.env.USERPROFILE || "", "CodeCommerce", "TeoremaBackups");
  await checkDirectory(directory);
  const toolVersions = {};
  for (const [name, binary] of Object.entries(tools)) {
    const version = (await runPostgres(binary, ["--version"], environment)).toString("utf8").trim();
    if (!/PostgreSQL\) (17|18)\./.test(version)) throw new Error("BACKUP_TOOL_VERSION_INVALID");
    toolVersions[name] = version;
  }
  const identity = await readOnlyQuery(tools.sql, `begin read only; select json_build_object(
    'database',current_database(),'version',current_setting('server_version'),'readOnly',current_setting('transaction_read_only'),
    'subscriptions',(select count(*) from pg_subscription)); commit;`, environment);
  if (identity.database !== "postgres" || !/^17\./.test(identity.version) || identity.readOnly !== "on") throw new Error("BACKUP_PROJECT_INVALID");
  // Subscription connection strings require a separately approved recovery plan.
  if (identity.subscriptions !== 0) throw new Error("BACKUP_SUBSCRIPTIONS_UNSUPPORTED");
  const startedAt = new Date().toISOString();
  const before = await readOnlyQuery(tools.sql, psqlInventory, environment);
  const client = createClient(BACKUP_PROJECT_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) },
  });
  const firstStorage = await storageInventory(client);
  const sourceObjectCount = before.buckets.reduce((sum, bucket) => sum + bucket.objects, 0);
  if (sourceObjectCount !== firstStorage.objects.length || before.missing_validated_objects !== 0) throw new Error("BACKUP_STORAGE_CHANGED");
  const migrations = await readOnlyQuery(tools.sql, "begin read only; select coalesce(json_agg(version order by version),'[]'::json) from supabase_migrations.schema_migrations; commit;", environment);
  // Full custom archive: no schema/owner/ACL filtering, no dump file in OneDrive.
  const database = await runPostgres(tools.dump, ["--no-password", "--format=custom", "--no-subscriptions", "--lock-wait-timeout=5s"], environment, "BACKUP_DATABASE_EXPORT_FAILED");
  const roles = await runPostgres(tools.roles, ["--no-password", "--roles-only", "--no-role-passwords"], environment, "BACKUP_ROLES_EXPORT_FAILED");
  const toc = await inspectArchive(tools.restore, database, environment);
  assertCoreTables(toc);
  if (/\bPASSWORD\s+'/.test(roles.toString("utf8"))) throw new Error("BACKUP_ROLES_PASSWORD_PRESENT");
  const storageObjects = []; let totalBytes = database.length + roles.length;
  for (const object of firstStorage.objects) {
    if (Number(object.metadata?.size) > BACKUP_MAX_BYTES - totalBytes) throw new Error("BACKUP_STORAGE_TOO_LARGE");
    const result = await client.storage.from(object.bucket).download(object.key);
    if (result.error || !result.data) throw new Error("BACKUP_STORAGE_FAILED");
    const bytes = Buffer.from(await result.data.arrayBuffer()); totalBytes += bytes.length;
    if (totalBytes > BACKUP_MAX_BYTES * 0.7) { bytes.fill(0); throw new Error("BACKUP_STORAGE_TOO_LARGE"); }
    storageObjects.push({ bucket: object.bucket, key: object.key, metadata: object, content: record(bytes) }); bytes.fill(0);
  }
  const lastStorage = await storageInventory(client);
  const after = await readOnlyQuery(tools.sql, psqlInventory, environment);
  if (sha256(JSON.stringify(firstStorage)) !== sha256(JSON.stringify(lastStorage)) ||
      JSON.stringify(before.buckets) !== JSON.stringify(after.buckets)) throw new Error("BACKUP_STORAGE_CHANGED");
  const { stdout: gitCommit } = await run("git", ["rev-parse", "HEAD"], { windowsHide: true, timeout: 10000, maxBuffer: 1024 });
  const backupId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
  const payload = { format: "teorema-backup-bundle", version: 1, projectRef: BACKUP_PROJECT_REF, backupId,
    startedAt, completedAt: new Date().toISOString(), gitCommit: gitCommit.trim(), toolVersions, migrations, before, after,
    database: { format: "postgres-custom", ...record(database) }, roles: record(roles),
    storage: { buckets: firstStorage.buckets, objects: storageObjects },
    localConfiguration: Object.fromEntries(localConfigurationNames.filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]])),
    limitations: ["Native archive includes Supabase-managed objects; restore requires compatible services/extensions and review.",
      "Replication subscriptions are not exported; export refuses a source containing subscriptions.",
      "Role passwords, SMTP/provider configuration, DNS, Vercel remote variables and external encryption keys are not exported.",
      "No isolated restore or actual Auth/Storage service test has been executed.",
      "Database snapshot and Storage are not an atomic combined snapshot; Storage metadata was compared before/after."] };
  database.fill(0); roles.fill(0); delete environment.PGPASSWORD;
  const plaintext = Buffer.from(JSON.stringify(payload));
  const encrypted = await encryptBackup(plaintext, passphrase);
  const outputDirectory = path.join(directory, backupId);
  await mkdir(outputDirectory, { mode: 0o700 });
  const partial = path.join(outputDirectory, "teorema.backup.partial.enc");
  const handle = await open(partial, "wx", 0o600);
  try { await handle.writeFile(encrypted); await handle.sync(); } finally { await handle.close(); }
  const reread = await readFile(partial);
  const restored = await decryptBackup(reread, passphrase);
  if (!restored.equals(plaintext)) throw new Error("BACKUP_PAYLOAD_INVALID");
  const checked = JSON.parse(restored.toString("utf8"));
  const checkedDatabase = verifyRecord(checked.database), checkedRoles = verifyRecord(checked.roles);
  assertCoreTables(await inspectArchive(tools.restore, checkedDatabase, environment));
  checkedDatabase.fill(0); checkedRoles.fill(0);
  for (const object of checked.storage.objects) verifyRecord(object.content).fill(0);
  plaintext.fill(0); restored.fill(0);
  const finalPath = path.join(outputDirectory, "teorema.backup.enc");
  await rename(partial, finalPath);
  // Safe summary only; no personal records, object names, credentials or dump stderr.
  console.log(JSON.stringify({ backupId, projectRef: BACKUP_PROJECT_REF, databaseBackupCreated: true,
    storageBackupCreated: true, encryptionVerified: true, archiveReadVerified: true, isolatedRecoveryVerified: false,
    storageObjects: storageObjects.length, accounts: before.accounts, profiles: before.profiles, products: before.products,
    migrations: migrations.length, encryptedBytes: reread.length, encryptedSha256: sha256(reread),
    commercialReleaseApprovedByThisBackup: false }));
}

main().catch(error => {
  const code = error instanceof Error && /^BACKUP_[A-Z_]+$/.test(error.message) ? error.message : "BACKUP_FAILED";
  console.error(JSON.stringify({ errorCode: code, backupVerified: false, isolatedRecoveryVerified: false }));
  process.exitCode = 1;
});
