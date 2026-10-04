import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-policy";
import { SessionGuard, LogoutButton, RetryButton } from "@/app/components/session-controls";

export default async function PerfilPage() {
  const { user, supabase } = await requireUser("/perfil");
  const { data: profile, error } = await supabase.from("profiles")
    .select("email, cpf, phone, created_at").eq("id", user.id).maybeSingle();

  return <SessionGuard userId={user.id}><main className="profile-page"><section className="profile-card">
    <p className="eyebrow">Área do aluno</p>
    <h1>Olá, <em>{user.email}</em></h1>
    <p className="profile-intro">Seu acesso está ativo.</p>
    {error || !profile ? <div className="account-notice" role="alert">
      <p>{error ? "Não foi possível consultar seus dados agora." : "Sua conta está ativa, mas o perfil ainda precisa ser sincronizado pela equipe."}</p>
      <RetryButton />
    </div> : <dl className="profile-data">
      <div><dt>E-mail</dt><dd>{user.email}</dd></div>
      <div><dt>CPF</dt><dd>{profile.cpf || "Não informado"}</dd></div>
      <div><dt>Telefone</dt><dd>{profile.phone || "Não informado"}</dd></div>
      <div><dt>Cadastro</dt><dd>{new Date(profile.created_at || user.created_at).toLocaleDateString("pt-BR")}</dd></div>
    </dl>}
    <div className="profile-actions">
      <Link className="account-button" href="/carrinho">Ir para o carrinho ↗</Link>
      {isAdmin(user) && <Link className="account-button" href="/admin">Administração ↗</Link>}
      <Link className="account-button secondary" href="/">Voltar ao site</Link>
      <LogoutButton />
    </div>
  </section></main></SessionGuard>;
}
