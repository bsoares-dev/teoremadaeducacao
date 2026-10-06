import { adminRoute, productAdmin, input, stateSchema, dbError } from "@/lib/admin-products";
import { uuid } from "@/lib/uploads";
import { privateJson } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return adminRoute(async () => {
    const { db, actor } = await productAdmin();
    const id = uuid.parse((await params).id);
    const v = stateSchema.parse(await input(request));
    const { data, error } = await db.rpc("teorema_set_product_state", { p_actor_id: actor, p_product_id: id,
      p_state: v.state, p_revision: v.revision, p_operation_id: v.operationId });
    dbError(error);
    return privateJson({ product: data });
  });
}
