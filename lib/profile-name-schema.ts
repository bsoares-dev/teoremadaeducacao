import { z } from "zod";

// Keep accents and spelling; only compose Unicode and normalize spaces.
export const fullNameSchema = z.string()
  .max(300, "Use no máximo 150 caracteres no nome.")
  .refine(value => !/[\p{Cc}\p{Cf}]/u.test(value), "Informe seu nome sem caracteres de controle.")
  .transform(value => value.normalize("NFC").trim().replace(/ +/g, " "))
  .pipe(z.string().min(2, "Informe seu nome completo.").max(150, "Use no máximo 150 caracteres no nome.")
    .regex(/^[\p{L}][\p{L}\p{M} .'’-]*$/u, "Informe seu nome sem números ou caracteres especiais."));

export const profileNameUpdateSchema = z.object({ fullName: fullNameSchema }).strict();
export const profileNameResultSchema = z.object({ fullName: fullNameSchema }).strict();
