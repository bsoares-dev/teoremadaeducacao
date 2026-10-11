import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encryptBackup, decryptBackup, validBackupPassphrase } from "../scripts/backup/encryption.mjs";
import { postgresEnvironment, postgresTools, systemEnvironment } from "../scripts/backup/native-tools.mjs";
import { backupRecord, readBackupRecord, assertCoreTables } from "../scripts/backup/records.mjs";
import { BACKUP_PROJECT_REF } from "../scripts/backup/readiness.mjs";

const phrase = "synthetic-backup-passphrase-not-a-real-secret";

test("backup encryption authenticates binary/Unicode content and uses unique salt/IV", async () => {
  const bytes = Buffer.concat([Buffer.from([0, 255, 128]), Buffer.from("João • Débora: fixture privada")]);
  const first = await encryptBackup(bytes, phrase), second = await encryptBackup(bytes, phrase);
  assert.notDeepEqual(first, second);
  assert.equal(first.includes(bytes), false);
  assert.equal(first.includes(Buffer.from(phrase)), false);
  assert.deepEqual(await decryptBackup(first, phrase), bytes);
  assert.deepEqual(await decryptBackup(second, phrase), bytes);
});

test("wrong password, corruption, truncation and metadata tampering do not release plaintext", async () => {
  const encrypted = await encryptBackup(Buffer.from("synthetic-sensitive-content"), phrase);
  await assert.rejects(decryptBackup(encrypted, phrase + "wrong"), /BACKUP_AUTHENTICATION_FAILED/);
  const changed = Buffer.from(encrypted); changed[changed.length - 1] ^= 1;
  await assert.rejects(decryptBackup(changed, phrase), /BACKUP_AUTHENTICATION_FAILED/);
  await assert.rejects(decryptBackup(encrypted.subarray(0, encrypted.length - 3), phrase), /BACKUP_AUTHENTICATION_FAILED/);
  const header = Buffer.from(encrypted); header.writeUInt32BE(0xffffffff, 8);
  await assert.rejects(decryptBackup(header, phrase), /BACKUP_AUTHENTICATION_FAILED/);
  const metadata = Buffer.from(encrypted); metadata[metadata.indexOf(Buffer.from("131072"))] = 57;
  await assert.rejects(decryptBackup(metadata, phrase), /BACKUP_AUTHENTICATION_FAILED/);
});

test("backup phrase must be explicit, sufficiently long and single-line", () => {
  assert.equal(validBackupPassphrase(phrase), true);
  for (const value of [undefined, "", "short", " ".repeat(25), "x".repeat(1025), phrase + "\n", phrase + "\0"])
    assert.equal(validBackupPassphrase(value), false);
});

test("native child receives only connection/system environment, never the backup key or app secrets", () => {
  const url = `postgresql://postgres.${BACKUP_PROJECT_REF}:synthetic%40password@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;
  const env = postgresEnvironment(url, { PATH: "synthetic-path", SYSTEMROOT: "synthetic-windows", PGPASSWORD: "wrong",
    PGHOST: "wrong-host", PGSERVICE: "wrong-service", TEOREMA_BACKUP_PASSPHRASE: phrase,
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key", ENCRYPTION_KEY: "synthetic-key" });
  assert.equal(env.PGPASSWORD, "synthetic@password");
  assert.equal(env.PGSSLMODE, "require");
  assert.equal(env.PGPORT, "5432");
  assert.equal(env.PGUSER, `postgres.${BACKUP_PROJECT_REF}`);
  assert.equal(env.PGSERVICE, undefined);
  assert.equal(env.TEOREMA_BACKUP_PASSPHRASE, undefined);
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(env.ENCRYPTION_KEY, undefined);
  assert.equal(env.PATH, "synthetic-path");
  assert.deepEqual(systemEnvironment({ PATH: "safe", PGHOST: "wrong", TEOREMA_BACKUP_PASSPHRASE: phrase }), { PATH: "safe" });
  assert.throws(() => postgresEnvironment(url.replace("5432", "6543"), {}), /BACKUP_CONNECTION_INVALID/);
  assert.equal(postgresTools({ TEOREMA_PG_DUMP_BIN: "explicit-tool" }).dump, "explicit-tool");
});

test("export remains CLI-only, readonly, encrypted, with no production restore or raw diagnostics", () => {
  const source = readFileSync(new URL("../scripts/create-encrypted-backup.mjs", import.meta.url), "utf8");
  assert.match(source, /BACKUP_EXPLICIT_CREATE_REQUIRED/);
  assert.match(source, /--no-role-passwords/);
  assert.match(source, /BACKUP_SUBSCRIPTIONS_UNSUPPORTED/);
  assert.match(source, /checkDirectory\(directory\)/);
  assert.match(source, /decryptBackup\(reread, passphrase\)/);
  assert.match(source, /isolatedRecoveryVerified: false/);
  assert.doesNotMatch(source, /console\.(log|error)\(error\)|writeFile\((database|roles|plaintext)|\.from\([^)]*\)\.update\(|\.upload\(|\.upsert\(/);
  const privateNames = source.match(/localConfigurationNames = \[([\s\S]*?)\];/)?.[1];
  assert.ok(privateNames);
  assert.doesNotMatch(privateNames, /TEOREMA_BACKUP_PASSPHRASE|TEOREMA_BACKUP_DB_URL|TEOREMA_TEST_ADMIN_PASSWORD/);
});

test("backup records reject incorrect size, digest and noncanonical base64", () => {
  const bytes = Buffer.from("synthetic-backup-record"), entry = backupRecord(bytes);
  assert.deepEqual(readBackupRecord(entry), bytes);
  for (const changed of [null, { ...entry, bytes: -1 }, { ...entry, bytes: entry.bytes + 1 },
    { ...entry, sha256: "0".repeat(64) }, { ...entry, base64: entry.base64 + "\n" }])
    assert.throws(() => readBackupRecord(changed), /BACKUP_PAYLOAD_INVALID/);
});

test("archive must contain Auth, Storage, application, private permissions and migration history", () => {
  const tables = ["auth users", "storage objects", "public profiles", "public products",
    "teorema_private commerce_admins", "supabase_migrations schema_migrations"];
  const toc = tables.map(table => `0; 0 0 TABLE DATA ${table} postgres`).join("\n");
  assert.doesNotThrow(() => assertCoreTables(toc));
  for (const table of tables) assert.throws(() => assertCoreTables(toc.replace(table, "missing")), /BACKUP_ARCHIVE_INCOMPLETE/);
});

test("independent inspection cannot connect to production, restore, write plaintext or print the payload", () => {
  const source = readFileSync(new URL("../scripts/inspect-encrypted-backup.mjs", import.meta.url), "utf8");
  assert.match(source, /BACKUP_EXPLICIT_FILE_REQUIRED/);
  assert.match(source, /isolatedRecoveryVerified: false/);
  assert.match(source, /decryptBackup\(encrypted, passphrase\)/);
  assert.doesNotMatch(source, /TEOREMA_BACKUP_DB_URL|createClient|postgresEnvironment|writeFile|\bupload\b|console\.log\(payload\)/);
});
