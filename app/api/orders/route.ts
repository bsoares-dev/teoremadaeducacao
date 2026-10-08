import { getAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { cartPreviewEnabled } from "@/lib/cart-contract";
import { orderInput } from "@/lib/order-contract";
import { readOrder } from "@/lib/orders";
import { privateJson, readJson } from "@/lib/http";
import { consumeRequest, requestLimitResponse } from "@/lib/request-limits";

export async function POST(request: Request) {
  if (!cartPreviewEnabled(process.env)) return privateJson({ error: "Recurso indisponível." }, 404);
  let input;
  try { input = orderInput.parse(await readJson(request)); }
  catch { return privateJson({ error: "Resumo do pedido inválido." }, 400); }
  try {
    const { user, supabase } = await getAuth();
    if (!user) return privateJson({ error: "Entre novamente para recuperar seu pedido." }, 401);
    if (!user.email_confirmed_at || user.is_anonymous) return privateJson({ error: "Confirme seu e-mail antes de registrar um pedido." }, 403);
    const db = getSupabaseAdmin();
    await consumeRequest(db, user.id, "ORDER_CREATE");
    const { data, error } = await db.rpc("teorema_create_order", {
      p_user_id: user.id, p_cart_id: input.cartId, p_idempotency_key: input.operationId,
      p_expected_total: input.totalCents / 100,
      p_expected_prices: Object.fromEntries(input.items.map(i => [i.id.toLowerCase(), i.priceCents / 100])),
    });
    if (error) {
      // These database exceptions roll back the whole transaction. Only then can
      // the browser discard its pending key and ask for a NEW visual review.
      if (["23514", "40001", "42501", "22023"].includes(error.code)) return privateJson({
        error: "Seu carrinho, os preços ou a disponibilidade mudaram. Atualize e revise antes de confirmar novamente.", reviewRequired: true,
      }, 409);
      throw new Error("Order write unavailable");
    }
    const order = await readOrder(supabase, user.id, data);
    if (!order) throw new Error("Order recovery unavailable");
    return privateJson({ order });
  } catch (error) {
    const limited = requestLimitResponse(error); if (limited) return limited;
    console.error("order_request_unavailable"); // No payload, token or personal data.
    return privateJson({ error: "Não foi possível confirmar o resultado. Recupere a mesma tentativa; não faça um novo pedido." }, 503);
  }
}
