import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PdfSessionError, verifiedPdfSessionClaims } from "./session-contract";

export async function requireActivePdfSession(auth: SupabaseClient, db: SupabaseClient, userId: string) {
  const { data, error } = await auth.auth.getClaims();
  if (error) throw new PdfSessionError(error.status && error.status >= 500 ? 503 : 401);
  const session = verifiedPdfSessionClaims(data?.claims, userId);
  const check = async () => {
    if (session.expiresAt <= Date.now()) throw new PdfSessionError(401);
    const result = await db.rpc("teorema_pdf_session_active", { p_user_id: session.userId, p_session_id: session.sessionId });
    if (result.error || typeof result.data !== "boolean") throw new PdfSessionError(503);
    if (!result.data) throw new PdfSessionError(401);
  };
  await check();
  return check;
}
