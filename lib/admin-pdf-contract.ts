import { z } from "zod";
import { licenseCodeSchema } from "./pdf-licenses/types";
import { downloadErrorCodes } from "./pdf-download/types";

const date = z.iso.datetime({ offset: true });
export const licenseDecision = z.object({ state: z.enum(["active", "revoked"]), reason: z.string().trim().min(5, "Informe um motivo com pelo menos 5 caracteres.").max(1000),
  operationId: z.uuid(), expectedUpdatedAt: date }).strict();
export const pendingLicenseDecision = z.object({ licenseId: z.uuid(), decision: licenseDecision }).strict();
export type PendingLicenseDecision = z.infer<typeof pendingLicenseDecision>;
export const licenseJournalKey = (actor: string) => `teorema:pdf-license-decision:v1:${actor}`;
export function parseLicenseDecision(raw: string | null) {
  if (raw === null) return null;
  if (raw.length > 5000) throw new Error("Tentativa pendente inválida.");
  return pendingLicenseDecision.parse(JSON.parse(raw));
}
export const adminLicenseRow = z.object({ id: z.uuid(), code: licenseCodeSchema, status: z.enum(["active", "revoked"]), createdAt: date, updatedAt: date,
  name: z.string().nullable(), email: z.string(), product: z.string(), orderCode: z.string(), orderId: z.uuid(),
  downloads: z.number().int().nonnegative(), lastDownload: date.nullable() }).strict();
export type AdminLicenseRow = z.infer<typeof adminLicenseRow>;
export const licenseList = z.object({ items: z.array(adminLicenseRow).max(20), total: z.number().int().nonnegative(), maxDownloads: z.number().int().nonnegative() }).strict();
export const pdfEventLabels = {
  LICENSE_CREATED: "Licença criada", LICENSE_REVOKED: "Licença revogada", LICENSE_REACTIVATED: "Licença reativada",
  PDF_GENERATION_STARTED: "Preparo iniciado", PDF_GENERATION_SUCCESS: "PDF personalizado autorizado",
  PDF_GENERATION_FAILED: "Preparo não concluído", PDF_DOWNLOAD_DENIED: "Download não autorizado",
};
export const licenseHistory = z.object({ total: z.number().int().nonnegative(), items: z.array(z.object({ id: z.uuid(), event: z.enum(Object.keys(pdfEventLabels) as [keyof typeof pdfEventLabels, ...(keyof typeof pdfEventLabels)[]]),
  error_code: z.enum(downloadErrorCodes).nullable(), created_at: date, reason: z.string().nullable(), actor_email: z.string().nullable() }).strict()).max(20) }).strict();
export type LicenseHistory = z.infer<typeof licenseHistory>;
export function licenseFilters(url: URL) {
  return z.object({ page: z.coerce.number().int().min(1).max(100000), email: z.email().max(255).optional(), code: licenseCodeSchema.optional(), status: z.enum(["active", "revoked"]).optional() }).parse({
    page: url.searchParams.get("page") || "1", email: url.searchParams.get("email")?.trim().toLowerCase() || undefined,
    code: url.searchParams.get("code")?.trim().toUpperCase() || undefined, status: url.searchParams.get("status") || undefined,
  });
}
