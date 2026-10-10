import "server-only";
import { z } from "zod";
import { getAuth } from "./auth";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { cartPreviewEnabled } from "./cart-contract";
import { privateJson } from "./http";
import { libraryPage } from "./library-contract";
import { PdfDownloadError } from "./pdf-download/types";
import { publicCover } from "./catalog-selection";
import { requestLimitResponse } from "./request-limits";
import { PdfSessionError } from "./pdf-download/session-contract";

export class LibraryError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function libraryAuth() {
  if (!cartPreviewEnabled(process.env)) throw new LibraryError("Biblioteca disponível somente na prévia autorizada.", 404);
  const { user, supabase } = await getAuth();
  if (!user) throw new LibraryError("Sessão encerrada. Entre novamente.", 401);
  if (!user.email_confirmed_at || user.is_anonymous) throw new LibraryError("Confirme seu e-mail antes de acessar os materiais.", 403);
  return { user, supabase, db: getSupabaseAdmin() };
}
export function libraryDbError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new LibraryError("Sua conta não possui autorização ativa para este material.", 403);
  throw new LibraryError("Material temporariamente indisponível. Atualize ou fale com a equipe.", 503);
}
export async function libraryRoute(run: () => Promise<Response>) {
  try { return await run(); }
  catch (cause) {
    const limited = requestLimitResponse(cause); if (limited) return limited;
    if (cause instanceof z.ZodError) return privateJson({ error: "Dados da solicitação inválidos." }, 400);
    if (cause instanceof LibraryError) return privateJson({ error: cause.message }, cause.status);
    if (cause instanceof PdfSessionError) return privateJson({ error: cause.message }, cause.status);
    if (cause instanceof PdfDownloadError) return privateJson({ error: cause.message, code: cause.code }, cause.status);
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
