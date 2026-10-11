import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const magic = Buffer.from("TEOBKP01");
const limits = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export const BACKUP_MAX_BYTES = 128 * 1024 * 1024;

export function validBackupPassphrase(value) {
  return typeof value === "string" && value.length >= 20 && value.length <= 1024 &&
    !/[\r\n\0]/.test(value) && value.trim().length >= 20;
}

// Versioned, documented envelope; only Node's standard cryptographic primitives.
// The passphrase is never included in the header or encrypted payload.
export async function encryptBackup(plaintext, passphrase) {
  if (!Buffer.isBuffer(plaintext) || plaintext.length > BACKUP_MAX_BYTES || !validBackupPassphrase(passphrase))
    throw new Error("BACKUP_ENCRYPTION_INPUT_INVALID");
  const salt = randomBytes(32), iv = randomBytes(12);
  const metadata = Buffer.from(JSON.stringify({ v: 1, cipher: "aes-256-gcm", kdf: "scrypt",
    N: limits.N, r: limits.r, p: limits.p, salt: salt.toString("base64"), iv: iv.toString("base64") }));
  const length = Buffer.alloc(4); length.writeUInt32BE(metadata.length);
  const header = Buffer.concat([magic, length, metadata]);
  const key = await derive(passphrase, salt, 32, limits);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(header);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([header, cipher.getAuthTag(), ciphertext]);
  } finally { key.fill(0); }
}

export async function decryptBackup(envelope, passphrase) {
  let key, unverified;
  try {
    if (!Buffer.isBuffer(envelope) || envelope.length < 40 || envelope.length > BACKUP_MAX_BYTES + 2048 ||
        !envelope.subarray(0, 8).equals(magic) || !validBackupPassphrase(passphrase)) throw new Error();
    const size = envelope.readUInt32BE(8);
    if (size < 1 || size > 1024 || envelope.length < 12 + size + 16) throw new Error();
    const metadata = JSON.parse(envelope.subarray(12, 12 + size).toString("utf8"));
    if (metadata.v !== 1 || metadata.cipher !== "aes-256-gcm" || metadata.kdf !== "scrypt" ||
        metadata.N !== limits.N || metadata.r !== limits.r || metadata.p !== limits.p ||
        typeof metadata.salt !== "string" || typeof metadata.iv !== "string") throw new Error();
    const salt = Buffer.from(metadata.salt, "base64"), iv = Buffer.from(metadata.iv, "base64");
    if (salt.length !== 32 || iv.length !== 12 || salt.toString("base64") !== metadata.salt ||
        iv.toString("base64") !== metadata.iv) throw new Error();
    key = await derive(passphrase, salt, 32, limits);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(envelope.subarray(0, 12 + size));
    decipher.setAuthTag(envelope.subarray(12 + size, 28 + size));
    unverified = decipher.update(envelope.subarray(28 + size));
    // No consumer receives decrypted bytes until GCM authenticates the entire file.
    const final = decipher.final();
    return Buffer.concat([unverified, final]);
  } catch { throw new Error("BACKUP_AUTHENTICATION_FAILED"); }
  finally { key?.fill(0); unverified?.fill(0); }
}
