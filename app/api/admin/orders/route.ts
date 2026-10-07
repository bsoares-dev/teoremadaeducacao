import { adminAccess } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { cartPreviewEnabled } from "@/lib/cart-contract";
import { summarizeOrder } from "@/lib/orders";
import { pagination } from "@/lib/schemas";
import { privateJson } from "@/lib/http";

// Read contract for the stage 7 dashboard. No payment/access mutations here.
export async function GET(request: Request) {
  if (!cartPreviewEnabled(process.env)) return privateJson({ error: "Recurso indisponível." }, 404);
  try {
    const access = await adminAccess();
    if (!access.user) return privateJson({ error: "Sessão encerrada." }, 401);
    if (!access.allowed) return privateJson({ error: "Acesso negado." }, 403);
    const db = getSupabaseAdmin();
    const check = await db.rpc("teorema_admin_check", { p_actor_id: access.user.id });
    if (check.error) return privateJson({ error: "Acesso administrativo indisponível." }, check.error.code === "42501" ? 403 : 503);
    const url = new URL(request.url), code = url.searchParams.get("code");
    if (code && !/^TE-\d{12,20}$/.test(code)) return privateJson({ error: "Código inválido." }, 400);
    const { page, size, from, to } = pagination(url.searchParams.get("page"));
    let query = db.from("orders").select("id,code,status,total_amount,created_at,user_id", { count: "exact" });
    if (code) query = query.eq("code", code);
    const { data, error, count } = await query.order("created_at", { ascending: false }).order("id").range(from, to);
    if (error) throw new Error("Order listing unavailable");
    return privateJson({ items: (data || []).map(o => ({ ...summarizeOrder(o), userId: o.user_id })), total: count || 0, page, size });
  } catch {
    console.error("admin_orders_unavailable");
    return privateJson({ error: "Lista de pedidos temporariamente indisponível." }, 503);
  }
}
