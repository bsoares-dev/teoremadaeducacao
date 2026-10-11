// Offline inspection only: no database credentials, network, restore or plaintext output.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { BACKUP_PROJECT_REF } from "./backup/readiness.mjs";
import { BACKUP_MAX_BYTES, decryptBackup, validBackupPassphrase } from "./backup/encryption.mjs";
import { postgresTools, systemEnvironment, inspectArchive } from "./backup/native-tools.mjs";
import { sha256, readBackupRecord, assertCoreTables } from "./backup/records.mjs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== "--file" || !path.isAbsolute(process.argv[3]))
    throw new Error("BACKUP_EXPLICIT_FILE_REQUIRED");
  const passphrase = process.env.TEOREMA_BACKUP_PASSPHRASE;
  if (!validBackupPassphrase(passphrase)) throw new Error("BACKUP_PASSPHRASE_INVALID");
  const dotenv = await readFile(path.join(process.cwd(), ".env.local"), "utf8").catch(error => {
    if (error.code === "ENOENT") return "";
    throw new Error("BACKUP_ENV_READ_FAILED");
  });
  const line = dotenv.split(/\r?\n/).find(value => /^\s*TEOREMA_BACKUP_PASSPHRASE\s*=/.test(value));
  if (line && /(?<!\\)\$/.test(line)) throw new Error("BACKUP_PASSPHRASE_ESCAPE_REQUIRED");
  const file = await stat(process.argv[3]);
  if (!file.isFile() || file.size > BACKUP_MAX_BYTES + 2048) throw new Error("BACKUP_FILE_INVALID");
  const encrypted = await readFile(process.argv[3]);
  let plaintext, database, roles;
  try {
    plaintext = await decryptBackup(encrypted, passphrase);
    const payload = JSON.parse(plaintext.toString("utf8"));
    if (payload.format !== "teorema-backup-bundle" || payload.version !== 1 || payload.projectRef !== BACKUP_PROJECT_REF ||
        payload.database?.format !== "postgres-custom" || !Array.isArray(payload.migrations) ||
        !Array.isArray(payload.storage?.buckets) || !Array.isArray(payload.storage?.objects))
      throw new Error("BACKUP_PAYLOAD_INVALID");
    for (const count of [payload.before?.accounts, payload.before?.profiles, payload.before?.products])
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("BACKUP_PAYLOAD_INVALID");
    database = readBackupRecord(payload.database); roles = readBackupRecord(payload.roles);
    if (/\bPASSWORD\s+'/.test(roles.toString("utf8"))) throw new Error("BACKUP_ROLES_PASSWORD_PRESENT");
    assertCoreTables(await inspectArchive(postgresTools(process.env).restore, database, systemEnvironment(process.env)));
    const seen = new Set(), bucketIds = new Set(payload.storage.buckets.map(bucket => bucket.id));
    if (bucketIds.size !== payload.storage.buckets.length) throw new Error("BACKUP_PAYLOAD_INVALID");
    for (const object of payload.storage.objects) {
      const identity = object.bucket + "/" + object.key;
      if (!bucketIds.has(object.bucket) || typeof object.key !== "string" || !object.key || seen.has(identity))
        throw new Error("BACKUP_PAYLOAD_INVALID");
      seen.add(identity); readBackupRecord(object.content).fill(0);
    }
    console.log(JSON.stringify({ projectRef: BACKUP_PROJECT_REF, encryptionVerified: true, archiveReadVerified: true,
      encryptedBytes: encrypted.length, encryptedSha256: sha256(encrypted), buckets: payload.storage.buckets.length,
      storageObjects: seen.size, accounts: payload.before.accounts, profiles: payload.before.profiles,
      products: payload.before.products, migrations: payload.migrations.length,
      isolatedRecoveryVerified: false, commercialReleaseApprovedByThisCheck: false }));
  } finally { plaintext?.fill(0); database?.fill(0); roles?.fill(0); }
}

main().catch(error => {
  const code = error instanceof Error && /^BACKUP_[A-Z_]+$/.test(error.message) ? error.message : "BACKUP_INSPECTION_FAILED";
  console.error(JSON.stringify({ errorCode: code, backupVerified: false, isolatedRecoveryVerified: false }));
  process.exitCode = 1;
});
