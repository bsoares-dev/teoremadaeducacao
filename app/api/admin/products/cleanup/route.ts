import { z } from "zod";
import { adminRoute, productAdmin, input, dbError, AdminError } from "@/lib/admin-products";
import { STAGING_BUCKET, stagingKey, finalKey, type UploadRecord } from "@/lib/uploads";
import { privateJson } from "@/lib/http";

export async function POST(request: Request) {
  return adminRoute(async () => {
    const { db, actor } = await productAdmin();
    z.object({ confirm: z.literal(true) }).strict().parse(await input(request));
    // TUS upload URLs may live for 24h. Wait 48h before deleting staging objects;
    // never delete a current/validated historical PDF or a previous validated cover.
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db.from("product_uploads").select("id,product_id,kind,state,created_at")
      .is("cleaned_at", null).lt("created_at", cutoff).order("created_at").limit(20);
    dbError(error);
    let cleaned = 0;
    for (const item of data || []) {
      const upload = item as UploadRecord;
      if (upload.state === "UPLOADING") {
        const rejected = await db.rpc("teorema_reject_upload", { p_actor_id: actor, p_upload_id: upload.id, p_reason: "Envio expirado após 48 horas, sem finalização." });
        dbError(rejected.error); upload.state = "REJECTED";
      }
      const staged = await db.storage.from(STAGING_BUCKET).remove([stagingKey(upload)]);
      if (staged.error) throw new AdminError("Limpeza parcial. Histórico preservado; tente novamente.", 503);
      if (upload.state === "REJECTED") {
        const bucket = upload.kind === "PDF" ? "teorema-pdfs" : "teorema-covers";
        const removed = await db.storage.from(bucket).remove([finalKey(upload)]);
        if (removed.error) throw new AdminError("Limpeza parcial. Histórico preservado; tente novamente.", 503);
      }
      const marked = await db.from("product_uploads").update({ cleaned_at: new Date().toISOString() }).eq("id", upload.id);
      dbError(marked.error); cleaned++;
    }
    return privateJson({ cleaned, message: `${cleaned} envio(s) expirado(s) limpo(s). Apenas temporários e arquivos rejeitados foram removidos; versões validadas e seu histórico foram preservados.` });
  });
}
