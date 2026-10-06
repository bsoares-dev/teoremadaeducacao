import { adminRoute, productAdmin, input, editProductSchema, dbError, productColumns } from "@/lib/admin-products";
import { pagination } from "@/lib/schemas";
import { privateJson } from "@/lib/http";

export async function GET(request: Request) {
  return adminRoute(async () => {
    const { db } = await productAdmin();
    const { page, size, from, to } = pagination(new URL(request.url).searchParams.get("page"));
    const { data, error, count } = await db.from("products").select(productColumns, { count: "exact" })
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
