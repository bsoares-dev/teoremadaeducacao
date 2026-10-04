"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export function SessionGuard({ userId, children }: { userId: string; children: ReactNode }) {
  const router = useRouter();
  const [valid, setValid] = useState(true);
  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      // Never query Supabase inside the auth callback (it runs under its auth lock).
      if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session) || (session && session.user.id !== userId)) {
        setValid(false);
        router.replace("/login");
        router.refresh();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router, userId]);
  return valid ? children : <p role="status">Sessão encerrada.</p>;
}

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true); setError("");
    try {
      const result = await createClient().auth.signOut();
      if (result.error) throw result.error;
      router.replace("/login");
      router.refresh();
    } catch { setError("Não foi possível sair. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <div><button className="account-button secondary" onClick={logout} disabled={busy}>{busy ? "Saindo..." : "Sair"}</button>{error && <p role="alert">{error}</p>}</div>;
}

export function RetryButton() {
  const router = useRouter();
  return <button className="account-button" onClick={() => router.refresh()}>Tentar novamente</button>;
}
