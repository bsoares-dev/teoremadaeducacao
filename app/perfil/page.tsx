"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

type Profile = {
  id: string;
  email: string;
  cpf: string;
  phone: string;
  created_at: string;
};

export default function PerfilPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchProfile(session: Session) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (!isMounted) return;

      if (error || !data) {
        setMessage("Não foi possível carregar seu perfil.");
        setProfile(null);
      } else {
        setProfile({
          id: data.id,
          email: data.email || session.user.email || "",
          cpf: data.cpf || "",
          phone: data.phone || "",
          created_at: data.created_at || session.user.created_at,
        });
      }

      setIsLoading(false);
    }

    // 1. Check the existing session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;

      if (session) {
        void fetchProfile(session);
      } else {
        // No session found yet — don't redirect immediately.
        // The onAuthStateChange listener below may still fire with
        // a valid session if tokens are being refreshed.
        setIsLoading(false);
      }
    });

    // 2. Listen for auth state changes as a safety net
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;

      if (session) {
        setIsLoading(true);
        void fetchProfile(session);
      } else {
        // Session was explicitly destroyed (sign-out)
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Redirect only AFTER loading finishes and there is no profile
  useEffect(() => {
    if (!isLoading && !profile) {
      router.replace("/login");
    }
  }, [isLoading, profile, router]);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // ── Loading screen ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <main className="profile-page">
        <p className="profile-loading">A carregar os teus dados...</p>
      </main>
    );
  }

  // ── No profile (will redirect via the useEffect above) ──────────
  if (!profile) {
    return (
      <main className="profile-page">
        <section className="profile-card">
          <p className="eyebrow">Área do aluno</p>
          <h1>Perfil indisponível.</h1>
          <p>{message || "A redirecionar para o login..."}</p>
        </section>
      </main>
    );
  }

  // ── Profile loaded ──────────────────────────────────────────────
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
          <div><dt>Cadastro</dt><dd>{new Date(profile.created_at).toLocaleDateString("pt-BR")}</dd></div>
        </dl>

        <div className="profile-actions">
          <button className="profile-primary" onClick={() => router.push("/carrinho")}>Ir para o carrinho <span>↗</span></button>
          <button className="profile-secondary" onClick={handleSignOut} disabled={signingOut}>{signingOut ? "Saindo..." : "Sair"}</button>
        </div>
      </section>
    </main>
  );
}
