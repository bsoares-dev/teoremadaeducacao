import "server-only";
import { randomUUID } from "node:crypto";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { personalizePdf } from "../pdf-watermark/service";
import { parseWatermarkConfig } from "../pdf-watermark/config";
import { prepareDownloadContext, readOriginalPdf } from "./repository";
import { preparePersonalizedDownload } from "./prepare";
import { PdfDownloadError } from "./types";
import { parseDownloadLimit } from "./limits";
import { reserveDownload, completeDownload } from "./ledger-repository";
import { trackedDownload } from "./tracked";

export async function downloadPersonalizedPdf(db: SupabaseClient, user: User, productId: string, requestSignal: AbortSignal) {
  try {
    const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(120000)]);
    const config = parseWatermarkConfig({ PDF_SHOW_CUSTOMER_NAME: process.env.PDF_SHOW_CUSTOMER_NAME });
    const attemptId = randomUUID(), maxDownloads = parseDownloadLimit(process.env.PDF_MAX_DOWNLOADS);
    signal.throwIfAborted();
    return await trackedDownload({
      begin: () => reserveDownload(db, user.id, productId, attemptId, maxDownloads),
      prepare: context => preparePersonalizedDownload(user.email || null, signal, {
        context: licenseId => licenseId ? prepareDownloadContext(db, user.id, productId, licenseId) : Promise.resolve(context),
        original: originalContext => readOriginalPdf(db, originalContext, AbortSignal.any([signal, AbortSignal.timeout(30000)])),
        personalize: personalizePdf, showCustomerName: config.showCustomerName,
      }),
      finish: (context, error) => completeDownload(db, user.id, attemptId, context, error),
    });
  } catch (error) {
    if (error instanceof PdfDownloadError) throw error;
    throw new PdfDownloadError("DOWNLOAD_FAILED");
  }
}
