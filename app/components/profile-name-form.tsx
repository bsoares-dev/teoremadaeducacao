"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { profileNameUpdateSchema, profileNameResultSchema } from "@/lib/profile-name-schema";

export default function ProfileNameForm({ initialName }: { initialName: string | null }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialName || "");
  const [savedName, setSavedName] = useState(initialName || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setFeedback("");
    setFailed(false);
    const input = profileNameUpdateSchema.safeParse({ fullName });
    if (!input.success) {
      setFailed(true);
      setFeedback(input.error.issues[0]?.message || "Confira seu nome.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data),
      });
      if (response.status === 401) {
        router.replace("/login?next=%2Fperfil");
        return;
      }
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "Não foi possível salvar seu nome agora.";
        setFailed(true);
        setFeedback(message);
        return;
      }
      const parsed = profileNameResultSchema.safeParse(result);
      if (!parsed.success) {
        setFailed(true);
        setFeedback("Não foi possível confirmar a atualização. Atualize a página antes de tentar novamente.");
        return;
      }
      setFullName(parsed.data.fullName);
      setSavedName(parsed.data.fullName);
      setFeedback("Nome salvo com sucesso.");
      router.refresh();
    } catch {
      setFailed(true);
      setFeedback("Não foi possível salvar seu nome agora. Atualize a página para conferir seus dados.");
    } finally { setIsSubmitting(false); }
  }

  return <form className="student-name-form" onSubmit={saveName} aria-busy={isSubmitting}>
    <div className="auth-field">
      <label htmlFor="profile-full-name">Nome completo</label>
      <input id="profile-full-name" name="fullName" type="text" autoComplete="name" minLength={2} maxLength={150} required
        value={fullName} onChange={event => { setFullName(event.target.value); setFeedback(""); }} disabled={isSubmitting}
        aria-describedby="profile-name-help" />
    </div>
    <p className="student-name-help" id="profile-name-help">Use seu nome completo para identificar sua conta e seus materiais.</p>
    <button className="account-button secondary" type="submit" disabled={isSubmitting || fullName === savedName}>{isSubmitting ? "Salvando..." : "Salvar nome"}</button>
    {feedback && <p className={failed ? "auth-feedback" : "auth-feedback success"} role={failed ? "alert" : "status"}>{feedback}</p>}
  </form>;
}
