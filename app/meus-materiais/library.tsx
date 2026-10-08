"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { libraryPage, libraryLabels, validateDownloadUrl, type LibraryPage } from "@/lib/library-contract";

export default function Library() {
  const router = useRouter();
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [data, setData] = useState<LibraryPage | null>(null), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState<string | null>(null);
  const working = useRef(false), mounted = useRef(false), downloadController = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; downloadController.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setData(null); setError("");
    void fetch(`/api/library?page=${page}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (response.status === 401) { router.replace("/login?next=/meus-materiais"); return; }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar sua biblioteca.");
      const parsed = libraryPage.safeParse(result);
      if (!parsed.success) throw new Error("Não foi possível consultar sua biblioteca. Atualize e tente novamente.");
      if (!controller.signal.aborted) setData(parsed.data);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha de conexão."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, revision, router]);

  async function download(productId: string) {
    if (working.current) return;
    working.current = true; setBusy(productId); setError(""); setNotice("");
    const controller = new AbortController(); downloadController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/library/download", { method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) });
      if (response.status === 401) { router.replace("/login?next=/meus-materiais"); return; }
      const ticket = await response.json();
      if (!response.ok) throw new Error(ticket.error || "Download indisponível.");
      const url = validateDownloadUrl(ticket.url, process.env.NEXT_PUBLIC_SUPABASE_URL!, productId);
      if (!Number.isFinite(Date.parse(ticket.expiresAt)) || Date.parse(ticket.expiresAt) <= Date.now()) throw new Error("O link expirou. Clique em baixar novamente.");
      if (!mounted.current) return;
      // Short-lived bearer URL stays only in this handler, never in application storage.
      const anchor = document.createElement("a");
      anchor.href = url; anchor.rel = "noopener noreferrer"; anchor.referrerPolicy = "no-referrer";
      anchor.download = ticket.filename; document.body.append(anchor); anchor.click(); anchor.remove();
      setNotice("Download solicitado. Se ele não começar ou o link expirar, clique em baixar novamente.");
    } catch (cause) {
      if (mounted.current) { setData(null); setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Não foi possível preparar o download. Atualize e tente novamente."); }
    } finally { clearTimeout(timeout); working.current = false; if (mounted.current) setBusy(null); }
  }

  return <section className="library" aria-label="Sua biblioteca" aria-busy={loading}>
    <div className="library-toolbar"><button className="account-button secondary" disabled={!!busy} onClick={() => { setRevision(v => v + 1); setNotice(""); }}>Atualizar biblioteca</button><Link href="/pedidos">Acompanhar pedidos</Link></div>
    {error && <p className="account-notice error" role="alert">{error}</p>}{notice && <p className="account-notice success" role="status">{notice}</p>}
    {loading ? <p role="status">Consultando seus materiais…</p> : data && <>
      {!data.items.length && <div className="library-empty"><p className="eyebrow">Novas possibilidades</p><h2>{data.total ? "Nenhum material nesta página." : "Sua biblioteca começa com uma escolha."}</h2><p>Os materiais dos seus pedidos aparecerão aqui. O acesso é liberado depois da conferência da compra pela equipe.</p><Link className="account-button" href="/materiais">Conhecer materiais</Link></div>}
      <div className="library-grid">{data.items.map(item => <article key={item.productId}>
        {item.imageUrl ? <div className="library-image"><Image src={item.imageUrl} alt={`Capa de ${item.name}`} fill sizes="(max-width: 600px) 100vw, 33vw" /></div> : <div className="library-cover" aria-hidden="true"><span>TE</span><small>Conhecimento com propósito</small></div>}
        <div className="library-card"><p className={`library-state ${item.state.toLowerCase()}`}>{libraryLabels[item.state]}</p><h2>{item.name}</h2>
          <p>{item.state === "PENDENTE" ? "A equipe ainda precisa confirmar a compra para liberar seu material." : item.state === "REVOGADO" ? "Este material não possui autorização ativa. Fale com a equipe para conferir seu acesso." : !item.available ? "Você possui acesso, mas o arquivo está temporariamente indisponível. Atualize ou fale com a equipe." : "Pronto para o seu próximo passo."}</p>
          {item.state === "ATIVO" && item.version && <p className="library-meta">Versão {item.versionLabel} · {((item.sizeBytes || 0) / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MiB</p>}
          <p className="library-meta">{item.state === "ATIVO" ? "Liberado em" : "Registro em"} {new Date(item.updatedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
          <div className="library-card-actions">{item.state === "ATIVO" && item.available && <button className="account-button" disabled={!!busy || loading} onClick={() => download(item.productId)} aria-label={`Baixar PDF: ${item.name}`}>{busy === item.productId ? "Preparando…" : "Baixar PDF"}</button>}<Link href={`/pedidos/${item.orderId}`}>Ver pedido {item.code}</Link></div>
        </div></article>)}</div>
      {data.total > 0 && <nav className="library-pagination" aria-label="Páginas de materiais"><button disabled={page === 1 || !!busy || loading} onClick={() => setPage(v => v - 1)}>Anterior</button><span>Página {page} de {Math.ceil(data.total / 20)}</span><button disabled={page * 20 >= data.total || !!busy || loading} onClick={() => setPage(v => v + 1)}>Próxima</button></nav>}
    </>}
  </section>;
}
