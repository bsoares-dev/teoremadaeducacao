import { randomUUID } from "node:crypto";
import { sql } from "@vercel/postgres";
import { decryptSensitive, encryptSensitive, maskCpf, maskPhone, stableHash } from "./security";
import type { RegistrationInput } from "./validation";

export async function createRegistration(input: RegistrationInput, ipHash: string) {
  await sql`
    INSERT INTO registrations (id, name_ciphertext, email_ciphertext, phone_ciphertext, cpf_ciphertext, email_hash, cpf_hash, ip_hash)
    VALUES (${randomUUID()}, ${encryptSensitive(input.name)}, ${encryptSensitive(input.email)}, ${encryptSensitive(input.phone)}, ${encryptSensitive(input.cpf)}, ${stableHash(input.email)}, ${stableHash(input.cpf)}, ${ipHash})
  `;
}

export async function listRegistrations() {
  const { rows } = await sql`
    SELECT id, name_ciphertext, email_ciphertext, phone_ciphertext, cpf_ciphertext, created_at
    FROM registrations
    ORDER BY created_at DESC
    LIMIT 500
  `;
  return rows.map((row) => {
    const phone = decryptSensitive(row.phone_ciphertext as string);
    const cpf = decryptSensitive(row.cpf_ciphertext as string);
    return {
      id: row.id,
      name: decryptSensitive(row.name_ciphertext as string),
      email: decryptSensitive(row.email_ciphertext as string),
      phone: maskPhone(phone),
      cpf: maskCpf(cpf),
      createdAt: row.created_at,
    };
  });
}
