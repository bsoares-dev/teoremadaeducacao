import { adminRoute, productAdmin, productDetail } from "@/lib/admin-products";
import { uuid } from "@/lib/uploads";
import { privateJson } from "@/lib/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return adminRoute(async () => {
    const { db } = await productAdmin();
    const id = uuid.parse((await params).id);
    return privateJson(await productDetail(db, id));
  });
}
