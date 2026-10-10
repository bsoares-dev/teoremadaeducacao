import "server-only";
import { parseWatermarkConfig } from "./config";
import { renderPersonalizedPdf } from "./personalize";
import type { PdfPersonalizationInput } from "./types";

// Entry point for a future authenticated download route (Part 3).
// No Storage access, purchase lookup, license creation or browser endpoint here.
export async function personalizePdf(input: PdfPersonalizationInput): Promise<Uint8Array> {
  const config = parseWatermarkConfig({
    PDF_SHOW_CUSTOMER_NAME: process.env.PDF_SHOW_CUSTOMER_NAME,
    PDF_SHOW_CUSTOMER_EMAIL: process.env.PDF_SHOW_CUSTOMER_EMAIL,
    PDF_MASK_CUSTOMER_EMAIL: process.env.PDF_MASK_CUSTOMER_EMAIL,
  });
  return renderPersonalizedPdf(input, config);
}
