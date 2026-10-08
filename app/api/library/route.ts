import { libraryAuth, libraryRoute, readLibrary } from "@/lib/library";
import { privateJson } from "@/lib/http";
import { pagination } from "@/lib/schemas";

export async function GET(request: Request) {
  return libraryRoute(async () => {
    const { user, db } = await libraryAuth();
    const { page } = pagination(new URL(request.url).searchParams.get("page"));
    return privateJson(await readLibrary(db, user.id, page));
  });
}
