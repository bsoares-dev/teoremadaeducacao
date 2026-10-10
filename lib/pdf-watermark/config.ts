import { PdfWatermarkError, type PdfWatermarkConfig } from "./types";

export const DEFAULT_WATERMARK_CONFIG: PdfWatermarkConfig = Object.freeze({
  showCustomerName: true, showCustomerEmail: true, maskCustomerEmail: true,
});

// Pure parser for testing. Only service.ts reads the real server environment.
export function parseWatermarkConfig(env: Record<string, string | undefined>): PdfWatermarkConfig {
  const flag = (key: string): boolean => {
    const value = env[key];
    if (value === undefined) return true;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new PdfWatermarkError("CONFIG_INVALID");
  };
  return Object.freeze({
    showCustomerName: flag("PDF_SHOW_CUSTOMER_NAME"),
    showCustomerEmail: flag("PDF_SHOW_CUSTOMER_EMAIL"),
    maskCustomerEmail: flag("PDF_MASK_CUSTOMER_EMAIL"),
  });
}
