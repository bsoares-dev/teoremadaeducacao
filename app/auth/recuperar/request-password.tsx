"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { RECOVERY_SENT, RECOVERY_UNAVAILABLE, RECOVERY_WAIT, recoveryLoginHref, requestPasswordRecovery } from "@/lib/password-recovery";
import { createPasswordRecoveryClient } from "@/utils/supabase/recovery";
import RecoveryFrame from "../recovery-frame";

export default function RequestPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [countdown, setCountdown] = useState(0);
  const client = useRef<ReturnType<typeof createPasswordRecoveryClient> | null>(null);
  const submitting = useRef(false);
  const next = useRef<string | null>(null);
  const [loginHref, setLoginHref] = useState("/login");

  useEffect(() => {
    next.current = new URLSearchParams(window.location.search).get("next");
    setLoginHref(recoveryLoginHref(next.current));
  }, []);
  useEffect(() => {
    if (!countdown) return;
    const timeout = window.setTimeout(() => setCountdown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timeout);
  }, [countdown]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || countdown) return;
    submitting.current = true; setLoading(true); setFeedback("");
    try {
      client.current ??= createPasswordRecoveryClient();
      const message = await requestPasswordRecovery(email, next.current, client.current.auth);
      setFeedback(message); setCountdown(60);
    } catch (error) {
      const message = error instanceof Error ? error.message : RECOVERY_UNAVAILABLE;
      setFeedback([RECOVERY_WAIT, "Informe um e-mail válido."].includes(message) ? message : RECOVERY_UNAVAILABLE);
      if (message === RECOVERY_WAIT) setCountdown(60);
    } finally { submitting.current = false; setLoading(false); }
  }

  return <RecoveryFrame headingId="recover-title" title="Vamos recuperar seu acesso." description="Informe o e-mail da sua conta. Você receberá um link seguro para criar uma nova senha.">
    <form className="auth-form" onSubmit={handleSubmit} aria-busy={loading}>
      <div className="auth-field"><label htmlFor="recover-email">E-mail da sua conta</label><input id="recover-email" type="email" autoComplete="email" inputMode="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} disabled={loading} /></div>
      <button className="auth-submit" type="submit" disabled={loading || countdown > 0}>{loading ? "Enviando..." : countdown ? `Reenviar em ${countdown}s` : "Enviar link de recuperação"}<ArrowUpRight className="ui-icon" size={18} aria-hidden="true" /></button>
    </form>
    {feedback && <p className={"auth-feedback" + (feedback === RECOVERY_SENT ? " success" : "")} role={feedback === RECOVERY_SENT ? "status" : "alert"}>{feedback}</p>}
    <Link className="auth-switch" href={loginHref}>Voltar para entrar</Link>
  </RecoveryFrame>;
}
