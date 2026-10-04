import { privateJson } from "@/lib/http";

export async function POST() {
  return privateJson({ error: "Este acesso antigo foi desativado. Utilize /login com sua conta." }, 410);
}
