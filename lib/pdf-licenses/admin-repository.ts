import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CommerceError } from "../admin-commerce";
import { licenseHistory, licenseList, type licenseDecision, type licenseFilters } from "../admin-pdf-contract";
import { parseDownloadLimit } from "../pdf-download/limits";

function checked<T extends z.ZodType>(schema: T, data: unknown, error: { code?: string } | null): z.infer<T> {
  if (error) {
    if (error.code === "42501") throw new CommerceError("Operação não autorizada ou licença indisponível.", 403);
    if (["23514", "23505", "22023", "40001"].includes(error.code || "")) throw new CommerceError("A licença mudou. Atualize seu estado antes de decidir novamente.", 409);
    throw new CommerceError("Resultado não confirmado. Recupere a mesma tentativa.", 503);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new CommerceError("Resultado não confirmado. Recupere a mesma tentativa.", 503);
  return parsed.data;
}
export async function listPdfLicenses(db: SupabaseClient, actor: string, filters: ReturnType<typeof licenseFilters>) {
  const result = await db.rpc("teorema_admin_pdf_licenses", { p_actor_id: actor, p_page: filters.page,
    p_email: filters.email || null, p_code: filters.code || null, p_status: filters.status || null });
  return checked(licenseList, result.data && { ...result.data, maxDownloads: parseDownloadLimit(process.env.PDF_MAX_DOWNLOADS) }, result.error);
}
export async function pdfLicenseHistory(db: SupabaseClient, actor: string, id: string, page: number) {
  const result = await db.rpc("teorema_admin_pdf_history", { p_actor_id: actor, p_license_id: id, p_page: page });
  return checked(licenseHistory, result.data, result.error);
}
export async function decidePdfLicense(db: SupabaseClient, actor: string, id: string, decision: z.infer<typeof licenseDecision>) {
  const result = await db.rpc("teorema_set_pdf_license_state", { p_actor_id: actor, p_license_id: id, p_state: decision.state,
    p_reason: decision.reason, p_operation_id: decision.operationId, p_expected_updated_at: decision.expectedUpdatedAt });
  const returned = checked(z.uuid(), result.data, result.error);
  if (returned !== id) throw new CommerceError("Resultado não confirmado. Recupere a mesma tentativa.", 503);
  return { id: returned };
}
