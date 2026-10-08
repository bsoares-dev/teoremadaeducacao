import "server-only";
import { z, ZodError } from "zod";
import { adminAccess } from "./auth";
import { privateJson, readJson } from "./http";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { productSchema } from "./schemas";
import { uuid, PDF_LIMIT, COVER_LIMIT, STAGING_BUCKET, readBounded } from "./uploads";
import { requestLimitResponse } from "./request-limits";

export const editProductSchema = productSchema.omit({ imageUrl: true }).extend({ id: uuid, revision: z.number().int().nonnegative() }).strict();
export const stateSchema = z.object({ state: z.enum(["PUBLISHED", "UNPUBLISHED", "ARCHIVED"]), revision: z.number().int().positive(), operationId: uuid }).strict();
export const productColumns = "id,name,description,price,image_url,is_active,publication_status,revision,created_at,updated_at";
export class AdminError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function dbError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new AdminError("Acesso administrativo não autorizado.", 403);
  if (error.code === "40001") throw new AdminError("O produto mudou em outra operação. Atualize a lista antes de continuar.", 409);
  if (error.code === "P0002") throw new AdminError("Registro não encontrado.", 404);
  if (["23514", "22023", "23505"].includes(error.code || "")) throw new AdminError("Operação indisponível. Confira o estado do produto, a capa, o PDF validado e os envios pendentes.", 409);
  throw new AdminError("Não foi possível concluir. Atualize a lista antes de tentar novamente.", 503);
}
export async function productAdmin() {
  const access = await adminAccess();
  if (!access.user) throw new AdminError("Sessão encerrada.", 401);
  if (!access.allowed) throw new AdminError("Acesso negado.", 403);
  if (process.env.TEOREMA_PRODUCT_UPLOADS_ENABLED !== "true") throw new AdminError("Gestão de PDFs aguardando ativação da migração e dos buckets. Nenhum produto será publicado pelo formulário antigo.", 503);
  const db = getSupabaseAdmin();
  const { error } = await db.rpc("teorema_admin_check", { p_actor_id: access.user.id });
  dbError(error);
  return { db, actor: access.user.id };
}
export async function adminRoute(run: () => Promise<Response>) {
  try { return await run(); }
  catch (error) {
    const limited = requestLimitResponse(error); if (limited) return limited;
    if (error instanceof ZodError) return privateJson({ error: error.issues[0]?.message || "Dados inválidos." }, 400);
    if (error instanceof AdminError) return privateJson({ error: error.message }, error.status);
    return privateJson({ error: "Operação temporariamente indisponível. Nenhum arquivo deve ser reenviado sem consultar seu estado." }, 503);
  }
}
export async function input(request: Request) {
  try { return await readJson(request); }
  catch { throw new AdminError("Formato ou origem da requisição inválida.", 400); }
}
export async function productDetail(db: ReturnType<typeof getSupabaseAdmin>, id: string) {
  const [product, files, uploads] = await Promise.all([
    db.from("products").select(productColumns).eq("id", id).single(),
    db.from("product_files").select("id,version,version_label,size_bytes,validation_status,is_current,created_at,validated_at").eq("product_id", id).order("version", { ascending: false }).limit(100),
    db.from("product_uploads").select("id,kind,state,original_name,rejection_reason,created_at").eq("product_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (product.error?.code === "PGRST116") throw new AdminError("Produto não encontrado.", 404);
  dbError(product.error); dbError(files.error); dbError(uploads.error);
  return { product: product.data, files: files.data || [], uploads: uploads.data || [] };
}
export async function checkBuckets(db: ReturnType<typeof getSupabaseAdmin>) {
  const images = ["image/jpeg", "image/png", "image/webp"];
  const specs = [{ id: STAGING_BUCKET, public: false, limit: PDF_LIMIT, mime: ["application/pdf", ...images] },
    { id: "teorema-pdfs", public: false, limit: PDF_LIMIT, mime: ["application/pdf"] },
    { id: "teorema-covers", public: true, limit: COVER_LIMIT, mime: ["image/webp"] }];
  await Promise.all(specs.map(async spec => {
    const { data, error } = await db.storage.getBucket(spec.id);
    if (error || !data || data.public !== spec.public || Number(data.file_size_limit) !== spec.limit
      || !data.allowed_mime_types || [...data.allowed_mime_types].sort().join() !== [...spec.mime].sort().join()) {
      throw new AdminError("Storage ainda não provisionado ou configuração insegura. Upload bloqueado.", 503);
    }
  }));
}
export async function storageBytes(db: ReturnType<typeof getSupabaseAdmin>, bucket: string, key: string, limit: number) {
  const { data, error } = await db.storage.from(bucket).createSignedUrl(key, 60);
  if (error || !data) throw new AdminError("Arquivo não encontrado ou upload ainda incompleto. Tente validar novamente.", 409);
  // URL is generated from trusted bucket/key, never from client input. Do not log tokens.
  return readBounded(await fetch(data.signedUrl, { cache: "no-store", signal: AbortSignal.timeout(30000), redirect: "error" }), limit);
}
