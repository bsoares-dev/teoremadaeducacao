import { commerceAdmin, commerceRoute, commerceDbError, customerId, accessRows, grantColumns } from "@/lib/admin-commerce";
import { commerceFilters, dateBounds } from "@/lib/admin-commerce-contract";
import { pagination } from "@/lib/schemas";
import { privateJson } from "@/lib/http";
export async function GET(request: Request) {
  return commerceRoute(async () => {
    const { db } = await commerceAdmin();
    const url = new URL(request.url), filter = commerceFilters(url);
    const { page, size, from, to } = pagination(url.searchParams.get("page"));
    const userId = await customerId(db, filter.email);
    if (userId === null) return privateJson({ items: [], total: 0, page, size });
    let query = db.from("access_grants").select(grantColumns, { count: "exact" });
    if (userId) query = query.eq("user_id", userId);
    if (filter.state) query = query.eq("state", filter.state);
    const bounds = dateBounds(filter.from, filter.to);
    if (bounds.start) query = query.gte("granted_at", bounds.start);
    if (bounds.end) query = query.lt("granted_at", bounds.end);
    const result = await query.order("granted_at", { ascending: false }).order("id").range(from, to);
    commerceDbError(result.error);
    return privateJson({ items: await accessRows(db, result.data || []), total: result.count || 0, page, size });
  });
}
