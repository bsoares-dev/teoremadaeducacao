import { PdfDownloadError } from "./types";

// qpdf is not provisioned or verified in this project's runtime. Never silently
// promise encryption, invoke a shell, or replace the personalized copy with the
// original. An enabled/invalid flag fails closed until a tested adapter exists.
export function assertSupportedPdfEncryption(value: string | undefined): void {
  if (value === undefined || value === "false") return;
  throw new PdfDownloadError("DOWNLOAD_FAILED");
}
