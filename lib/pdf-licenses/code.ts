import { randomBytes } from "node:crypto";

// 128 random bits; no customer data, sequential IDs or environment secret.
// Node-only utility. Persistence/authorization live in server-only modules.
export function generateLicenseCode(): string {
  return `LIC-${randomBytes(16).toString("hex").toUpperCase()}`;
}
