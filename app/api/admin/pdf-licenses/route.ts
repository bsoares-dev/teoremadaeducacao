import { commerceAdmin, commerceRoute } from "@/lib/admin-commerce";
import { licenseFilters } from "@/lib/admin-pdf-contract";
import { listPdfLicenses } from "@/lib/pdf-licenses/admin-repository";
import { privateJson } from "@/lib/http";
import { requireActivePdfSession } from "@/lib/pdf-download/session";

export async function GET(request: Request) {
  return commerceRoute(async () => {
    const { db, actor, supabase } = await commerceAdmin();
    await requireActivePdfSession(supabase, db, actor);
    return privateJson(await listPdfLicenses(db, actor, licenseFilters(new URL(request.url))));
  });
}
