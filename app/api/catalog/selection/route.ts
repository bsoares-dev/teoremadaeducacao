import { getAuth } from "@/lib/auth";
import { privateJson, readJson } from "@/lib/http";
import { materialStates, selectionPreviewEnabled, selectionRequest } from "@/lib/catalog-selection";
import { cartPreviewEnabled } from "@/lib/cart-contract";

// Read-only endpoint. Never accepts a user ID, price or path to a PDF.
export async function POST(request: Request) {
  if (!selectionPreviewEnabled(process.env)) return privateJson({ error: "Recurso indisponível." }, 404);
  let ids: string[];
  try { ids = [...new Set(selectionRequest.parse(await readJson(request)).ids.map(id => id.toLowerCase()))]; }
  catch { return privateJson({ error: "Seleção inválida." }, 400); }
  try {
    const { supabase, user } = await getAuth();
    const [products, grants, cart] = await Promise.all([
      ids.length ? supabase.from("products").select("id").in("id", ids).eq("is_active", true) : Promise.resolve({ data: [], error: null }),
      user && ids.length ? supabase.from("access_grants").select("product_id").eq("user_id", user.id).eq("state", "ATIVO").in("product_id", ids)
        : Promise.resolve({ data: [], error: null }),
      user && cartPreviewEnabled(process.env) ? supabase.from("carts").select("id").eq("user_id", user.id).eq("status", "OPEN").order("created_at").limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const items = cart.data ? await supabase.from("cart_items").select("product_id").eq("cart_id", cart.data.id).limit(50) : { data: [], error: null };
    if (products.error || grants.error || cart.error || items.error) throw new Error("Catalog unavailable");
    return privateJson({ states: materialStates(ids, (products.data || []).map(p => p.id), (grants.data || []).map(g => g.product_id)), cartIds: (items.data || []).map(i => i.product_id) });
  } catch { return privateJson({ error: "Não foi possível conferir os materiais. Tente novamente." }, 503); }
}
