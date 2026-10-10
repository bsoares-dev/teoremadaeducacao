import { createHash } from "node:crypto";
import { pdfFilename, PERSONALIZED_PDF_LIMIT } from "../library-contract";
import type { PdfPersonalizationInput } from "../pdf-watermark/types";
import { PdfDownloadError, type DownloadContext, type PersonalizedDownload } from "./types";

export type DownloadDependencies = {
  context: (licenseId?: string) => Promise<DownloadContext>;
  original: (context: DownloadContext) => Promise<Uint8Array>;
  personalize: (input: PdfPersonalizationInput) => Promise<Uint8Array>;
  showCustomerName: boolean;
};

// Isolated orchestration, testable with real SQL and synthetic PDFs. No original
// bytes, paths or URLs escape the returned personalized artifact.
export async function preparePersonalizedDownload(email: string | null, signal: AbortSignal, dependencies: DownloadDependencies): Promise<PersonalizedDownload> {
  try {
    signal.throwIfAborted();
    const context = await dependencies.context();
    if (context.license.status !== "active") throw new PdfDownloadError("LICENSE_REVOKED");
    if (!context.full_name && dependencies.showCustomerName) throw new PdfDownloadError("CUSTOMER_NAME_REQUIRED");
    const original = await dependencies.original(context);
    if (original.byteLength !== context.file.size_bytes || createHash("sha256").update(original).digest("hex") !== context.file.sha256) {
      throw new PdfDownloadError("DOWNLOAD_FAILED");
    }
    signal.throwIfAborted();
    const bytes = await dependencies.personalize({ original, customerName: context.full_name, customerEmail: email,
      licenseCode: context.license.license_code, product: { name: context.product_name } });
    signal.throwIfAborted();
    if (!bytes.byteLength || bytes.byteLength > PERSONALIZED_PDF_LIMIT) throw new PdfDownloadError("DOWNLOAD_FAILED");
    // Exact license recheck, never switch purchase origin after generation.
    const check = await dependencies.context(context.license.id);
    if (check.license.status !== "active") throw new PdfDownloadError("LICENSE_REVOKED");
    if (check.license.id !== context.license.id || check.license.license_code !== context.license.license_code) throw new PdfDownloadError("ACCESS_DENIED");
    if (check.file.file_id !== context.file.file_id || check.file.sha256 !== context.file.sha256 || check.full_name !== context.full_name) {
      throw new PdfDownloadError("MATERIAL_UPDATED");
    }
    return { bytes, filename: pdfFilename(context.product_name), version: context.file.version };
  } catch (error) {
    if (error instanceof PdfDownloadError) throw error;
    throw new PdfDownloadError("DOWNLOAD_FAILED");
  }
}
