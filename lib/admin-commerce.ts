import "server-only";
import { ZodError } from "zod";
import { adminAccess } from "./auth";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { cartPreviewEnabled } from "./cart-contract";
import { privateJson } from "./http";
import { summarizeOrder } from "./orders";
import { commerceDetail, type AccessRow } from "./admin-commerce-contract";
import { pagination } from "./schemas";
import { PdfSessionError } from "./pdf-download/session-contract";

export class CommerceError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function commerceDbError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new CommerceError("Operação não autorizada ou registro indisponível.", 403);
  if (["23514", "23505", "22023", "40001"].includes(error.code || "")) throw new CommerceError("O estado mudou ou há material indisponível. Atualize o pedido antes de decidir novamente.", 409);
  throw new CommerceError("Resultado não confirmado. Consulte o pedido e recupere a mesma tentativa.", 503);
}
export async function commerceAdmin() {
  if (!cartPreviewEnabled(process.env)) throw new CommerceError("Gestão de pedidos disponível somente na prévia autorizada.", 404);
  const access = await adminAccess();
  if (!access.user) throw new CommerceError("Sessão encerrada.", 401);
  if (!access.allowed) throw new CommerceError("Acesso negado.", 403);
  const db = getSupabaseAdmin();
  commerceDbError((await db.rpc("teorema_admin_check", { p_actor_id: access.user.id })).error);
  return { db, actor: access.user.id, supabase: access.supabase };
}
export async function commerceRoute(run: () => Promise<Response>) {
  try { return await run(); }
  catch (error) {
    if (error instanceof ZodError) return privateJson({ error: error.issues[0]?.message || "Dados inválidos." }, 400);
    if (error instanceof CommerceError) return privateJson({ error: error.message }, error.status);
    if (error instanceof PdfSessionError) return privateJson({ error: error.message }, error.status);
    return privateJson({ error: "Resultado temporariamente indisponível. Atualize ou recupere a mesma tentativa." }, 503);
  }
}
type Db = ReturnType<typeof getSupabaseAdmin>;
export async function emails(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const result = await db.from("profiles").select("id,email").in("id", [...new Set(ids)]);
  commerceDbError(result.error);
  return new Map((result.data || []).map(p => [p.id, p.email]));
}
export async function customerId(db: Db, email?: string) {
  if (!email) return undefined;
  const result = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  commerceDbError(result.error);
  return result.data?.id ?? null;
}
export const grantColumns = "id,order_item_id,user_id,product_id,state,granted_by,granted_at,revoked_by,revoked_at,revocation_reason";
type Grant = { id: string; order_item_id: string; user_id: string; product_id: string; state: "ATIVO" | "REVOGADO"; granted_by: string; granted_at: string; revoked_by: string | null; revoked_at: string | null; revocation_reason: string | null };
export async function accessRows(db: Db, grants: Grant[]): Promise<AccessRow[]> {
  if (!grants.length) return [];
  const pairs = [...new Map(grants.map(g => [`${g.user_id}:${g.product_id}`, g])).entries()];
  const [items, names, active] = await Promise.all([
    db.from("order_items").select("id,order_id,product_name").in("id", grants.map(g => g.order_item_id)),
    emails(db, grants.flatMap(g => [g.user_id, g.granted_by, ...(g.revoked_by ? [g.revoked_by] : [])])),
    Promise.all(pairs.map(async ([key, g]) => {
      const result = await db.from("access_grants").select("id").eq("user_id", g.user_id).eq("product_id", g.product_id).eq("state", "ATIVO").limit(1);
      commerceDbError(result.error); return result.data?.length ? key : null;
    })),
  ]);
  commerceDbError(items.error);
  const orders = await db.from("orders").select("id,code").in("id", [...new Set((items.data || []).map(i => i.order_id))]);
  commerceDbError(orders.error);
  const itemMap = new Map((items.data || []).map(i => [i.id, i])), orderMap = new Map((orders.data || []).map(o => [o.id, o.code]));
  const effective = new Set(active.filter((key): key is string => key !== null));
  return grants.map(g => {
    const i = itemMap.get(g.order_item_id);
    if (!i || !orderMap.get(i.order_id)) throw new CommerceError("Origem do acesso indisponível.", 503);
    return { id: g.id, orderId: i.order_id, code: orderMap.get(i.order_id)!, userId: g.user_id, email: names.get(g.user_id) || null,
      productId: g.product_id, name: i.product_name, state: g.state, effectiveAccess: effective.has(`${g.user_id}:${g.product_id}`),
      grantedAt: g.granted_at, grantedBy: names.get(g.granted_by) || g.granted_by, revokedAt: g.revoked_at,
      revokedBy: g.revoked_by ? names.get(g.revoked_by) || g.revoked_by : null, reason: g.revocation_reason };
  });
}
export async function adminOrderDetail(db: Db, id: string, page: string | null = null) {
  const order = await db.from("orders").select("id,code,status,total_amount,created_at,user_id,confirmed_at,confirmed_by,canceled_at,canceled_by,cancellation_reason").eq("id", id).maybeSingle();
  commerceDbError(order.error);
  if (!order.data) throw new CommerceError("Pedido não encontrado.", 404);
  const o = order.data;
  const [items, customer] = await Promise.all([
    db.from("order_items").select("id,product_id,product_name,unit_price").eq("order_id", id).order("product_id").limit(50),
    emails(db, [o.user_id, ...(o.confirmed_by ? [o.confirmed_by] : []), ...(o.canceled_by ? [o.canceled_by] : [])]),
  ]);
  commerceDbError(items.error);
  const grants = await db.from("access_grants").select(grantColumns).in("order_item_id", (items.data || []).map(i => i.id));
  commerceDbError(grants.error);
  const { page: historyPage, from, to } = pagination(page);
  const [accesses, history] = await Promise.all([
    accessRows(db, grants.data || []),
    db.from("admin_audit_events").select("id,entity_id,actor_id,action,reason,created_at", { count: "exact" }).in("entity_id", [id, ...(grants.data || []).map(g => g.id)])
      .in("action", ["ORDER_CONFIRMED", "ORDER_CANCELED", "ACCESS_REVOKED", "ACCESS_RESTORED"]).order("created_at", { ascending: false }).order("id").range(from, to),
  ]);
  commerceDbError(history.error);
  const actors = await emails(db, (history.data || []).map(h => h.actor_id));
  const byProduct = new Map(accesses.map(a => [a.productId, a]));
  const result = commerceDetail.safeParse({
    order: { ...summarizeOrder(o), userId: o.user_id, email: customer.get(o.user_id) || null,
      confirmedAt: o.confirmed_at, confirmedBy: o.confirmed_by ? customer.get(o.confirmed_by) || o.confirmed_by : null,
      canceledAt: o.canceled_at, canceledBy: o.canceled_by ? customer.get(o.canceled_by) || o.canceled_by : null, reason: o.cancellation_reason },
    items: (items.data || []).map(i => ({ id: i.id, productId: i.product_id, name: i.product_name, priceCents: Math.round(Number(i.unit_price) * 100), access: byProduct.get(i.product_id) || null })),
    history: (history.data || []).map(h => ({ id: h.id, entityId: h.entity_id, actorId: h.actor_id, actorEmail: actors.get(h.actor_id) || null, action: h.action, reason: h.reason, createdAt: h.created_at })),
    historyTotal: history.count || 0, historyPage,
  });
  if (!result.success) throw new CommerceError("Estado do pedido indisponível. Recupere a mesma tentativa.", 503);
  return result.data;
}
