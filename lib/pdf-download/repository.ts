import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateLicenseCode } from "../pdf-licenses/code";
import { readBounded, PDF_LIMIT } from "../uploads";
import { downloadContextSchema, downloadDbError, PdfDownloadError, type DownloadContext } from "./types";

// Identity is supplied only by the authenticated server route, never request JSON.
export async function prepareDownloadContext(db: SupabaseClient, userId: string, productId: string, licenseId: string | null = null): Promise<DownloadContext> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await db.rpc("teorema_prepare_pdf_download", {
      p_user_id: userId, p_product_id: productId, p_license_code: generateLicenseCode(), p_license_id: licenseId,
    });
    if (result.error?.code === "23505") continue; // Random license-code collision only.
    downloadDbError(result.error);
    const parsed = downloadContextSchema.safeParse(result.data);
    if (!parsed.success) throw new PdfDownloadError("DOWNLOAD_FAILED");
    const context = parsed.data;
    if (context.license.user_id !== userId || context.license.product_id !== productId ||
        (licenseId !== null && context.license.id !== licenseId) ||
        context.file.object_key !== `products/${productId}/${context.file.file_id}.pdf`) {
      throw new PdfDownloadError("DOWNLOAD_FAILED");
    }
    if (context.license.status !== "active") throw new PdfDownloadError("LICENSE_REVOKED");
    return context;
  }
  throw new PdfDownloadError("DOWNLOAD_FAILED");
}

export async function readOriginalPdf(db: SupabaseClient, context: DownloadContext, signal: AbortSignal): Promise<Uint8Array> {
  const file = context.file, storage = db.storage.from(file.bucket_id);
  const info = await storage.info(file.object_key);
  if (info.error || !info.data) throw new PdfDownloadError("DOWNLOAD_FAILED");
  if (info.data.size !== file.size_bytes || info.data.contentType !== "application/pdf" ||
      !/^(max-age=0|no-store)$/i.test(info.data.cacheControl || "")) throw new PdfDownloadError("DOWNLOAD_FAILED");
  // Authenticated server-side stream: no original URL or token is returned.
  const result = await storage.download(file.object_key, {}, { cache: "no-store", signal }).asStream();
  if (result.error || !result.data) {
    const status = result.error && "statusCode" in result.error ? String(result.error.statusCode) : "";
    throw new PdfDownloadError(status === "404" ? "PDF_NOT_FOUND" : "DOWNLOAD_FAILED");
  }
  return readBounded(new Response(result.data), PDF_LIMIT);
}
