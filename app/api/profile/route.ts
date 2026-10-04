import { getAuth } from "@/lib/auth";
import { privateJson } from "@/lib/http";

export async function GET() {
  try {
    const { supabase, user } = await getAuth();
    if (!user) return privateJson({ error: "Sessão encerrada." }, 401);
    const { data, error } = await supabase.from("profiles").select("email,cpf,phone,created_at").eq("id", user.id).maybeSingle();
    if (error) return privateJson({ error: "Não foi possível consultar o perfil." }, 503);
    if (!data) return privateJson({ error: "Conta ativa, perfil ainda não sincronizado." }, 404);
    return privateJson({ profile: { ...data, email: user.email } });
  } catch { return privateJson({ error: "Serviço temporariamente indisponível." }, 503); }
}
