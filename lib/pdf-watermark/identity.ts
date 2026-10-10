import { z } from "zod";
import { licenseCodeSchema } from "../pdf-licenses/types";
import { fullNameSchema } from "../profile-name-schema";
import { PdfWatermarkError, type PdfPersonalizationInput, type PdfWatermarkConfig } from "./types";

const emailSchema = z.email().max(320);
const identitySchema = z.object({
  customerName: fullNameSchema.nullable(),
  customerEmail: emailSchema.nullable(),
  licenseCode: licenseCodeSchema,
  product: z.object({ name: z.string().trim().min(1).max(255)
    .refine(value => !/[\p{Cc}\p{Cf}]/u.test(value)) }).strict(),
}).strict();

export function maskEmail(email: string): string {
  const result = emailSchema.safeParse(email);
  if (!result.success) throw new PdfWatermarkError("INVALID_INPUT");
  const [local, domain] = result.data.split("@");
  // For a one/two-character local part, do not expose it in its entirety.
  const prefix = Array.from(local).slice(0, Math.min(2, local.length - 1)).join("");
  return `${prefix}***@${domain}`;
}

export function prepareWatermarkIdentity(input: PdfPersonalizationInput, config: PdfWatermarkConfig) {
  const result = identitySchema.safeParse({
    customerName: input.customerName, customerEmail: input.customerEmail,
    licenseCode: input.licenseCode, product: input.product,
  });
  if (!result.success || (config.showCustomerName && !result.data.customerName)
    || (config.showCustomerEmail && !result.data.customerEmail)) throw new PdfWatermarkError("INVALID_INPUT");
  const { customerName, customerEmail, licenseCode, product } = result.data;
  const name = config.showCustomerName ? customerName : null;
  const email = config.showCustomerEmail && customerEmail
    ? (config.maskCustomerEmail ? maskEmail(customerEmail) : customerEmail) : null;
  return {
    licenseCode, productName: product.name.normalize("NFC"),
    visibleText: `Licenciado para ${[name, email, licenseCode].filter(Boolean).join(" • ")}`,
    diagonalText: [name, licenseCode].filter(Boolean).join(" • "),
  };
}
