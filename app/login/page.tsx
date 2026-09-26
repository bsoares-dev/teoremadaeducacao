"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFeedback("");
    setSuccess(false);
    try {
      const supabase = createClient();
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
      if (result.error) throw result.error;
      setSuccess(true);
      setFeedback(mode === "login" ? "Login realizado com sucesso." : "Acesso criado. Verifique seu e-mail para confirmar a conta.");
      if (mode === "login") setPassword("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-page"><div className="auth-decoration">TE</div><Link className="auth-brand" href="/" target="_blank" rel="noopener noreferrer"><span className="brand-mark">TE</span><span>Teorema<br /><i>da Educação</i></span></Link><section className="auth-card"><div className="auth-card-header"><p className="eyebrow">Área do aluno</p><h1>{mode === "login" ? "Que bom ter você de volta." : "Comece sua jornada."}</h1><p>{mode === "login" ? "Entre para acessar seus materiais e acompanhar sua jornada de aprendizagem." : "Crie seu acesso para acompanhar materiais e novidades do Teorema da Educação."}</p></div><form className="auth-form" onSubmit={handleSubmit}><div className="auth-field"><label htmlFor="auth-email">E-mail</label><input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div><div className="auth-field"><label htmlFor="auth-password">Senha</label><input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required /></div><button className="auth-submit" type="submit" disabled={loading}>{loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar meu acesso"}<span>↗</span></button></form>{feedback && <p className={success ? "auth-feedback success" : "auth-feedback"} role="status">{feedback}</p>}<button className="auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setFeedback(""); }}>{mode === "login" ? "Ainda não tenho acesso" : "Já tenho uma conta"}</button></section><p className="auth-footer">A educação transforma quando encontra o próximo passo.</p></main>;
}
