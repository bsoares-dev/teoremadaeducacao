import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { safeNext } from "@/lib/auth-policy";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (token_hash && (type === "email" || type === "signup")) {
    try {
      const client = await createClient();
      const { error } = await client.auth.verifyOtp({ token_hash, type });
      if (!error) return NextResponse.redirect(new URL(safeNext(url.searchParams.get("next"), "/carrinho"), url.origin));
    } catch { /* No token or internal error details in the response. */ }
  }
  return NextResponse.redirect(new URL("/login?confirmation=invalid&next=" + encodeURIComponent(safeNext(url.searchParams.get("next"), "/carrinho")), url.origin));
}
