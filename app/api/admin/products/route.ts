import { adminRoute, productAdmin, input, editProductSchema, dbError, productColumns } from "@/lib/admin-products";
import { pagination } from "@/lib/schemas";
import { privateJson } from "@/lib/http";
import { productArchiveFilter, includeArchivedProducts } from "@/lib/admin-product-list";

export async function GET(request: Request) {
  return adminRoute(async () => {
    const { db } = await productAdmin();
    const params = new URL(request.url).searchParams;
    const { page, size, from, to } = pagination(params.get("page"));
    const query = db.from("products").select(productColumns, { count: "exact" });
    const filter = productArchiveFilter(includeArchivedProducts(params));
    const listing = filter ? query.neq(filter.column, filter.value) : query;
    const { data, error, count } = await listing
      .order("created_at", { ascending: false }).order("id").range(from, to);
    dbError(error);
    return privateJson({ items: data || [], total: count || 0, page, size });
  });
}
export async function POST(request: Request) {
  return adminRoute(async () => {
    const { db, actor } = await productAdmin();
    const v = editProductSchema.parse(await input(request));
    const { data, error } = await db.rpc("teorema_save_product", { p_actor_id: actor, p_product_id: v.id, p_revision: v.revision,
      p_name: v.name, p_description: v.description, p_price: v.price });
    dbError(error);
    return privateJson({ product: data });
  });
}
