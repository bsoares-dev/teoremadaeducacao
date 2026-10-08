import "server-only";
import { z } from "zod";
import { getAuth } from "./auth";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { cartPreviewEnabled } from "./cart-contract";
import { privateJson } from "./http";
import { DOWNLOAD_TTL, libraryPage, pdfFilename, validateDownloadUrl } from "./library-contract";
import { PDF_LIMIT } from "./uploads";
import { publicCover } from "./catalog-selection";

export class LibraryError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function libraryAuth() {
  if (!cartPreviewEnabled(process.env)) throw new LibraryError("Biblioteca disponível somente na prévia autorizada.", 404);
  const { user } = await getAuth();
  if (!user) throw new LibraryError("Sessão encerrada. Entre novamente.", 401);
  if (!user.email_confirmed_at || user.is_anonymous) throw new LibraryError("Confirme seu e-mail antes de acessar os materiais.", 403);
  return { user, db: getSupabaseAdmin() };
}
export function libraryDbError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new LibraryError("Sua conta não possui autorização ativa para este material.", 403);
  throw new LibraryError("Material temporariamente indisponível. Atualize ou fale com a equipe.", 503);
}
export async function libraryRoute(run: () => Promise<Response>) {
  try { return await run(); }
  catch (cause) {
    if (cause instanceof z.ZodError) return privateJson({ error: "Dados da solicitação inválidos." }, 400);
    if (cause instanceof LibraryError) return privateJson({ error: cause.message }, cause.status);
    return privateJson({ error: "Não foi possível consultar os materiais agora. Tente novamente." }, 503);
  }
}
export async function readLibrary(db: ReturnType<typeof getSupabaseAdmin>, userId: string, page: number) {
  const result = await db.rpc("teorema_read_library", { p_user_id: userId, p_page: page });
  libraryDbError(result.error);
  const raw = result.data;
  if (raw && Array.isArray(raw.items)) raw.items = raw.items.map((item: { imageUrl: string | null }) => ({ ...item, imageUrl: publicCover(item.imageUrl, process.env.NEXT_PUBLIC_SUPABASE_URL) }));
  const parsed = libraryPage.safeParse(raw);
  if (!parsed.success) throw new LibraryError("Não foi possível consultar sua biblioteca.", 503);
  return parsed.data;
}
const resolvedFile = z.object({
  file_id: z.string().uuid(), bucket_id: z.literal("teorema-pdfs"), object_key: z.string(),
  version: z.number().int().positive(), version_label: z.string().min(1).max(40),
  size_bytes: z.number().int().positive().max(PDF_LIMIT), sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export async function downloadTicket(db: ReturnType<typeof getSupabaseAdmin>, userId: string, productId: string) {
  const result = await db.rpc("teorema_resolve_pdf", { p_user_id: userId, p_product_id: productId });
  libraryDbError(result.error);
  const parsed = resolvedFile.safeParse(result.data);
  if (!parsed.success) throw new LibraryError("Arquivo temporariamente indisponível.", 503);
  const file = parsed.data;
  if (file.object_key !== `products/${productId}/${file.file_id}.pdf`) throw new LibraryError("Arquivo temporariamente indisponível.", 503);
  const storage = db.storage.from(file.bucket_id);
  const info = await storage.info(file.object_key);
  // Do not issue a bearer URL for an object with cache lifetime exceeding its token.
  // Stage 3 already writes PDFs with max-age=0; fail closed for older/altered objects.
  if (info.error || !info.data || info.data.size !== file.size_bytes || info.data.contentType !== "application/pdf" ||
    !/^(max-age=0|no-store)$/i.test(info.data.cacheControl || "")) throw new LibraryError("Arquivo indisponível ou configuração de entrega pendente. Fale com a equipe.", 503);
  const name = await db.from("order_items").select("product_name").eq("user_id", userId).eq("product_id", productId).order("created_at", { ascending: false }).limit(1);
  libraryDbError(name.error);
  const filename = pdfFilename(name.data?.[0]?.product_name || "material-teorema");
  // Recheck after Storage inspection; never infer permission from the library card.
  const check = await db.rpc("teorema_resolve_pdf", { p_user_id: userId, p_product_id: productId });
  libraryDbError(check.error);
  if (check.data?.file_id !== file.file_id) throw new LibraryError("O material foi atualizado. Tente baixar novamente.", 409);
  const started = Date.now();
  const ticket = await storage.createSignedUrl(file.object_key, DOWNLOAD_TTL, { download: filename, cacheNonce: crypto.randomUUID() });
  if (ticket.error || !ticket.data) throw new LibraryError("Falha ao preparar o download. Tente novamente.", 503);
  const url = validateDownloadUrl(ticket.data.signedUrl, process.env.NEXT_PUBLIC_SUPABASE_URL!, productId, file.file_id);
  return { url, expiresAt: new Date(started + DOWNLOAD_TTL * 1000).toISOString(), filename, version: file.version, versionLabel: file.version_label };
}
