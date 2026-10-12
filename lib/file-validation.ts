import { Worker } from "node:worker_threads";
import { join } from "node:path";
import sharp from "sharp";

export class PdfValidationError extends Error {
  constructor(message: string, public code: string) { super(message); this.name = "PdfValidationError"; }
}
export class PdfProcessingError extends Error {
  constructor() { super("Não foi possível preparar o PDF agora. O envio foi preservado; tente concluir novamente."); this.name = "PdfProcessingError"; }
}

export function validatePdf(bytes: Uint8Array, timeoutMs = 15000): Promise<{ pages: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(process.cwd(), "lib/pdf-validation-worker.cjs"), {
      // Turbopack adds its worker globals to this object. An explicit envelope
      // preserves the typed array instead of spreading its numeric entries.
      workerData: { bytes }, resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    });
    let settled = false;
    const finish = (error?: Error, result?: { pages: number }) => {
      if (settled) return;
      settled = true; clearTimeout(timer); void worker.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const timer = setTimeout(() => finish(new PdfProcessingError()), timeoutMs);
    worker.once("message", message => finish(message.error ? new PdfValidationError(message.error, message.code) : undefined, message.result));
    worker.once("error", () => finish(new PdfProcessingError()));
    worker.once("exit", () => { if (!settled) finish(new PdfProcessingError()); });
  });
}

export async function validateCover(bytes: Uint8Array, mime: string) {
  const pipeline = sharp(bytes, { limitInputPixels: 24000000, failOn: "warning", animated: false });
  const metadata = await pipeline.metadata();
  const expected = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[mime];
  if (!expected || metadata.format !== expected || !metadata.width || !metadata.height || (metadata.pages || 1) > 1) {
    throw new Error("Imagem inválida. Use JPEG, PNG ou WebP estático.");
  }
  // Decode and re-encode; strip embedded metadata and never publish unvalidated bytes.
  return pipeline.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 }).timeout({ seconds: 10 }).toBuffer();
}
