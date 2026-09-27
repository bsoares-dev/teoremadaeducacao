import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@/utils/supabase/server";

const ADMIN_EMAIL = "bernardozsoares11@gmail.com";

const productSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do produto.").max(120, "Nome muito longo."),
  description: z.string().trim().min(10, "Descreva melhor o produto.").max(2_000, "Descrição muito longa."),
  price: z.coerce.number().positive("Informe um preço maior que zero.").max(1_000_000, "Preço inválido."),
  imageUrl: z.string().trim().url("Informe uma URL de imagem válida.").max(2_000, "URL muito longa."),
});

async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email?.trim().toLowerCase();

  if (error || !data.user) return { error: NextResponse.json({ error: "Sessão não encontrada." }, { status: 401 }) };
  if (email !== ADMIN_EMAIL) return { error: NextResponse.json({ error: "Acesso negado." }, { status: 403 }) };
  return { user: data.user };
}

function hasAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function GET() {
  const access = await requireAdmin();
  if (access.error) return access.error;

  try {
    const admin = getSupabaseAdmin();
    const [profilesResult, productsResult] = await Promise.all([
      admin.from("profiles").select("id, email, cpf, phone, created_at").order("created_at", { ascending: false }),
      admin.from("products").select("id, name, description, price, image_url, created_at").order("created_at", { ascending: false }),
    ]);

    if (profilesResult.error || productsResult.error) {
      console.error("Admin dashboard query error", profilesResult.error?.message || productsResult.error?.message);
      return NextResponse.json({ error: "Não foi possível carregar os dados administrativos." }, { status: 500 });
    }

    return NextResponse.json({ profiles: profilesResult.data, products: productsResult.data });
  } catch (error) {
    console.error("Admin dashboard configuration error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Painel administrativo não configurado." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdmin();
  if (access.error) return access.error;
  if (!hasAllowedOrigin(request)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  if (request.headers.get("content-type")?.includes("application/json") !== true) return NextResponse.json({ error: "Formato inválido." }, { status: 415 });
  if (Number(request.headers.get("content-length") || 0) > 10_000) return NextResponse.json({ error: "Requisição muito grande." }, { status: 413 });

  const body = await request.json().catch(() => null);
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Confira os dados do produto." }, { status: 400 });

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("products")
      .insert({
        name: parsed.data.name,
        description: parsed.data.description,
        price: parsed.data.price,
        image_url: parsed.data.imageUrl,
      })
      .select("id, name, description, price, image_url, created_at")
      .single();

    if (error) {
      console.error("Product insert error", error.message);
      return NextResponse.json({ error: "Não foi possível cadastrar o produto." }, { status: 500 });
    }

    return NextResponse.json({ product: data }, { status: 201 });
  } catch (error) {
    console.error("Product configuration error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Painel administrativo não configurado." }, { status: 503 });
  }
}
