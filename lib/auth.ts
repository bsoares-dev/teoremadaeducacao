import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { verifiedAdmin, safeNext } from "./auth-policy";
import { getSupabaseAdmin } from "./supabaseAdmin";

// React's RSC cache is request-scoped, not shared between visitors or requests.
// Nested server components reuse this verified user; Route Handlers still
// perform their own authoritative Auth lookup.
export const getAuth = cache(async function getAuth() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError" && ![400, 401, 403].includes(error.status || 0)) {
    throw new Error("Serviço de autenticação indisponível.");
  }
  return { supabase, user: error ? null : data.user };
});

export async function requireUser(next = "/perfil") {
  const auth = await getAuth();
  if (!auth.user) redirect("/login?next=" + encodeURIComponent(safeNext(next)));
  return { supabase: auth.supabase, user: auth.user };
}

export async function adminAccess() {
  const auth = await getAuth();
  const allowed = await verifiedAdmin(auth.user, async id =>
    getSupabaseAdmin().rpc("teorema_admin_check", { p_actor_id: id }));
  return { ...auth, allowed };
}
