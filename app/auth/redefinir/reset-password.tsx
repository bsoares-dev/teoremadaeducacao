"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { INVALID_RECOVERY, RECOVERY_PASSWORD_ERROR, initializePasswordRecovery, recoveryLoginHref, saveRecoveredPassword } from "@/lib/password-recovery";
import { createPasswordRecoveryClient } from "@/utils/supabase/recovery";
import RecoveryFrame from "../recovery-frame";

export default function ResetPassword() {
  const initialization = useRef<Promise<string> | null>(null);
  const client = useRef<ReturnType<typeof createPasswordRecoveryClient> | null>(null);
  const submitting = useRef(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [loginHref, setLoginHref] = useState("/login");
  const [successHref, setSuccessHref] = useState("/login?password=updated");
  const [recoverHref, setRecoverHref] = useState("/auth/recuperar");

  useEffect(() => {
    let active = true;
    if (!initialization.current) {
      const hash = window.location.hash, search = window.location.search;
      const next = new URLSearchParams(search).get("next");
      const destination = recoveryLoginHref(next);
      setLoginHref(destination); setSuccessHref(recoveryLoginHref(next, true));
      const safeSearch = new URL(destination, window.location.origin).search;
      setRecoverHref("/auth/recuperar" + safeSearch);
      // Remove bearer/OTP credentials before creating the isolated client,
      // authenticated calls or navigation. Never put tokens in app state/logs.
      window.history.replaceState(window.history.state, "", window.location.pathname + safeSearch);
      initialization.current = (async () => {
        client.current = createPasswordRecoveryClient();
        return initializePasswordRecovery(hash, search, client.current.auth);
      })();
    }
    initialization.current.then(() => { if (active) setReady(true); }, () => {
      if (active) setFeedback(INVALID_RECOVERY);
    });
    return () => { active = false; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !ready || saved) return;
    submitting.current = true; setSaving(true); setFeedback("");
    try {
      const expectedId = await initialization.current;
      if (!expectedId || !client.current) throw new Error(INVALID_RECOVERY);
      const result = await saveRecoveredPassword(expectedId, password, confirmation, client.current.auth);
      setPassword(""); setConfirmation(""); setSaved(true); setReady(false);
      if (!result.signedOut) setFeedback("Sua senha já foi alterada, mas não foi possível encerrar todas as sessões. Entre novamente com a nova senha.");
    } catch (error) {
      const message = error instanceof Error ? error.message : RECOVERY_PASSWORD_ERROR;
      const known = [INVALID_RECOVERY, RECOVERY_PASSWORD_ERROR, "Use uma senha com 8 a 128 caracteres.", "As senhas precisam ser iguais."];
      setFeedback(known.includes(message) ? message : RECOVERY_PASSWORD_ERROR);
      if (message === INVALID_RECOVERY) setReady(false);
    } finally { submitting.current = false; setSaving(false); }
  }

  return <RecoveryFrame headingId="reset-title" title={saved ? "Seu acesso está renovado." : "Crie sua nova senha."} description={saved ? "Senha alterada com sucesso. Entre novamente usando sua nova senha." : "Escolha uma senha com pelo menos 8 caracteres e confirme abaixo."}>
    {ready ? <form className="auth-form" onSubmit={handleSubmit} aria-busy={saving}>
      <div className="auth-field"><label htmlFor="reset-password">Nova senha</label><input id="reset-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={saving} /></div>
      <div className="auth-field"><label htmlFor="reset-confirmation">Confirme a nova senha</label><input id="reset-confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={saving} /></div>
      <button className="auth-submit" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar nova senha"}</button>
    </form> : !feedback && !saved ? <p className="auth-recovery-status" role="status">Verificando seu link de recuperação...</p> : null}
    {feedback && <p className="auth-feedback" role="alert">{feedback}</p>}
    {saved ? <Link className="auth-switch" href={successHref}>Entrar com a nova senha</Link> : <>
      {!ready && feedback && <Link className="auth-switch" href={recoverHref}>Solicitar novo link</Link>}
      <Link className="auth-switch" href={loginHref}>Voltar para entrar</Link>
    </>}
  </RecoveryFrame>;
}
