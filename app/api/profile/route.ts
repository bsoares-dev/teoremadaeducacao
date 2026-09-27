import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Sessão não encontrada." }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("email, cpf, phone, created_at")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (error) {
    console.error("Profile lookup error", error.message);
    return NextResponse.json({ error: "Não foi possível carregar o perfil." }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: "Perfil ainda não está disponível." }, { status: 404 });
  }

  return NextResponse.json({
    profile: {
      email: profile.email || authData.user.email || "",
      cpf: profile.cpf || "",
      phone: profile.phone || "",
      createdAt: profile.created_at || authData.user.created_at,
    },
  });
}
