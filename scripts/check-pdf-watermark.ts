import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, concatTransformationMatrix } from "pdf-lib";
import { renderPersonalizedPdf } from "../lib/pdf-watermark/personalize";
import { getPageGeometry } from "../lib/pdf-watermark/layout";

// Entirely synthetic and offline: no .env.local, real PDF, customer or Supabase.
async function main() {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  for (const [index, size] of ([[595.28, 841.89], [841.89, 595.28], [400, 600], [700, 900]] as [number, number][]).entries()) {
    const page = source.addPage(size);
    if (index === 3) { page.setCropBox(50, 80, 500, 700); page.setRotation(degrees(90)); }
    const geometry = getPageGeometry(page);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...geometry.transform));
    page.drawText("TEOREMA DA EDUCACAO", { font, size: 13, x: 65, y: geometry.height - 95, color: rgb(0.06, 0.16, 0.25) });
    page.drawText(`Material de teste - pagina ${index + 1}`, { font, size: 20, x: 65, y: geometry.height - 135 });
    for (let row = 0; row < 10; row++) {
      page.drawText("Conteudo sintetico para conferir a leitura.", { font, size: 10, x: 65, y: geometry.height - 185 - row * 23 });
    }
    page.pushOperators(popGraphicsState());
  }
  const licenseCode = `LIC-${"4C9A10D8B721F209".repeat(2)}`;
  const bytes = await renderPersonalizedPdf({ original: await source.save(),
    customerName: "João da Silva", customerEmail: "joao.silva@example.com", licenseCode,
    product: { name: "Verificação sintética de PDF - Teorema" } });
  const directory = join(process.cwd(), ".data/pdf-watermark-check");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "output-test.pdf"), bytes);
  console.log("PDF sintético: .data/pdf-watermark-check/output-test.pdf (4 páginas, sem dados reais)");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
