import { signupSchema } from "@/lib/schemas";
import { privateJson, readJson } from "@/lib/http";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  let input;
  try {
    const parsed = signupSchema.safeParse(await readJson(request));
    if (!parsed.success) return privateJson({ error: parsed.error.issues[0]?.message || "Confira seus dados." }, 400);
    input = parsed.data;
  } catch { return privateJson({ error: "Requisição inválida." }, 400); }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email, password: input.password,
      options: {
        data: { cpf: input.cpf, phone: input.phone },
        emailRedirectTo: new URL("/auth/callback?next=/carrinho", request.url).toString(),
      },
    });
    if (error) return privateJson({ error: error.status === 429 ? "Muitas tentativas. Aguarde alguns minutos." : "Não foi possível criar a conta. Confira seus dados ou tente entrar se já tiver cadastro." }, error.status === 429 ? 429 : 400);
    return privateJson({ needsConfirmation: !data.session });
  } catch { return privateJson({ error: "Cadastro temporariamente indisponível." }, 503); }
}
