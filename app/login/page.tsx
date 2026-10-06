"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { isAdmin, safeNext } from "@/lib/auth-policy";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [registerHref, setRegisterHref] = useState("/cadastro");

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) setRegisterHref("/cadastro?next=" + encodeURIComponent(safeNext(next, "/carrinho")));
    if (new URLSearchParams(window.location.search).get("confirmation") === "invalid") {
      setFeedback("O link de confirmação é inválido, expirou ou foi aberto em outro navegador. Se você já confirmou seu e-mail, entre com sua senha.");
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFeedback("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace(safeNext(new URLSearchParams(window.location.search).get("next"), isAdmin(data.user) ? "/admin" : "/perfil"));
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error && /confirm/i.test(error.message) ? "Confirme seu e-mail antes de entrar." : "Não foi possível entrar. Confira e-mail e senha ou tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration">TE</div>
      <Link className="auth-brand" href="/">
        <span className="brand-mark">TE</span>
        <span>Teorema<br /><i>da Educação</i></span>
      </Link>

      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-card-header">
          <p className="eyebrow">Área do aluno</p>
          <h1 id="login-title">Que bom ter você de volta.</h1>
          <p>Entre para acessar seus materiais e seguir para o seu carrinho.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="login-email">E-mail</label>
            <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </div>
          <div className="auth-field">
            <label htmlFor="login-password">Senha</label>
            <input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={6} required />
          </div>
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}<span>↗</span>
          </button>
        </form>

        {feedback && <p className="auth-feedback" role="alert">{feedback}</p>}
        <Link className="auth-switch" href={registerHref}>Ainda não tenho uma conta</Link>
      </section>
      <p className="auth-footer">A educação transforma quando encontra o próximo passo.</p>
    </main>
  );
}
