"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { initializeInvite, INVALID_INVITE, passwordSetupError } from "@/lib/invite-session";

export default function InviteActivation() {
  const router = useRouter();
  const initialization = useRef<Promise<string> | null>(null);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    if (!initialization.current) {
      const hash = window.location.hash;
      // Clear bearer tokens before client initialization, to avoid the PKCE/implicit mismatch.
      // Never send the fragment to our server, analytics or logs.
      window.history.replaceState(window.history.state, "", window.location.pathname);
      initialization.current = (async () => initializeInvite(hash, createClient().auth))();
    }
    initialization.current.then(() => { if (active) setReady(true); }, () => {
      if (active) setFeedback(INVALID_INVITE);
    });
    return () => { active = false; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = passwordSetupError(password, confirmation);
    if (validation) { setFeedback(validation); return; }
    setSaving(true);
    setFeedback("");
    try {
      const client = createClient();
      const expectedId = await initialization.current;
      const { data, error: identityError } = await client.auth.getUser();
      if (identityError || !expectedId || data.user?.id !== expectedId) throw new Error(INVALID_INVITE);
      // Updates only the authenticated account. No privileged client or chosen userId.
      const { error } = await client.auth.updateUser({ password });
      if (error) throw new Error("Não foi possível salvar a senha. Use uma senha forte e tente novamente.");
      setPassword(""); setConfirmation("");
      router.replace("/auth/destination");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error && error.message === INVALID_INVITE ? INVALID_INVITE : "Não foi possível salvar a senha. Use uma senha forte e tente novamente.");
    } finally { setSaving(false); }
  }

  return <main className="auth-page">
    <div className="auth-decoration">TE</div>
    <Link className="auth-brand" href="/"><span className="brand-mark">TE</span><span>Teorema<br /><i>da Educação</i></span></Link>
    <section className="auth-card" aria-labelledby="activate-title">
      <div className="auth-card-header"><p className="eyebrow">Primeiro acesso</p><h1 id="activate-title">Bem-vindo à equipe.</h1><p>Defina sua senha pessoal para acessar o painel do Teorema.</p></div>
      {ready ? <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field"><label htmlFor="activate-password">Sua senha</label><input id="activate-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={saving} /></div>
        <div className="auth-field"><label htmlFor="activate-confirmation">Repita a senha</label><input id="activate-confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={saving} /></div>
        <button className="auth-submit" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar senha e continuar"}</button>
      </form> : !feedback ? <p role="status">Verificando seu convite...</p> : null}
      {feedback && <p className="auth-feedback" role="alert">{feedback}</p>}
      <Link className="auth-switch" href="/login?next=%2Fadmin">Já tenho uma senha</Link>
    </section>
    <p className="auth-footer">Sua senha é pessoal. Não compartilhe com outras pessoas.</p>
  </main>;
}
