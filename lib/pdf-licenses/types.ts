import { z } from "zod";

export const licenseCodeSchema = z.string().regex(/^LIC-[0-9A-F]{32}$/);
export const licensePurchaseSchema = z.object({ orderId: z.uuid(), productId: z.uuid() }).strict();
export type LicensePurchase = z.infer<typeof licensePurchaseSchema>;

export const pdfLicenseSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  product_id: z.uuid(),
  order_id: z.uuid(),
  order_item_id: z.uuid(),
  license_code: licenseCodeSchema,
  status: z.enum(["active", "revoked"]),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  revoked_at: z.iso.datetime({ offset: true }).nullable(),
}).strict().refine(row => (row.status === "revoked") === (row.revoked_at !== null), {
  message: "Inconsistent license status",
});
export type PdfLicense = z.infer<typeof pdfLicenseSchema>;
export type PdfLicenseErrorCode = "UNAUTHENTICATED" | "INVALID_REQUEST" | "ACCESS_DENIED" | "LICENSE_REVOKED" | "LICENSE_UNAVAILABLE";

const messages: Record<PdfLicenseErrorCode, string> = {
  UNAUTHENTICATED: "Entre na sua conta para acessar este material.",
  INVALID_REQUEST: "Solicitação de licença inválida.",
  ACCESS_DENIED: "Você não possui acesso a este material.",
  LICENSE_REVOKED: "Esta licença foi revogada.",
  LICENSE_UNAVAILABLE: "Não foi possível consultar a licença. Tente novamente.",
};
export class PdfLicenseError extends Error {
  constructor(public readonly code: PdfLicenseErrorCode) {
    super(messages[code]);
    this.name = "PdfLicenseError";
  }
}
