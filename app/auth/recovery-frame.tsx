import Link from "next/link";
import type { ReactNode } from "react";

export default function RecoveryFrame({ title, description, children, headingId }: {
  title: string; description: string; children: ReactNode; headingId: string;
}) {
  return <main className="auth-page">
    <div className="auth-decoration" aria-hidden="true">TE</div>
    <Link className="auth-brand" href="/"><span className="brand-mark">TE</span><span>Teorema<br /><i>da Educação</i></span></Link>
    <section className="auth-card" aria-labelledby={headingId}>
      <div className="auth-card-header"><p className="eyebrow">Área do aluno</p><h1 id={headingId}>{title}</h1><p>{description}</p></div>
      {children}
    </section>
    <p className="auth-footer">Sua senha é pessoal. Não compartilhe com outras pessoas.</p>
  </main>;
}
