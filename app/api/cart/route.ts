import { getAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { cartMutation, cartSnapshot, cartResult, cartPreviewEnabled } from "@/lib/cart-contract";
import { publicCover } from "@/lib/catalog-selection";
import { privateJson, readJson } from "@/lib/http";
import { consumeRequest, requestLimitResponse } from "@/lib/request-limits";

async function access() {
  const { user } = await getAuth();
  if (!user) return { error: privateJson({ error: "Sua sessão terminou. Entre novamente para recuperar seu carrinho." }, 401) };
  if (!user.email_confirmed_at || user.is_anonymous) return { error: privateJson({ error: "Confirme seu e-mail para usar o carrinho." }, 403) };
  return { user, db: getSupabaseAdmin() };
}
function clean(cart: ReturnType<typeof cartSnapshot.parse>) {
  return { ...cart, items: cart.items.map(item => ({ ...item, image_url: publicCover(item.image_url, process.env.NEXT_PUBLIC_SUPABASE_URL) })) };
}
function failure(code?: string) {
  if (code === "40001") return privateJson({ error: "Seu carrinho mudou em outra aba. Atualize antes de continuar." }, 409);
  if (code === "42501") return privateJson({ error: "Não foi possível autorizar esta conta ou carrinho." }, 403);
  if (code === "22023") return privateJson({ error: "Operação inválida. Atualize o carrinho." }, 400);
  return privateJson({ error: "Carrinho temporariamente indisponível. Sua seleção foi preservada; tente novamente." }, 503);
}
export async function GET() {
  if (!cartPreviewEnabled(process.env)) return privateJson({ error: "Recurso indisponível." }, 404);
  try {
    const auth = await access(); if (auth.error) return auth.error;
    await consumeRequest(auth.db, auth.user.id, "CART_READ");
    const { data, error } = await auth.db.rpc("teorema_read_cart", { p_user_id: auth.user.id });
    if (error) return failure(error.code);
    return privateJson({ cart: clean(cartSnapshot.parse(data)) });
  } catch (error) { return requestLimitResponse(error) || failure(); }
}
export async function POST(request: Request) {
  if (!cartPreviewEnabled(process.env)) return privateJson({ error: "Recurso indisponível." }, 404);
  let input;
  try { input = cartMutation.parse(await readJson(request)); }
  catch { return privateJson({ error: "Requisição inválida." }, 400); }
  try {
    const auth = await access(); if (auth.error) return auth.error;
    await consumeRequest(auth.db, auth.user.id, "CART_WRITE");
    const { data, error } = await auth.db.rpc("teorema_sync_cart", {
      p_user_id: auth.user.id, p_operation_id: input.operationId, p_cart_id: input.cartId, p_revision: input.revision,
      p_add_ids: [...new Set(input.addIds.map(id => id.toLowerCase()))], p_remove_ids: [...new Set(input.removeIds.map(id => id.toLowerCase()))],
    });
    if (error) return failure(error.code);
    const result = cartResult.parse(data);
    return privateJson({ ...result, cart: clean(result.cart) });
  } catch (error) { return requestLimitResponse(error) || failure(); }
}
