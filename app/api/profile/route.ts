import { getAuth } from "@/lib/auth";
import { privateJson, readJson } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { profileNameUpdateSchema, profileNameResultSchema } from "@/lib/profile-name-schema";

export async function GET() {
  try {
    const { supabase, user } = await getAuth();
    if (!user) return privateJson({ error: "Sessão encerrada." }, 401);
    const { data, error } = await supabase.from("profiles").select("full_name,email,cpf,phone,created_at").eq("id", user.id).maybeSingle();
    if (error) return privateJson({ error: "Não foi possível consultar o perfil." }, 503);
    if (!data) return privateJson({ error: "Conta ativa, perfil ainda não sincronizado." }, 404);
    return privateJson({ profile: { ...data, email: user.email } });
  } catch { return privateJson({ error: "Serviço temporariamente indisponível." }, 503); }
}

export async function PATCH(request: Request) {
  try {
    const { user } = await getAuth();
    if (!user) return privateJson({ error: "Sessão encerrada." }, 401);
    if (!user.email_confirmed_at || user.is_anonymous) return privateJson({ error: "Confirme sua conta para atualizar o nome." }, 403);
    let input;
    try {
      const parsed = profileNameUpdateSchema.safeParse(await readJson(request));
      if (!parsed.success) return privateJson({ error: parsed.error.issues[0]?.message || "Confira seu nome." }, 400);
      input = parsed.data;
    } catch { return privateJson({ error: "Requisição inválida." }, 400); }
    // The owner comes exclusively from verified Auth, never from the request.
    const { data, error } = await getSupabaseAdmin().rpc("teorema_update_profile_name", {
      p_user_id: user.id, p_full_name: input.fullName,
    });
    if (error) {
      if (error.code === "42501") return privateJson({ error: "Sua conta não pode atualizar o nome agora." }, 403);
      if (["23514", "22023"].includes(error.code)) return privateJson({ error: "Confira seu nome completo." }, 400);
      return privateJson({ error: "Não foi possível salvar seu nome agora." }, 503);
    }
    const parsed = profileNameResultSchema.safeParse(data);
    if (!parsed.success) return privateJson({ error: "Não foi possível confirmar a atualização. Atualize a página antes de tentar novamente." }, 503);
    return privateJson(parsed.data);
  } catch { return privateJson({ error: "Serviço temporariamente indisponível." }, 503); }
}
