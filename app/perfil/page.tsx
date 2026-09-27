"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  email: string;
  cpf: string;
  phone: string;
  createdAt: string;
};

export default function PerfilPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const loadProfile = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.replace("/login");
      return;
    }

    const response = await fetch("/api/profile", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "Não foi possível carregar seu perfil.");
      setLoading(false);
      return;
    }

    setProfile(data.profile);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadProfile();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile, router]);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) return <main className="profile-page"><p className="profile-loading">Carregando seu perfil...</p></main>;

  if (!profile) {
    return <main className="profile-page"><section className="profile-card"><p className="eyebrow">Área do aluno</p><h1>Perfil indisponível.</h1><p>{message}</p><button onClick={() => router.replace("/login")}>Voltar ao login</button></section></main>;
  }

  return (
    <main className="profile-page">
      <section className="profile-card">
        <p className="eyebrow">Área do aluno</p>
        <h1>Olá, <em>{profile.email}</em></h1>
        <p className="profile-intro">Seu acesso está ativo. Confira os seus dados de cadastro.</p>

        <dl className="profile-data">
          <div><dt>E-mail</dt><dd>{profile.email}</dd></div>
          <div><dt>CPF</dt><dd>{profile.cpf}</dd></div>
          <div><dt>Telefone</dt><dd>{profile.phone}</dd></div>
          <div><dt>Cadastro</dt><dd>{new Date(profile.createdAt).toLocaleDateString("pt-BR")}</dd></div>
        </dl>

        <div className="profile-actions">
          <button className="profile-primary" onClick={() => router.push("/carrinho")}>Ir para o carrinho <span>↗</span></button>
          <button className="profile-secondary" onClick={handleSignOut} disabled={signingOut}>{signingOut ? "Saindo..." : "Sair"}</button>
        </div>
      </section>
    </main>
  );
}
