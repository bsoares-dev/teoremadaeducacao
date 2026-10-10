import { z } from "zod";

export class PdfSessionError extends Error {
  constructor(public readonly status: 401 | 503) {
    super(status === 401 ? "Sessão encerrada. Entre novamente." : "Não foi possível verificar sua sessão. Tente novamente.");
  }
}
const claimsSchema = z.object({ sub: z.uuid(), session_id: z.uuid(), exp: z.number().int().positive() });
// Only call with claims returned by Supabase getClaims(), not decoded cookies,
// request JSON or headers. The authenticated getUser() record binds the owner.
export function verifiedPdfSessionClaims(claims: unknown, userId: string, now = Date.now()) {
  const parsed = claimsSchema.safeParse(claims);
  if (!parsed.success || parsed.data.sub !== userId || parsed.data.exp * 1000 <= now) throw new PdfSessionError(401);
  return { userId, sessionId: parsed.data.session_id, expiresAt: parsed.data.exp * 1000 };
}
