import { z } from "zod";

export const PERSONALIZED_PDF_LIMIT = 40 * 1024 * 1024;
export const downloadInput = z.object({ productId: z.string().uuid() }).strict();
export const libraryItem = z.object({
  productId: z.string().uuid(), name: z.string(), state: z.enum(["ATIVO", "PENDENTE", "REVOGADO"]),
  orderId: z.string().uuid(), code: z.string(), updatedAt: z.string(), available: z.boolean(), imageUrl: z.string().nullable(),
  version: z.number().int().positive().nullable(), versionLabel: z.string().nullable(), sizeBytes: z.number().int().positive().nullable(),
});
export const libraryPage = z.object({ items: z.array(libraryItem).max(20), total: z.number().int().nonnegative(), page: z.number().int().positive(), size: z.literal(20) });
export type LibraryPage = z.infer<typeof libraryPage>;
export const libraryLabels = { ATIVO: "Disponível", PENDENTE: "Aguardando liberação", REVOGADO: "Acesso revogado" };

export function pdfFilename(name: string) {
  const safe = name.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, " ")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, " ");
  const base = safe.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 -]/g, " ").trim().replace(/\s+/g, "-").slice(0, 100).replace(/^-+|-+$/g, "");
  return `${base || "material-teorema"}.pdf`;
}
// The client accepts a PDF body, never an original Storage URL/ticket.
export async function readPersonalizedResponse(response: Response) {
  if (response.headers.get("content-type")?.split(";", 1)[0] !== "application/pdf" || !response.body) throw new Error("Resposta de download inválida.");
  const match = response.headers.get("content-disposition")?.match(/^attachment; filename="([a-zA-Z0-9-]{1,100}\.pdf)"$/);
  if (!match) throw new Error("Resposta de download inválida.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > PERSONALIZED_PDF_LIMIT) { await reader.cancel(); throw new Error("Não foi possível receber o PDF. Fale com a equipe."); }
      chunks.push(new Uint8Array(value));
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new Error("O arquivo recebido está vazio. Tente novamente.");
  return { blob: new Blob(chunks, { type: "application/pdf" }), filename: match[1] };
}
