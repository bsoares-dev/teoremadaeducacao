import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { isAdmin, safeNext } from "./auth-policy";

export async function getAuth() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError" && ![400, 401, 403].includes(error.status || 0)) {
    throw new Error("Serviço de autenticação indisponível.");
  }
  return { supabase, user: error ? null : data.user };
}

export async function requireUser(next = "/perfil") {
  const auth = await getAuth();
  if (!auth.user) redirect("/login?next=" + encodeURIComponent(safeNext(next)));
  return { supabase: auth.supabase, user: auth.user };
}

export async function adminAccess() {
  const auth = await getAuth();
  return { ...auth, allowed: isAdmin(auth.user) };
}
