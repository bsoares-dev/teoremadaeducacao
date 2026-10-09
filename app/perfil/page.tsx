import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, BookOpen, MessageCircle, ReceiptText, ShieldCheck, ShoppingCart, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-policy";
import { SessionGuard, RetryButton } from "@/app/components/session-controls";
import StudentShell, { studentSupportUrl } from "@/app/components/student-shell";
import { cartPreviewEnabled } from "@/lib/cart-contract";

export const metadata: Metadata = { title: "Meu perfil | Teorema da Educação", robots: { index: false, follow: false } };

export default async function PerfilPage() {
  const { user, supabase } = await requireUser("/perfil");
  const { data: profile, error } = await supabase.from("profiles")
    .select("email, cpf, phone, created_at").eq("id", user.id).maybeSingle();

  const commerceEnabled = cartPreviewEnabled(process.env);
  return <SessionGuard userId={user.id}><StudentShell active="overview" email={user.email} commerceEnabled={commerceEnabled}>
    <section className="student-welcome">
      <p className="eyebrow">Aprender é abrir caminhos</p>
      <h1>Seu próximo capítulo<br /><em>começa com você.</em></h1>
      <p>Bom ter você por aqui. Este é o seu espaço para organizar suas escolhas e seguir aprendendo com o Teorema.</p>
      <Link className="account-button" href={commerceEnabled ? "/meus-materiais" : "/materiais"}>{commerceEnabled ? "Acessar meus materiais" : "Explorar materiais"}<ArrowRight size={16} aria-hidden="true" /></Link>
    </section>
    <section aria-labelledby="student-shortcuts-title">
      <div className="student-section-heading"><h2 id="student-shortcuts-title">Tudo no seu tempo.</h2><span>Escolha seu próximo passo</span></div>
      <div className="student-shortcuts">
        <Link className="student-shortcut" href={commerceEnabled ? "/meus-materiais" : "/materiais"}><span className="student-icon"><BookOpen size={22} strokeWidth={1.5} aria-hidden="true" /></span><h3>{commerceEnabled ? "Meus materiais" : "Conhecer materiais"}</h3><p>{commerceEnabled ? "Seus PDFs e atualizações, em um só lugar." : "Descubra conteúdos para sua jornada de estudos."}</p><ArrowUpRight size={18} aria-hidden="true" /></Link>
        <Link className="student-shortcut" href={commerceEnabled ? "/pedidos" : studentSupportUrl} {...(!commerceEnabled ? { target: "_blank", rel: "noopener noreferrer" } : {})}><span className="student-icon">{commerceEnabled ? <ReceiptText size={22} strokeWidth={1.5} aria-hidden="true" /> : <MessageCircle size={22} strokeWidth={1.5} aria-hidden="true" />}</span><h3>{commerceEnabled ? "Meus pedidos" : "Fale com a equipe"}</h3><p>{commerceEnabled ? "Acompanhe seus pedidos e a liberação de acesso." : "Tire suas dúvidas e encontre seu próximo passo."}</p><ArrowUpRight size={18} aria-hidden="true" /></Link>
        <Link className="student-shortcut" href="/carrinho"><span className="student-icon"><ShoppingCart size={22} strokeWidth={1.5} aria-hidden="true" /></span><h3>Ir para o carrinho</h3><p>Confira sua seleção e as orientações de compra.</p><ArrowUpRight size={18} aria-hidden="true" /></Link>
      </div>
    </section>
    <div className="student-details-grid">
      <section className="student-panel" aria-labelledby="student-account-title">
        <div className="student-panel-header"><UserRound size={23} strokeWidth={1.5} aria-hidden="true" /><div><h2 id="student-account-title">Minha conta</h2><p>Os dados do seu cadastro.</p></div></div>
        {error || !profile ? <div className="account-notice" role="alert"><p>{error ? "Não foi possível consultar seus dados agora." : "Sua conta está ativa, mas o perfil ainda precisa ser sincronizado pela equipe."}</p><RetryButton /></div> :
          <dl className="student-profile-data">
            <div className="wide"><dt>E-mail</dt><dd>{user.email}</dd></div>
            <div><dt>CPF</dt><dd>{profile.cpf || "Não informado"}</dd></div>
            <div><dt>Telefone</dt><dd>{profile.phone || "Não informado"}</dd></div>
            <div className="wide"><dt>No Teorema desde</dt><dd>{new Date(profile.created_at || user.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</dd></div>
          </dl>}
      </section>
      <section className="student-panel student-help"><ShieldCheck size={25} strokeWidth={1.5} aria-hidden="true" /><h2>Você não precisa<br />seguir sozinho.</h2><p>Dúvidas sobre um material, pedido ou seu acesso? Nossa equipe ajuda você a continuar.</p><a className="account-button secondary" href={studentSupportUrl} target="_blank" rel="noopener noreferrer">Conversar com a equipe<ArrowUpRight size={16} aria-hidden="true" /></a></section>
    </div>
    {isAdmin(user) && <Link className="student-admin-link" href="/admin">Acessar administração<ArrowUpRight size={14} aria-hidden="true" /></Link>}
  </StudentShell></SessionGuard>;
}
