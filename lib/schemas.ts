import { z } from "zod";
import { fullNameSchema } from "./profile-name-schema";

export function isValidCpf(value: string) {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const digit = (sum * 10) % 11 % 10;
    if (digit !== Number(cpf[length])) return false;
  }
  return true;
}

export const signupSchema = z.object({
  fullName: fullNameSchema,
  email: z.string().trim().email("Informe um e-mail válido.").max(160).transform(v => v.toLowerCase()),
  password: z.string().min(8, "Use uma senha com pelo menos 8 caracteres.").max(128),
  cpf: z.string().transform(v => v.replace(/\D/g, "")).refine(isValidCpf, "Informe um CPF válido."),
  phone: z.string().transform(v => v.replace(/\D/g, "")).refine(v => /^[1-9]{2}\d{8,9}$/.test(v), "Informe DDD e telefone válidos."),
}).strict();

export const productSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  description: z.string().trim().min(10, "Use pelo menos 10 caracteres na descrição.").max(2000),
  price: z.coerce.number().finite().positive("Informe um preço maior que zero.").max(1000000)
    .refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001, "Use no máximo duas casas decimais."),
  imageUrl: z.string().trim().max(2000).url("Informe uma URL válida.")
    .refine(v => v.startsWith("https://"), "A imagem precisa usar HTTPS."),
});

export function pagination(value: string | null, size = 20) {
  const page = Math.min(10000, Math.max(1, Number.parseInt(value || "1", 10) || 1));
  return { page, size, from: (page - 1) * size, to: page * size - 1 };
}
