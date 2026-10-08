import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { cartPreviewEnabled } from "@/lib/cart-contract";
import { SessionGuard } from "@/app/components/session-controls";
import Library from "./library";
import "./library.css";

export const metadata: Metadata = { title: "Meus materiais | Teorema da Educação", robots: { index: false, follow: false } };
export default async function LibraryPage() {
  if (!cartPreviewEnabled(process.env)) notFound();
  const { user } = await requireUser("/meus-materiais");
  return <SessionGuard userId={user.id}><main className="library-page">
    <header><Link href="/">Teorema <em>da Educação</em></Link><nav aria-label="Área do aluno"><Link href="/perfil">Meu perfil</Link><Link href="/pedidos">Meus pedidos</Link></nav></header>
    <p className="eyebrow">Seu próximo capítulo</p><h1>Meus <em>materiais.</em></h1>
    <p className="library-intro">Um espaço para continuar aprendendo. Consulte suas compras e baixe os materiais liberados pela equipe.</p>
    <Library />
    <footer className="library-policy"><h2>Seu material, sempre atualizado.</h2><p>Após a liberação, o download não tem prazo automático. Atualizações do mesmo material estão incluídas; o botão entrega a versão atual.</p><p>O link de download é temporário. Se expirar, clique em baixar novamente. Revogar o acesso impede novas autorizações, mas não recolhe arquivos já baixados e um link emitido pode continuar funcionando até expirar. Não compartilhe seu link.</p><Link href="/materiais">Conhecer outros materiais</Link></footer>
  </main></SessionGuard>;
}
