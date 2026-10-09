import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BookOpen, LayoutDashboard, MessageCircle, ReceiptText, ShieldCheck, ShoppingCart, Store } from "lucide-react";
import { LogoutButton } from "./session-controls";
import "./student-area.css";

type StudentSection = "overview" | "library" | "orders" | "cart";
const sections = [
  { id: "overview", href: "/perfil", label: "Visão geral", icon: LayoutDashboard },
  { id: "library", href: "/meus-materiais", label: "Meus materiais", icon: BookOpen },
  { id: "orders", href: "/pedidos", label: "Meus pedidos", icon: ReceiptText },
  { id: "cart", href: "/carrinho", label: "Carrinho", icon: ShoppingCart },
] as const;

export const studentSupportUrl = `https://wa.me/5548935011911?text=${encodeURIComponent("Olá! Estou na área do aluno do Teorema da Educação e gostaria de ajuda.")}`;

export default function StudentShell({ children, active, email, commerceEnabled = true }: {
  children: ReactNode; active: StudentSection; email?: string; commerceEnabled?: boolean;
}) {
  return <div className="student-area">
    <a className="student-skip" href="#student-content">Pular para o conteúdo</a>
    <aside className="student-sidebar">
      <Link className="student-brand" href="/" aria-label="Teorema da Educação — início">
        <Image src="/assets/te-prof-anderson.png" alt="" width={64} height={48} />
        <span>Teorema<i>da Educação</i></span>
      </Link>
      <p className="student-nav-label">Seu espaço de aprendizagem</p>
      <nav className="student-nav" aria-label="Navegação do aluno">
        {sections.filter(section => commerceEnabled || !["library", "orders"].includes(section.id)).map(section => {
          const Icon = section.icon;
          return <Link key={section.id} href={section.href} className={active === section.id ? "is-active" : undefined} aria-current={active === section.id ? "page" : undefined}>
            <Icon size={19} strokeWidth={1.6} aria-hidden="true" /><span>{section.label}</span>
          </Link>;
        })}
        <Link href="/materiais"><Store size={19} strokeWidth={1.6} aria-hidden="true" /><span>Explorar catálogo</span><ArrowUpRight className="student-nav-arrow" size={14} aria-hidden="true" /></Link>
      </nav>
      <div className="student-sidebar-bottom">
        <a className="student-support" href={studentSupportUrl} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={20} strokeWidth={1.5} aria-hidden="true" />
          <span>Conte com o Teorema<small>Fale com nossa equipe</small></span><ArrowUpRight size={16} aria-hidden="true" />
        </a>
        <div className="student-signout"><LogoutButton /></div>
      </div>
    </aside>
    <div className="student-body">
      <header className="student-topbar">
        <span className="student-topbar-label">Área do aluno</span>
        <div className="student-identity"><span className="student-avatar" aria-hidden="true">{email?.charAt(0).toUpperCase() || "T"}</span><span className="student-email">{email || "Minha conta"}</span><ShieldCheck size={17} aria-label="Sessão autenticada" /></div>
      </header>
      <main className="student-main" id="student-content" tabIndex={-1}><div className="student-content">{children}</div></main>
      <footer className="student-footer"><span>Teorema da Educação</span><span>Conhecimento que abre caminhos.</span><a href={studentSupportUrl} target="_blank" rel="noopener noreferrer">Precisa de ajuda? <MessageCircle size={14} aria-hidden="true" /></a><Link href="/">Voltar ao site <ArrowUpRight size={13} aria-hidden="true" /></Link></footer>
    </div>
  </div>;
}
