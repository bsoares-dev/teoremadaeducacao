import { adminAccess } from "@/lib/auth";
import { privateJson, readJson } from "@/lib/http";
import { pagination, productSchema } from "@/lib/schemas";
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

export async function POST(request: Request) {
  try {
    const access = await adminAccess();
    if (!access.user) return privateJson({ error: "Sessão encerrada." }, 401);
    if (!access.allowed) return privateJson({ error: "Acesso negado." }, 403);
    let body;
    try { body = await readJson(request); }
    catch { return privateJson({ error: "Requisição inválida." }, 400); }
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) return privateJson({ error: parsed.error.issues[0]?.message || "Confira os dados." }, 400);
    const { name, description, price, imageUrl } = parsed.data;
    const { data, error } = await getSupabaseAdmin().from("products")
      .insert({ name, description, price, image_url: imageUrl, is_active: true })
      .select("id,name,description,price,image_url,created_at").single();
    if (error) return privateJson({ error: "Não foi possível salvar. Confira a lista antes de tentar novamente." }, 503);
    return privateJson({ product: data }, 201);
  } catch { return privateJson({ error: "Painel temporariamente indisponível." }, 503); }
}
