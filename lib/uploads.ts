import { z } from "zod";

export const PDF_LIMIT = 20 * 1024 * 1024;
export const COVER_LIMIT = 5 * 1024 * 1024;
export const STAGING_BUCKET = "teorema-uploads";
export const uuid = z.string().uuid();
export const uploadSchema = z.object({
  id: uuid, kind: z.enum(["PDF", "COVER"]),
  name: z.string().trim().min(1).max(160).refine(v => !/[\x00-\x1f/\\]/.test(v), "Nome de arquivo inválido."),
  size: z.number().int().positive(), mime: z.string(),
  versionLabel: z.string().trim().max(40).default(""),
}).strict().superRefine((v, ctx) => {
  const pdf = v.kind === "PDF";
  const extension = pdf ? /\.pdf$/i : /\.(jpe?g|png|webp)$/i;
  const mime = pdf ? v.mime === "application/pdf" : ["image/jpeg", "image/png", "image/webp"].includes(v.mime);
  if (!extension.test(v.name) || !mime) ctx.addIssue({ code: "custom", message: pdf ? "Envie um PDF válido." : "Envie JPEG, PNG ou WebP." });
  if (v.size > (pdf ? PDF_LIMIT : COVER_LIMIT)) ctx.addIssue({ code: "custom", message: pdf ? "Limite: 20 MiB por PDF." : "Limite: 5 MiB por capa." });
});
export type UploadRecord = {
  id: string; product_id: string; kind: "PDF" | "COVER"; expected_size: number;
  mime_type: string; state: "UPLOADING" | "VALIDATED" | "REJECTED"; created_at: string;
};
export function stagingKey(upload: Pick<UploadRecord, "id" | "product_id">) {
  return `incoming/${upload.product_id}/${upload.id}`;
}
export function finalKey(upload: Pick<UploadRecord, "id" | "product_id" | "kind">) {
  return `products/${upload.product_id}/${upload.id}.${upload.kind === "PDF" ? "pdf" : "webp"}`;
}

// Bound actual bytes, not metadata supplied by the browser or Storage.
export async function readBounded(response: Response, limit: number) {
  if (!response.ok || !response.body) throw new Error("Não foi possível ler o arquivo enviado.");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) { await response.body.cancel(); throw new Error("Arquivo excede o limite."); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("Arquivo excede o limite."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
