import { adminAccess } from "@/lib/auth";
import { privateJson } from "@/lib/http";
import { pagination } from "@/lib/schemas";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const access = await adminAccess();
    if (!access.user) return privateJson({ error: "Sessão encerrada." }, 401);
    if (!access.allowed) return privateJson({ error: "Acesso negado." }, 403);
    const url = new URL(request.url);
    const section = url.searchParams.get("section");
    if (section !== "users" && section !== "products") return privateJson({ error: "Seção inválida." }, 400);
    const { page, size, from, to } = pagination(url.searchParams.get("page"));
    const table = section === "users" ? "profiles" : "products";
    const columns = section === "users" ? "id,email,cpf,phone,created_at" : "id,name,description,price,image_url,created_at";
    const { data, error, count } = await getSupabaseAdmin().from(table).select(columns, { count: "exact" })
      .order("created_at", { ascending: false }).order("id").range(from, to);
    if (error) return privateJson({ error: "Não foi possível consultar esta lista. Tente novamente." }, 503);
    return privateJson({ items: data || [], total: count || 0, page, size });
  } catch { return privateJson({ error: "Painel temporariamente indisponível." }, 503); }
}

export async function POST() {
  return privateJson({ error: "Cadastro antigo desativado. Use a gestão de produtos com validação de PDF." }, 410);
}
