import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/perfil/:path*", "/admin/:path*", "/carrinho/:path*", "/pedidos/:path*", "/materiais/:path*", "/api/:path*", "/auth/:path*", "/login", "/cadastro"],
};
