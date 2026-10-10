import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateLicenseCode } from "../pdf-licenses/code";
import { downloadContextSchema, downloadErrorCodes, PdfDownloadError, type DownloadContext } from "./types";

const outcomeSchema = z.object({ ok: z.boolean(), error_code: z.enum(downloadErrorCodes).nullish(), context: downloadContextSchema.optional() }).strict();
function outcome(data: unknown, error: unknown) {
  if (error) throw new PdfDownloadError("DOWNLOAD_FAILED");
  const parsed = outcomeSchema.safeParse(data);
  if (!parsed.success) throw new PdfDownloadError("DOWNLOAD_FAILED");
  if (!parsed.data.ok) throw new PdfDownloadError(parsed.data.error_code || "DOWNLOAD_FAILED");
  return parsed.data;
}
export async function reserveDownload(db: SupabaseClient, userId: string, productId: string, attemptId: string, maxDownloads: number): Promise<DownloadContext> {
  const result = await db.rpc("teorema_begin_pdf_download", { p_user_id: userId, p_product_id: productId,
    p_attempt_id: attemptId, p_license_code: generateLicenseCode(), p_max_downloads: maxDownloads });
  const context = outcome(result.data, result.error).context;
  if (!context || context.license.user_id !== userId || context.license.product_id !== productId || context.license.status !== "active" ||
      context.file.object_key !== `products/${productId}/${context.file.file_id}.pdf`) throw new PdfDownloadError("DOWNLOAD_FAILED");
  return context;
}
export async function completeDownload(db: SupabaseClient, userId: string, attemptId: string, context: DownloadContext, failure?: PdfDownloadError) {
  const result = await db.rpc("teorema_finish_pdf_download", { p_user_id: userId, p_attempt_id: attemptId,
    p_full_name: context.full_name, p_error_code: failure?.code || null });
  // An acknowledged failed generation is expected, but a failed completion of a
  // successful generation (e.g. revocation) must prevent delivery.
  if (failure) {
    const parsed = outcomeSchema.safeParse(result.data);
    if (result.error || !parsed.success || parsed.data.ok || !parsed.data.error_code) throw new PdfDownloadError("DOWNLOAD_FAILED");
    return;
  }
  outcome(result.data, result.error);
}
