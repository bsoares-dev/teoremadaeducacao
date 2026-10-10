import { z } from "zod";
import { commerceAdmin, commerceRoute, CommerceError } from "@/lib/admin-commerce";
import { licenseDecision } from "@/lib/admin-pdf-contract";
import { decidePdfLicense, pdfLicenseHistory } from "@/lib/pdf-licenses/admin-repository";
import { privateJson, readJson } from "@/lib/http";
import { requireActivePdfSession } from "@/lib/pdf-download/session";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  return commerceRoute(async () => {
    const { db, actor, supabase } = await commerceAdmin();
    await requireActivePdfSession(supabase, db, actor);
    const id = z.uuid().parse((await params).id), page = z.coerce.number().int().min(1).max(100000).parse(new URL(request.url).searchParams.get("page") || "1");
    return privateJson(await pdfLicenseHistory(db, actor, id, page));
  });
}
export async function POST(request: Request, { params }: Context) {
  return commerceRoute(async () => {
    const { db, actor, supabase } = await commerceAdmin();
    await requireActivePdfSession(supabase, db, actor);
    const id = z.uuid().parse((await params).id);
    let raw: unknown;
    try { raw = await readJson(request); } catch { throw new CommerceError("Formato ou origem da requisição inválida.", 400); }
    return privateJson(await decidePdfLicense(db, actor, id, licenseDecision.parse(raw)));
  });
}
