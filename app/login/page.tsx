"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { safeNext } from "@/lib/auth-policy";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [registerHref, setRegisterHref] = useState("/cadastro");
  const [recoveryHref, setRecoveryHref] = useState("/auth/recuperar");
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) {
      const query = "?next=" + encodeURIComponent(safeNext(next, "/carrinho"));
      setRegisterHref("/cadastro" + query);
      setRecoveryHref("/auth/recuperar" + query);
    }
    setPasswordUpdated(new URLSearchParams(window.location.search).get("password") === "updated");
    if (new URLSearchParams(window.location.search).get("confirmation") === "invalid") {
      setFeedback("O link de confirmação é inválido, expirou ou foi aberto em outro navegador. Se você já confirmou seu e-mail, entre com sua senha.");
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFeedback("");
    setPasswordUpdated(false);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next ? safeNext(next) : "/auth/destination");
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
          <Link className="auth-recovery-link" href={recoveryHref}>Esqueci minha senha</Link>
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}<ArrowUpRight className="ui-icon" size={18} aria-hidden="true" />
          </button>
        </form>

        {feedback && <p className="auth-feedback" role="alert">{feedback}</p>}
        {passwordUpdated && <p className="auth-feedback success" role="status">Senha alterada. Entre usando sua nova senha.</p>}
        <Link className="auth-switch" href={registerHref}>Ainda não tenho uma conta</Link>
      </section>
      <p className="auth-footer">A educação transforma quando encontra o próximo passo.</p>
    </main>
  );
}
