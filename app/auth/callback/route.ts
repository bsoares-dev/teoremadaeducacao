import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { safeNext } from "@/lib/auth-policy";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const client = await createClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(safeNext(url.searchParams.get("next")), url.origin));
    } catch { /* Offer a recoverable login screen below. */ }
  }
  return NextResponse.redirect(new URL("/login?confirmation=invalid", url.origin));
}
