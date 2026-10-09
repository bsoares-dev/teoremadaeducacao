import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpen, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { cartPreviewEnabled } from "@/lib/cart-contract";
import { SessionGuard } from "@/app/components/session-controls";
import StudentShell from "@/app/components/student-shell";
import Library from "./library";
import { libraryAuth, LibraryError, readLibrary } from "@/lib/library";
import { consumeRequest, RequestLimitError } from "@/lib/request-limits";
import LibraryLoading from "./library-loading";
import "./library.css";

export const metadata: Metadata = { title: "Meus materiais | Teorema da Educação", robots: { index: false, follow: false } };

async function InitialLibrary() {
  try {
    // Reuses the same request's verified Auth. DTO contains no Storage keys,
    // bearer download links or other accounts' records. No cross-request cache.
    const { user, db } = await libraryAuth();
    await consumeRequest(db, user.id, "LIBRARY_READ");
    const initialData = await readLibrary(db, user.id, 1);
    return <Library key={user.id} initialData={initialData} />;
  } catch (cause) {
    const message = cause instanceof LibraryError || cause instanceof RequestLimitError
      ? cause.message : "Não foi possível consultar os materiais agora. Tente novamente.";
    return <Library initialError={message} />;
  }
}

export default async function LibraryPage() {
  if (!cartPreviewEnabled(process.env)) notFound();
  const { user } = await requireUser("/meus-materiais");
  return <SessionGuard userId={user.id}><StudentShell active="library" email={user.email}><div className="student-library">
    <div className="student-page-heading"><p className="eyebrow">Sua biblioteca pessoal</p><h1>Conhecimento <em>sempre por perto.</em></h1>
    <p>Seus materiais, prontos para acompanhar você. Consulte os acessos e baixe os PDFs liberados pela equipe.</p></div>
    <Suspense fallback={<LibraryLoading />}><InitialLibrary key={user.id} /></Suspense>
    <aside className="library-policy"><ShieldCheck size={24} strokeWidth={1.5} aria-hidden="true" /><div><h2>Seu material, sempre atualizado.</h2><p>Após a liberação, o download não tem prazo automático. Atualizações do mesmo material estão incluídas; o botão entrega a versão atual.</p><details><summary>Sobre a segurança dos downloads</summary><p>O link de download é temporário. Se expirar, clique em baixar novamente. Revogar o acesso impede novas autorizações, mas não recolhe arquivos já baixados e um link emitido pode continuar funcionando até expirar. Não compartilhe seu link.</p></details><Link href="/materiais"><BookOpen size={15} aria-hidden="true" />Conhecer outros materiais</Link></div></aside>
  </div></StudentShell></SessionGuard>;
}
