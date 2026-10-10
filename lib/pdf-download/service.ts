import "server-only";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { personalizePdf } from "../pdf-watermark/service";
import { parseWatermarkConfig } from "../pdf-watermark/config";
import { prepareDownloadContext, readOriginalPdf } from "./repository";
import { preparePersonalizedDownload } from "./prepare";
import { PdfDownloadError } from "./types";

export async function downloadPersonalizedPdf(db: SupabaseClient, user: User, productId: string, requestSignal: AbortSignal) {
  try {
    const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(120000)]);
    const config = parseWatermarkConfig({ PDF_SHOW_CUSTOMER_NAME: process.env.PDF_SHOW_CUSTOMER_NAME });
    return await preparePersonalizedDownload(user.email || null, signal, {
      context: licenseId => prepareDownloadContext(db, user.id, productId, licenseId),
      original: context => readOriginalPdf(db, context, AbortSignal.any([signal, AbortSignal.timeout(30000)])),
      personalize: personalizePdf, showCustomerName: config.showCustomerName,
    });
  } catch (error) {
    if (error instanceof PdfDownloadError) throw error;
    throw new PdfDownloadError("DOWNLOAD_FAILED");
  }
}
