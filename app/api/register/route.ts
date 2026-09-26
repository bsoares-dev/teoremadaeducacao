import { NextResponse } from "next/server";
import { createRegistration } from "../../lib/registrations";
import { hashIp } from "../../lib/security";
import { registrationSchema } from "../../lib/validation";

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

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(ip: string) {
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
  if (!process.env.POSTGRES_URL || !process.env.ENCRYPTION_KEY) return NextResponse.json({ error: "Cadastro temporariamente indisponível. O painel ainda não foi configurado." }, { status: 503 });
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  if (request.headers.get("content-type")?.includes("application/json") !== true) return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  if (Number(request.headers.get("content-length") || 0) > 10_000) return NextResponse.json({ error: "Requisição muito grande." }, { status: 413 });

  const ip = getClientIp(request);
  if (isRateLimited(ip)) return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });

  try {
    const payload = await request.json();
    const parsed = registrationSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Confira os dados informados." }, { status: 400 });
    }
    await createRegistration(parsed.data, hashIp(ip));
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Este e-mail ou CPF já está cadastrado." }, { status: 409 });
    }
    console.error("Registration error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível concluir o cadastro agora." }, { status: 500 });
  }
}
