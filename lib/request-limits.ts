import { z } from "zod";
import type { getSupabaseAdmin } from "./supabaseAdmin";
import { privateJson } from "./http";

export type RequestAction = "LIBRARY_READ" | "PDF_DOWNLOAD" | "CART_READ" | "CART_WRITE" | "ORDER_CREATE" | "PRODUCT_UPLOAD";
const resultSchema = z.object({ allowed: z.boolean(), retryAfterSeconds: z.number().int().min(0).max(900) }).strict();
export class RequestLimitError extends Error {
  constructor(public retryAfterSeconds: number) { super("Muitas solicitações. Aguarde antes de tentar novamente."); }
}
// Call only AFTER verified Auth + request validation. RPC/table are service-only.
// Injected DB; this module never obtains or exports credentials.
export async function consumeRequest(db: Pick<ReturnType<typeof getSupabaseAdmin>, "rpc">, userId: string, action: RequestAction) {
  const { data, error } = await db.rpc("teorema_consume_request", { p_user_id: userId, p_action: action });
  if (error) throw new Error("Request budget temporarily unavailable");
  const result = resultSchema.parse(data);
  if (!result.allowed) throw new RequestLimitError(Math.max(1, result.retryAfterSeconds));
}
export function requestLimitResponse(error: unknown) {
  if (!(error instanceof RequestLimitError)) return null;
  const response = privateJson({ error: error.message, retryAfterSeconds: error.retryAfterSeconds }, 429);
  response.headers.set("Retry-After", String(error.retryAfterSeconds));
  return response;
}
