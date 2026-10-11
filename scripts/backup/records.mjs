import { createHash } from "node:crypto";
import { BACKUP_MAX_BYTES } from "./encryption.mjs";

export const sha256 = value => createHash("sha256").update(value).digest("hex");
export function backupRecord(bytes) {
  return { bytes: bytes.length, sha256: sha256(bytes), base64: bytes.toString("base64") };
}

export function readBackupRecord(entry) {
  if (!entry || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > BACKUP_MAX_BYTES ||
      typeof entry.base64 !== "string" || entry.base64.length > Math.ceil(BACKUP_MAX_BYTES / 3) * 4 ||
      typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("BACKUP_PAYLOAD_INVALID");
  const bytes = Buffer.from(entry.base64, "base64");
  if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256 || bytes.toString("base64") !== entry.base64) {
    bytes.fill(0); throw new Error("BACKUP_PAYLOAD_INVALID");
  }
  return bytes;
}

export function assertCoreTables(toc) {
  for (const [schema, table] of [["auth", "users"], ["storage", "objects"], ["public", "profiles"], ["public", "products"],
    ["teorema_private", "commerce_admins"], ["supabase_migrations", "schema_migrations"]]) {
    if (!toc.includes(`TABLE DATA ${schema} ${table} `)) throw new Error("BACKUP_ARCHIVE_INCOMPLETE");
  }
}
