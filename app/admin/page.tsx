"use client";

import { FormEvent, useEffect, useState } from "react";

type Registration = { id: string; name: string; email: string; phone: string; cpf: string; createdAt: string };

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadRegistrations() {
    const response = await fetch("/api/admin/registrations");
    if (!response.ok) return;
    const data = await response.json();
    setRegistrations(data.registrations || []);
    setAuthenticated(true);
  }

  useEffect(() => { void loadRegistrations(); }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.error || "Não foi possível entrar.");
      setLoading(false);
      return;
    }
    setEmail("");
    setPassword("");
    await loadRegistrations();
    setLoading(false);
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setRegistrations([]);
  }

  if (!authenticated) return <main className="admin-shell"><section className="admin-login"><p className="eyebrow">Teorema da Educação</p><h1>Painel administrativo</h1><p>Acesse os cadastros recebidos pelo site.</p><form onSubmit={handleLogin}><label htmlFor="admin-email">E-mail administrativo</label><input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /><label htmlFor="admin-password">Senha administrativa</label><input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button type="submit" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button></form>{message && <p className="admin-error" role="alert">{message}</p>}</section></main>;

  return <main className="admin-shell"><section className="admin-panel"><div className="admin-header"><div><p className="eyebrow">Teorema da Educação</p><h1>Cadastros</h1><p>Dados pessoais protegidos e exibidos com CPF e telefone mascarados.</p></div><button className="admin-logout" onClick={handleLogout}>Sair</button></div><div className="admin-table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>CPF</th><th>Data</th></tr></thead><tbody>{registrations.map((registration) => <tr key={registration.id}><td>{registration.name}</td><td>{registration.email}</td><td>{registration.phone}</td><td>{registration.cpf}</td><td>{new Date(registration.createdAt).toLocaleDateString("pt-BR")}</td></tr>)}</tbody></table>{registrations.length === 0 && <p className="admin-empty">Nenhum cadastro encontrado.</p>}</div></section></main>;
}
