import { z } from "zod";

const onlyDigits = (value: string) => value.replace(/\D/g, "");

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^([0-9])\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let index = 0; index < 9; index += 1) sum += Number(cpf[index]) * (10 - index);
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;
  sum = 0;
  for (let index = 0; index < 10; index += 1) sum += Number(cpf[index]) * (11 - index);
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === Number(cpf[10]);
}

export const registrationSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome e sobrenome.").max(120, "Nome muito longo."),
  email: z.string().trim().email("Informe um e-mail válido.").max(160, "E-mail muito longo.").transform((value) => value.toLowerCase()),
  phone: z.string().transform(onlyDigits).refine((value) => value.length >= 10 && value.length <= 11, "Informe um telefone válido."),
  cpf: z.string().transform(onlyDigits).refine(isValidCpf, "Informe um CPF válido."),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
