import { downloadInput } from "@/lib/library-contract";
import { libraryAuth, libraryRoute, downloadTicket, LibraryError } from "@/lib/library";
import { privateJson, readJson } from "@/lib/http";

export async function POST(request: Request) {
  return libraryRoute(async () => {
    const { user, db } = await libraryAuth();
    let raw;
    try { raw = await readJson(request); } catch { throw new LibraryError("Formato ou origem da requisição inválida.", 400); }
    const { productId } = downloadInput.parse(raw);
    const response = privateJson(await downloadTicket(db, user.id, productId));
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  });
}
