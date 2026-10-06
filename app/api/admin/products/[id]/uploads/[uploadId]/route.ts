import { createHash } from "node:crypto";
import { z } from "zod";
import { adminRoute, productAdmin, input, dbError, checkBuckets, storageBytes, productDetail, AdminError } from "@/lib/admin-products";
import { uuid, PDF_LIMIT, COVER_LIMIT, STAGING_BUCKET, stagingKey, finalKey, type UploadRecord } from "@/lib/uploads";
import { validatePdf, validateCover } from "@/lib/file-validation";
import { privateJson } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;
const actionSchema = z.object({ action: z.enum(["finalize", "cancel"]) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string; uploadId: string }> }) {
  return adminRoute(async () => {
    const { db, actor } = await productAdmin();
    const paramsValue = await params;
    const id = uuid.parse(paramsValue.id), uploadId = uuid.parse(paramsValue.uploadId);
    const { action } = actionSchema.parse(await input(request));
    const { data, error } = await db.from("product_uploads").select("id,product_id,kind,expected_size,mime_type,state,created_at")
      .eq("id", uploadId).eq("product_id", id).single();
    if (error?.code === "PGRST116") throw new AdminError("Envio não encontrado.", 404);
    dbError(error);
    const upload = data as UploadRecord;
    if (upload.state === "VALIDATED") return privateJson(await productDetail(db, id));
    if (action === "cancel") {
      const rejected = await db.rpc("teorema_reject_upload", { p_actor_id: actor, p_upload_id: uploadId, p_reason: "Envio cancelado pelo administrador." });
      dbError(rejected.error); return privateJson({ canceled: true });
    }
    if (upload.state !== "UPLOADING") throw new AdminError("Envio rejeitado. Escolha um novo arquivo.", 409);
    await checkBuckets(db);
    const bytes = await storageBytes(db, STAGING_BUCKET, stagingKey(upload), upload.kind === "PDF" ? PDF_LIMIT : COVER_LIMIT);
    let validated: Uint8Array;
    try {
      if (bytes.length !== Number(upload.expected_size)) throw new Error("O tamanho recebido não corresponde ao arquivo reservado.");
      if (upload.kind === "PDF") { await validatePdf(bytes); validated = bytes; }
      else validated = await validateCover(bytes, upload.mime_type);
    } catch {
      const rejected = await db.rpc("teorema_reject_upload", { p_actor_id: actor, p_upload_id: uploadId,
        p_reason: "Arquivo rejeitado pela validação estrutural, assinatura, tamanho ou política de conteúdo." });
      dbError(rejected.error);
      throw new AdminError(upload.kind === "PDF" ? "PDF rejeitado. Exporte um PDF estático, sem senha, anexos, formulários, scripts ou links externos." : "Capa rejeitada. Use JPEG, PNG ou WebP estático de até 5 MiB e 24 megapixels.", 422);
    }
    const sha256 = createHash("sha256").update(validated).digest("hex");
    const bucket = upload.kind === "PDF" ? "teorema-pdfs" : "teorema-covers";
    const key = finalKey(upload);
    const saved = await db.storage.from(bucket).upload(key, validated, { contentType: upload.kind === "PDF" ? "application/pdf" : "image/webp", upsert: false, cacheControl: upload.kind === "PDF" ? "0" : "31536000" });
    if (saved.error) {
      // A concurrent finalization or retry may have already saved identical bytes.
      const existing = await storageBytes(db, bucket, key, upload.kind === "PDF" ? PDF_LIMIT : COVER_LIMIT);
      if (createHash("sha256").update(existing).digest("hex") !== sha256) throw new AdminError("Conflito no arquivo definitivo. Upload bloqueado; nenhuma versão foi sobrescrita.", 409);
    }
    const coverUrl = upload.kind === "COVER" ? db.storage.from(bucket).getPublicUrl(key).data.publicUrl : null;
    const finished = await db.rpc("teorema_finish_upload", { p_actor_id: actor, p_upload_id: uploadId, p_sha256: sha256, p_cover_url: coverUrl });
    dbError(finished.error);
    return privateJson(await productDetail(db, id));
  });
}
