import { z } from "zod";

export const DOWNLOAD_TTL = 60;
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
  const base = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 -]/g, " ").trim().replace(/\s+/g, "-").slice(0, 100);
  return `${base || "material-teorema"}.pdf`;
}
// Validate the signing result on both server and client. Never follow an arbitrary URL.
export function validateDownloadUrl(raw: string, supabaseUrl: string, productId: string, fileId?: string) {
  z.string().uuid().parse(productId);
  if (fileId) z.string().uuid().parse(fileId);
  const url = new URL(raw), origin = new URL(supabaseUrl);
  if (url.origin !== origin.origin || url.username || url.password || url.hash ||
    !new RegExp(`^/storage/v1/object/sign/teorema-pdfs/products/${productId}/[0-9a-f-]{36}\\.pdf$`, "i").test(url.pathname) ||
    (fileId && !url.pathname.endsWith(`/${fileId}.pdf`)) || !url.searchParams.get("token")) throw new Error("Link de download inválido.");
  return url.href;
}
