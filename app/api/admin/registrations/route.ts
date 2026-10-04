import { privateJson } from "@/lib/http";

export async function GET() {
  return privateJson({ error: "Este acesso antigo foi desativado. Utilize /login com sua conta." }, 410);
}
