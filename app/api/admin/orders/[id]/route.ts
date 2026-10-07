import { z } from "zod";
import { commerceAdmin, commerceRoute, commerceDbError, CommerceError, adminOrderDetail } from "@/lib/admin-commerce";
import { commerceDecision } from "@/lib/admin-commerce-contract";
import { privateJson, readJson } from "@/lib/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  return commerceRoute(async () => {
    const { db } = await commerceAdmin();
    const id = z.string().uuid().parse((await params).id);
    return privateJson(await adminOrderDetail(db, id, new URL(request.url).searchParams.get("historyPage")));
  });
}
export async function POST(request: Request, { params }: Context) {
  return commerceRoute(async () => {
    const { db, actor } = await commerceAdmin();
    const id = z.string().uuid().parse((await params).id);
    let raw;
    try { raw = await readJson(request); } catch { throw new CommerceError("Formato ou origem da requisição inválida.", 400); }
    const decision = commerceDecision.parse(raw);
    const order = await db.from("orders").select("id,user_id").eq("id", id).maybeSingle();
    commerceDbError(order.error);
    if (!order.data) throw new CommerceError("Pedido não encontrado.", 404);
    if (decision.action === "access") {
      const grant = await db.from("access_grants").select("id,order_item_id").eq("id", decision.grantId).eq("user_id", order.data.user_id).maybeSingle();
      commerceDbError(grant.error);
      if (!grant.data) throw new CommerceError("Acesso não encontrado neste pedido.", 404);
      const item = await db.from("order_items").select("id").eq("id", grant.data.order_item_id).eq("order_id", id).maybeSingle();
      commerceDbError(item.error);
      if (!item.data) throw new CommerceError("Acesso não encontrado neste pedido.", 404);
      commerceDbError((await db.rpc("teorema_set_access_state", { p_actor_id: actor, p_grant_id: decision.grantId, p_state: decision.state, p_reason: decision.reason, p_operation_id: decision.operationId })).error);
    } else if (decision.action === "confirm") {
      commerceDbError((await db.rpc("teorema_confirm_order", { p_actor_id: actor, p_order_id: id })).error);
    } else {
      commerceDbError((await db.rpc("teorema_cancel_order", { p_actor_id: actor, p_order_id: id, p_reason: decision.reason })).error);
    }
    // A read can fail after COMMIT; the client retries the original decision.
    return privateJson(await adminOrderDetail(db, id));
  });
}
