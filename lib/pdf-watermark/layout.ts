import { createHash } from "node:crypto";
import type { PDFPage, PDFFont } from "pdf-lib";
import { PdfWatermarkError } from "./types";

export type WatermarkPosition = "bottom-left" | "bottom-center" | "bottom-right" | "top-right";
const positions: readonly WatermarkPosition[] = ["bottom-left", "bottom-center", "bottom-right", "top-right"];

export function getWatermarkPosition(licenseCode: string, pageIndex: number): WatermarkPosition {
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0) throw new PdfWatermarkError("INVALID_INPUT");
  // The license chooses an offset/direction. Including the page index cycles all
  // four positions without repeating the same position on consecutive pages.
  const digest = createHash("sha256").update(`${licenseCode}:watermark-v1`).digest();
  const direction = digest[1] % 2 === 0 ? 1 : -1;
  return positions[((digest[0] + direction * (pageIndex % 4)) % 4 + 4) % 4];
}

export function getPageGeometry(page: PDFPage) {
  // Size is obtained independently per page; never assume A4 or a zero origin.
  const size = page.getSize();
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const x = Math.max(media.x, crop.x), y = Math.max(media.y, crop.y);
  const width = Math.min(media.x + size.width, crop.x + crop.width) - x;
  const height = Math.min(media.y + size.height, crop.y + crop.height) - y;
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  if (![x, y, width, height].every(Number.isFinite) || width < 72 || height < 72
    || ![0, 90, 180, 270].includes(rotation)) throw new PdfWatermarkError("PAGE_UNSUPPORTED");
  // Map visible, upright coordinates back into the original PDF coordinate space.
  const transforms: Record<number, [number, number, number, number, number, number]> = {
    0: [1, 0, 0, 1, x, y], 90: [0, 1, -1, 0, x + width, y],
    180: [-1, 0, 0, -1, x + width, y + height], 270: [0, -1, 1, 0, x, y + height],
  };
  return {
    width: rotation % 180 === 0 ? width : height,
    height: rotation % 180 === 0 ? height : width,
    transform: transforms[rotation],
  };
}

export function wrapWatermarkText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const character of text) {
    if (line && font.widthOfTextAtSize(line + character, size) > maxWidth) {
      lines.push(line); line = "";
    }
    line += character;
  }
  if (line) lines.push(line);
  return lines;
}
