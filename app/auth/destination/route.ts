import { NextResponse } from "next/server";
import { adminAccess } from "@/lib/auth";
import { privateJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const { user, allowed } = await adminAccess();
    const destination = !user ? "/login" : allowed ? "/admin" : "/perfil";
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return privateJson({ error: "Não foi possível consultar seu acesso. Tente novamente." }, 503);
  }
}
