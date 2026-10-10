import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";
import { PdfWatermarkError } from "./types";

// Cache only the public font bytes, never a PDF or a customer's identity.
let cachedFont: Uint8Array | undefined;
export async function embedWatermarkFont(document: PDFDocument): Promise<PDFFont> {
  try {
    const bytes = cachedFont ?? await readFile(join(process.cwd(), "assets/pdf/NotoSans-Regular.ttf"));
    cachedFont = bytes;
    document.registerFontkit(fontkit);
    return await document.embedFont(bytes, { subset: true });
  } catch {
    throw new PdfWatermarkError("FONT_UNAVAILABLE");
  }
}

export function assertFontSupports(font: PDFFont, texts: readonly string[]): void {
  const supported = new Set(font.getCharacterSet());
  for (const text of texts) {
    for (const character of text) {
      if (!supported.has(character.codePointAt(0)!)) throw new PdfWatermarkError("UNSUPPORTED_CHARACTER");
    }
  }
}
