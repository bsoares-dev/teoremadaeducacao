import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, FileQuestion } from "lucide-react";
import "./questionarios.css";

export const metadata: Metadata = {
  title: "Questionários gratuitos | Teorema da Educação",
  description: "O espaço de questionários gratuitos do Teorema da Educação está em desenvolvimento.",
  alternates: { canonical: "/questionarios" },
  robots: { index: false, follow: true },
};

export default function QuestionnairesPage() {
  return <main className="materials-page questionnaires-page">
    <header className="materials-header">
      <Link className="materials-brand" href="/">Teorema <em>da Educação</em></Link>
      <Link className="materials-back" href="/">Voltar ao início <ArrowUpRight className="ui-icon" size={16} aria-hidden="true" /></Link>
    </header>
    <section className="questionnaires-intro" aria-labelledby="questionnaires-title">
      <p className="eyebrow">Pratique com propósito</p>
      <h1 id="questionnaires-title">Questionários<br /><em>gratuitos.</em></h1>
      <p>Um novo espaço para exercitar seus conhecimentos e fortalecer sua preparação.</p>
    </section>
    <section className="questionnaires-preview" aria-labelledby="questionnaires-status">
      <div className="questionnaires-icon" aria-hidden="true"><FileQuestion size={36} strokeWidth={1.25} /></div>
      <div>
        <p className="eyebrow">Em desenvolvimento</p>
        <h2 id="questionnaires-status">Estamos preparando<br />seu próximo desafio.</h2>
        <p>Os questionários ainda não estão disponíveis. Assim que esta área estiver pronta, você poderá acessar as atividades gratuitas por aqui.</p>
        <div className="questionnaires-actions">
          <Link className="questionnaires-primary" href="/materiais">Explorar materiais <ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link href="/">Voltar ao Teorema</Link>
        </div>
      </div>
    </section>
    <footer className="materials-footer questionnaires-footer"><span>© 2026 Teorema da Educação</span><span>Aprender transforma.</span></footer>
  </main>;
}
