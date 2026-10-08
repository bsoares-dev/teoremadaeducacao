import { adminRoute, productAdmin, input, dbError, checkBuckets } from "@/lib/admin-products";
import { uuid, uploadSchema, STAGING_BUCKET, stagingKey } from "@/lib/uploads";
import { privateJson } from "@/lib/http";
import { consumeRequest } from "@/lib/request-limits";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return adminRoute(async () => {
    const { db, actor } = await productAdmin();
    const id = uuid.parse((await params).id);
    const v = uploadSchema.parse(await input(request));
    await consumeRequest(db, actor, "PRODUCT_UPLOAD");
    await checkBuckets(db);
    const { data, error } = await db.rpc("teorema_reserve_upload", { p_actor_id: actor, p_product_id: id, p_upload_id: v.id,
      p_kind: v.kind, p_name: v.name, p_size: v.size, p_mime: v.mime, p_version_label: v.versionLabel });
    dbError(error);
    const path = stagingKey(data);
    const signed = await db.storage.from(STAGING_BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data) return privateJson({ error: "Não foi possível autorizar o envio. A reserva está preservada; tente novamente com o mesmo arquivo." }, 503);
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    // Direct storage hostname as recommended for TUS; only supported Supabase hosted projects.
    if (url.hostname.endsWith(".supabase.co")) url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
    return privateJson({ uploadId: v.id, bucket: STAGING_BUCKET, path, token: signed.data.token,
      endpoint: url.origin + "/storage/v1/upload/resumable" });
  });
}
