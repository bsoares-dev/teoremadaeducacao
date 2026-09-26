import { NextResponse } from "next/server";
import { listRegistrations } from "../../../lib/registrations";
import { isValidAdminSession } from "../../../lib/security";

export async function GET(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)teorema_admin_session=([^;]+)/)?.[1];
  if (!isValidAdminSession(token)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    return NextResponse.json({ registrations: await listRegistrations() });
  } catch (error: unknown) {
    console.error("Admin registrations error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Banco de dados não configurado ou indisponível." }, { status: 503 });
  }
}
