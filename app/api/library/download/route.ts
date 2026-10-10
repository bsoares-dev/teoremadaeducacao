import { downloadInput } from "@/lib/library-contract";
import { libraryAuth, libraryRoute, LibraryError } from "@/lib/library";
import { readJson } from "@/lib/http";
import { consumeRequest } from "@/lib/request-limits";
import { downloadPersonalizedPdf } from "@/lib/pdf-download/service";
import { personalizedPdfResponse } from "@/lib/pdf-download/response";
import { requireActivePdfSession } from "@/lib/pdf-download/session";

export const maxDuration = 120;

export async function POST(request: Request) {
  return libraryRoute(async () => {
    const { user, db, supabase } = await libraryAuth();
    let raw;
    try { raw = await readJson(request); } catch { throw new LibraryError("Formato ou origem da requisição inválida.", 400); }
    const { productId } = downloadInput.parse(raw);
    const sessionCheck = await requireActivePdfSession(supabase, db, user.id);
    await consumeRequest(db, user.id, "PDF_DOWNLOAD");
    return personalizedPdfResponse(await downloadPersonalizedPdf(db, user, productId, request.signal, sessionCheck));
  });
}
