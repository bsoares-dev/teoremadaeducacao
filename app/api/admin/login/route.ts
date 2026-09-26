import { NextResponse } from "next/server";
import { createAdminSession, isValidSecret } from "../../../lib/security";

const attempts = new Map<string, { count: number; resetAt: number }>();

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function isRateLimited(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  current.count += 1;
  return current.count > 5;
}

export async function POST(request: Request) {
  const expectedEmail = process.env.ADMIN_EMAIL;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedEmail || !expectedPassword || !process.env.ENCRYPTION_KEY) return NextResponse.json({ error: "Painel não configurado." }, { status: 503 });
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  if (isRateLimited(request)) return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!isValidSecret(email, expectedEmail) || !password || !isValidSecret(password, expectedPassword)) return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("teorema_admin_session", createAdminSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 8 * 60 * 60,
    path: "/",
  });
  return response;
}
