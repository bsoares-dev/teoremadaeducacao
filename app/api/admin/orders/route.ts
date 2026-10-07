import { commerceAdmin, commerceRoute, commerceDbError, customerId, emails } from "@/lib/admin-commerce";
import { commerceFilters, dateBounds } from "@/lib/admin-commerce-contract";
import { summarizeOrder } from "@/lib/orders";
import { pagination } from "@/lib/schemas";
import { privateJson } from "@/lib/http";

export async function GET(request: Request) {
  return commerceRoute(async () => {
    const { db } = await commerceAdmin();
    const url = new URL(request.url), filter = commerceFilters(url);
    const { page, size, from, to } = pagination(url.searchParams.get("page"));
    const userId = await customerId(db, filter.email);
    if (userId === null) return privateJson({ items: [], total: 0, page, size });
    let query = db.from("orders").select("id,code,status,total_amount,created_at,user_id", { count: "exact" });
    if (filter.code) query = query.eq("code", filter.code);
    if (userId) query = query.eq("user_id", userId);
    if (filter.status) query = query.eq("status", filter.status);
    const bounds = dateBounds(filter.from, filter.to);
    if (bounds.start) query = query.gte("created_at", bounds.start);
    if (bounds.end) query = query.lt("created_at", bounds.end);
    const { data, error, count } = await query.order("created_at", { ascending: false }).order("id").range(from, to);
    commerceDbError(error);
    const names = await emails(db, (data || []).map(o => o.user_id));
    return privateJson({ items: (data || []).map(o => ({ ...summarizeOrder(o), userId: o.user_id, email: names.get(o.user_id) || null })), total: count || 0, page, size });
  });
}
