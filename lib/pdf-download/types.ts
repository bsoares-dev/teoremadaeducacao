import { z } from "zod";
import { pdfLicenseSchema } from "../pdf-licenses/types";
import { fullNameSchema } from "../profile-name-schema";
import { PDF_LIMIT } from "../uploads";

export const downloadContextSchema = z.object({
  file: z.object({
    file_id: z.uuid(), bucket_id: z.literal("teorema-pdfs"), object_key: z.string(),
    version: z.number().int().positive(), version_label: z.string().min(1).max(40),
    size_bytes: z.number().int().positive().max(PDF_LIMIT), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  license: pdfLicenseSchema,
  full_name: fullNameSchema.nullable(),
  product_name: z.string().trim().min(1).max(255).refine(value => !/[\p{Cc}\p{Cf}]/u.test(value)),
}).strict();
export type DownloadContext = z.infer<typeof downloadContextSchema>;
export type PersonalizedDownload = { bytes: Uint8Array; filename: string; version: number };
export const downloadErrorCodes = ["ACCESS_DENIED", "LICENSE_REVOKED", "PDF_NOT_FOUND", "DOWNLOAD_FAILED", "MATERIAL_UPDATED", "CUSTOMER_NAME_REQUIRED", "DOWNLOAD_LIMIT_REACHED", "ATTEMPT_EXPIRED"] as const;
export type PdfDownloadErrorCode = typeof downloadErrorCodes[number];
const errors: Record<PdfDownloadErrorCode, [number, string]> = {
  ACCESS_DENIED: [403, "Você não possui acesso a este material."],
  LICENSE_REVOKED: [403, "Esta licença foi revogada."],
  PDF_NOT_FOUND: [404, "O PDF deste material não foi encontrado. Fale com a equipe."],
  DOWNLOAD_FAILED: [500, "Não foi possível gerar o PDF. Tente novamente ou fale com a equipe."],
  MATERIAL_UPDATED: [409, "O material foi atualizado durante o preparo. Tente baixar novamente."],
  CUSTOMER_NAME_REQUIRED: [409, "Complete seu nome no perfil para preparar seu material personalizado."],
  DOWNLOAD_LIMIT_REACHED: [403, "O limite de downloads desta licença foi atingido. Fale com a equipe."],
  ATTEMPT_EXPIRED: [409, "O preparo demorou mais que o permitido. Tente novamente."],
};
export class PdfDownloadError extends Error {
  readonly status: number;
  constructor(public readonly code: PdfDownloadErrorCode) {
    super(errors[code][1]); this.status = errors[code][0]; this.name = "PdfDownloadError";
  }
}
export function downloadDbError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new PdfDownloadError(error.message === "PDF license revoked" ? "LICENSE_REVOKED" : "ACCESS_DENIED");
  if (error.code === "P0002" || error.code === "23514") throw new PdfDownloadError("PDF_NOT_FOUND");
  throw new PdfDownloadError("DOWNLOAD_FAILED");
}
