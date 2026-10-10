import { degrees, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { getWatermarkPosition, wrapWatermarkText } from "./layout";
import { PdfWatermarkError } from "./types";

type Canvas = { width: number; height: number };
const margin = 10;

export function drawVisibleWatermark(page: PDFPage, font: PDFFont, text: string, canvas: Canvas): void {
  const size = 7;
  const lines = wrapWatermarkText(text, font, size, canvas.height - margin * 4);
  if (lines.length * 9 + margin > canvas.width / 4) throw new PdfWatermarkError("PAGE_UNSUPPORTED");
  for (const [index, line] of lines.entries()) {
    const length = font.widthOfTextAtSize(line, size);
    page.drawText(line, { font, size, rotate: degrees(90),
      x: 8 + index * 9, y: (canvas.height - length) / 2,
      color: rgb(0.3, 0.3, 0.3), opacity: 0.75 });
  }
}

export function drawDiagonalWatermark(page: PDFPage, font: PDFFont, text: string, canvas: Canvas): void {
  const angle = Math.PI / 5; // 36 degrees, within the requested 30-45 range.
  const unitWidth = font.widthOfTextAtSize(text, 1);
  const unitHeight = font.heightAtSize(1);
  const size = Math.min(30,
    (canvas.width * 0.72) / (unitWidth * Math.cos(angle) + unitHeight * Math.sin(angle)),
    (canvas.height * 0.72) / (unitWidth * Math.sin(angle) + unitHeight * Math.cos(angle)));
  const width = unitWidth * size, height = unitHeight * size;
  page.drawText(text, { font, size, rotate: degrees(36), opacity: 0.08,
    color: rgb(0.4, 0.4, 0.4),
    x: canvas.width / 2 - width * Math.cos(angle) / 2 + height * Math.sin(angle) / 2,
    y: canvas.height / 2 - width * Math.sin(angle) / 2 - height * Math.cos(angle) / 2 });
}

export function drawLicenseIdentifier(page: PDFPage, font: PDFFont, licenseCode: string,
  pageIndex: number, canvas: Canvas): void {
  const size = Math.min(6.5, (canvas.width - margin * 4) / font.widthOfTextAtSize(licenseCode, 1));
  if (size < 5) throw new PdfWatermarkError("PAGE_UNSUPPORTED");
  const width = font.widthOfTextAtSize(licenseCode, size);
  const position = getWatermarkPosition(licenseCode, pageIndex);
  const x = position === "bottom-left" ? margin * 2 : position === "bottom-center"
    ? (canvas.width - width) / 2 : canvas.width - width - margin;
  const y = position === "top-right" ? canvas.height - margin - size : margin;
  page.drawText(licenseCode, { font, size, x, y, color: rgb(0.4, 0.4, 0.4), opacity: 0.7 });
}
