"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const onlyDigits = (value: string) => value.replace(/\D/g, "");

function formatCpf(value: string) {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value: string) {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{4})$/, "$1-$2");
}

export default function CadastroScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback("");

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { cpf: onlyDigits(cpf), phone: onlyDigits(phone) } },
      });

      if (error) throw error;
      router.push("/carrinho");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível concluir seu cadastro agora.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page register-page">
      <div className="auth-decoration">TE</div>
      <Link className="auth-brand" href="/">
        <span className="brand-mark">TE</span>
        <span>Teorema<br /><i>da Educação</i></span>
      </Link>

      <section className="auth-card register-card" aria-labelledby="register-title">
        <div className="auth-card-header">
          <p className="eyebrow">Nova conta</p>
          <h1 id="register-title">Crie sua conta.</h1>
          <p>Preencha seus dados para liberar seu acesso e ir para o carrinho.</p>
        </div>

        <form className="auth-form register-form" onSubmit={handleRegister}>
          <div className="auth-field register-field-full">
            <label htmlFor="register-email">E-mail</label>
            <input id="register-email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </div>
          <div className="auth-field register-field-full">
            <label htmlFor="register-password">Senha</label>
            <input id="register-password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={6} required />
          </div>
          <div className="auth-field">
            <label htmlFor="register-cpf">CPF</label>
            <input id="register-cpf" name="cpf" inputMode="numeric" value={cpf} onChange={(event) => setCpf(formatCpf(event.target.value))} autoComplete="off" minLength={14} required />
          </div>
          <div className="auth-field">
            <label htmlFor="register-phone">Telefone</label>
            <input id="register-phone" name="phone" inputMode="tel" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} autoComplete="tel" minLength={14} required />
          </div>
          <button className="auth-submit register-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Cadastrando..." : "Cadastrar"}
            <ShoppingCart aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>
        </form>

        {feedback && <p className="auth-feedback" role="alert">{feedback}</p>}
        <Link className="auth-switch" href="/login">Já tenho uma conta</Link>
      </section>
      <p className="auth-footer">A educação transforma quando encontra o próximo passo.</p>
    </main>
  );
}
