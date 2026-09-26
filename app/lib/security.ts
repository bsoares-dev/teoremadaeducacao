import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function getEncryptionKey() {
  const value = process.env.ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hexadecimal value.");
  }
  return Buffer.from(value, "hex");
}

export function encryptSensitive(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSensitive(value: string) {
  const [iv, authTag, encrypted] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function stableHash(value: string) {
  const hashKey = createHash("sha256").update(Buffer.concat([getEncryptionKey(), Buffer.from("teorema-hmac-v1")])).digest();
  return createHmac("sha256", hashKey).update(value).digest("hex");
}

export function isValidSecret(input: string, expected: string) {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  return inputBuffer.length === expectedBuffer.length && timingSafeEqual(inputBuffer, expectedBuffer);
}

export function createAdminSession() {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const payload = `admin.${expiresAt}`;
  return `${payload}.${stableHash(payload)}`;
}

export function isValidAdminSession(token: string | undefined) {
  if (!token) return false;
  const [scope, expiresAt, signature] = token.split(".");
  if (scope !== "admin" || !expiresAt || !signature || Number(expiresAt) < Date.now()) return false;
  const expected = stableHash(`${scope}.${expiresAt}`);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function maskCpf(cpf: string) {
  return `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`;
}

export function maskPhone(phone: string) {
  return `(${phone.slice(0, 2)}) *****-${phone.slice(-4)}`;
}

export function hashIp(ip: string) {
  return createHash("sha256").update(ip).digest("hex");
}
