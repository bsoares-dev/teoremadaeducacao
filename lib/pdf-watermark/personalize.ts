import { PDFDocument, concatTransformationMatrix, pushGraphicsState, popGraphicsState } from "pdf-lib";
import { validatePdf } from "../file-validation";
import { PDF_LIMIT } from "../uploads";
import { DEFAULT_WATERMARK_CONFIG } from "./config";
import { embedWatermarkFont, assertFontSupports } from "./font";
import { prepareWatermarkIdentity } from "./identity";
import { getPageGeometry } from "./layout";
import { drawVisibleWatermark, drawDiagonalWatermark, drawLicenseIdentifier } from "./draw";
import { setPdfMetadata } from "./metadata";
import { PdfWatermarkError, type PdfPersonalizationInput, type PdfWatermarkConfig } from "./types";

// Node-only engine for the server service and offline synthetic tests.
// Keep personal bytes local to this call; never cache/store an output or mutate input.
export async function renderPersonalizedPdf(input: PdfPersonalizationInput,
  config: PdfWatermarkConfig = DEFAULT_WATERMARK_CONFIG): Promise<Uint8Array> {
  const identity = prepareWatermarkIdentity(input, config);
  if (!(input.original instanceof Uint8Array) || input.original.byteLength === 0) throw new PdfWatermarkError("PDF_INVALID");
  if (input.original.byteLength > PDF_LIMIT) throw new PdfWatermarkError("PDF_TOO_LARGE");
  // Reuse the project's existing bounded worker and static-content policy.
  try { await validatePdf(input.original); } catch { throw new PdfWatermarkError("PDF_INVALID"); }
  try {
    const document = await PDFDocument.load(input.original, {
      ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false,
    });
    const font = await embedWatermarkFont(document);
    assertFontSupports(font, [identity.visibleText, identity.diagonalText, identity.licenseCode]);
    for (const [pageIndex, page] of document.getPages().entries()) {
      const geometry = getPageGeometry(page);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...geometry.transform));
      drawVisibleWatermark(page, font, identity.visibleText, geometry);
      drawDiagonalWatermark(page, font, identity.diagonalText, geometry);
      drawLicenseIdentifier(page, font, identity.licenseCode, pageIndex, geometry);
      page.pushOperators(popGraphicsState());
    }
    setPdfMetadata(document, identity.productName, identity.licenseCode);
    return await document.save({ addDefaultPage: false });
  } catch (error) {
    if (error instanceof PdfWatermarkError) throw error;
    throw new PdfWatermarkError("GENERATION_FAILED");
  }
}
