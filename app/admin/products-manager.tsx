"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Upload } from "tus-js-client";
import { uploadSchema } from "@/lib/uploads";

type Product = { id: string; name: string; description: string; price: number; image_url: string; publication_status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED"; revision: number };
type Version = { id: string; version: number; version_label: string; size_bytes: number; validation_status: string; is_current: boolean; created_at: string };
type Pending = { id: string; kind: string; state: string; original_name: string; rejection_reason: string | null };
type Detail = { product: Product; files: Version[]; uploads: Pending[] };
type Ticket = { uploadId: string; bucket: string; path: string; token: string; endpoint: string };
const blank = { name: "", description: "", price: "" };
const labels = { DRAFT: "Rascunho", PUBLISHED: "Publicado", UNPUBLISHED: "Despublicado", ARCHIVED: "Arquivado" };
const fileLabels: Record<string, string> = { UPLOADING: "Pendente", VALIDATED: "Validado", REJECTED: "Rejeitado" };

export default function ProductsManager() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null), [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState(blank), [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"PDF" | "COVER">("PDF"), [versionLabel, setVersionLabel] = useState("");
  const [progress, setProgress] = useState(0), [phase, setPhase] = useState("");
  const draftId = useRef<string | null>(null), uploadId = useRef<string | null>(null), activeUpload = useRef<Upload | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; void activeUpload.current?.abort(); }; }, []);

  const api = useCallback(async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(path, { method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    if (response.status === 401) { router.replace("/login?next=/admin"); throw new Error("Sessão encerrada."); }
    if (response.status === 403) { router.replace("/perfil"); throw new Error("Acesso negado."); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível concluir.");
    return result;
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void api<{ items: Product[]; total: number }>(`/api/admin/products?page=${page}`, undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setProducts(result.items); setTotal(result.total); } })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Falha ao consultar produtos."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, refresh, api]);

  async function open(id: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<Detail>(`/api/admin/products/${id}`);
      setDetail(result); setSelected(id); setFile(null); setProgress(0); uploadId.current = null;
      setForm({ name: result.product.name, description: result.product.description || "", price: String(result.product.price) });
    } catch (err) { report(err); } finally { setBusy(false); }
  }
  function report(err: unknown) { if (mounted.current) setError(err instanceof Error ? err.message : "Falha de conexão. Consulte o estado antes de repetir."); }
  async function reloadDetail(id: string) { const result = await api<Detail>(`/api/admin/products/${id}`); setDetail(result); setRefresh(v => v + 1); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const id = selected || (draftId.current ||= crypto.randomUUID());
      const result = await api<{ product: Product }>("/api/admin/products", { ...form, id, revision: detail?.product.revision || 0 });
      setSelected(result.product.id); await reloadDetail(id); draftId.current = null;
      setNotice("Dados salvos. O produto só será vendido depois de validar PDF e capa e clicar em Publicar.");
    } catch (err) { report(err); } finally { setBusy(false); }
  }

  async function changeState(state: "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED") {
    if (!detail || busy) return;
    const explanation = state === "ARCHIVED" ? "Arquivar impede novas vendas e novas edições deste produto. Histórico e acessos existentes serão preservados. Confirmar?"
      : state === "UNPUBLISHED" ? "Despublicar impede novas compras, mas mantém os acessos já liberados. Confirmar?" : "Publicar disponibiliza este material no catálogo. Confirmar?";
    if (!window.confirm(explanation)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/api/admin/products/${detail.product.id}/state`, { state, revision: detail.product.revision, operationId: crypto.randomUUID() });
      await reloadDetail(detail.product.id); setNotice(`Produto ${labels[state].toLowerCase()}.`);
    } catch (err) { report(err); } finally { setBusy(false); }
  }

  async function finalize(id: string, reservedId: string) {
    const result = await api<Detail>(`/api/admin/products/${id}/uploads/${reservedId}`, { action: "finalize" });
    setDetail(result); setRefresh(v => v + 1);
  }
  async function sendFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file || !detail || busy) return;
    setBusy(true); setError(""); setNotice(""); setProgress(0); setPhase("Autorizando envio privado...");
    try {
      const id = uploadId.current ||= crypto.randomUUID();
      const parsed = uploadSchema.parse({ id, kind, name: file.name, size: file.size, mime: file.type, versionLabel });
      const ticket = await api<Ticket>(`/api/admin/products/${detail.product.id}/uploads`, parsed);
      const tus = await import("tus-js-client");
      setPhase("Enviando para a área privada...");
      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: ticket.endpoint, headers: { "x-signature": ticket.token }, chunkSize: 6 * 1024 * 1024,
          retryDelays: [0, 1000, 3000, 5000], uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
          storeFingerprintForResuming: false, // Do not persist upload tokens/URLs in browser storage.
          metadata: { bucketName: ticket.bucket, objectName: ticket.path, contentType: file.type, cacheControl: "0" },
          onProgress: (sent, size) => { if (mounted.current) setProgress(Math.round(sent / size * 100)); },
          onError: () => reject(new Error("Envio interrompido. Você pode tentar novamente ou validar o envio pendente se o arquivo já chegou.")),
          onSuccess: () => resolve(),
        });
        activeUpload.current = upload; upload.start();
      });
      setPhase("Validando o arquivo no servidor...");
      await finalize(detail.product.id, ticket.uploadId);
      setFile(null); uploadId.current = null; setNotice(kind === "PDF" ? "Nova versão validada. Versões anteriores e compras existentes foram preservadas." : "Capa validada e otimizada em WebP.");
    } catch (err) {
      if (err instanceof Error && err.name === "ZodError") setError("Confira formato, extensão e limite do arquivo: PDF 20 MiB; capa 5 MiB.");
      else report(err);
      if (detail) { try { await reloadDetail(detail.product.id); } catch { /* Keep actionable original error. */ } }
    } finally { activeUpload.current = null; if (mounted.current) { setBusy(false); setPhase(""); } }
  }

  async function pendingAction(id: string, action: "finalize" | "cancel") {
    if (!detail || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "finalize") await finalize(detail.product.id, id);
      else { await api(`/api/admin/products/${detail.product.id}/uploads/${id}`, { action }); await reloadDetail(detail.product.id); }
      setNotice(action === "finalize" ? "Arquivo validado." : "Envio cancelado. Limpeza dos temporários poderá ser feita após 48 horas.");
    } catch (err) { report(err); } finally { setBusy(false); }
  }
  async function cleanup() {
    if (busy || !window.confirm("Remover temporários e arquivos rejeitados de envios com mais de 48 horas? PDFs e capas validados serão preservados.")) return;
    setBusy(true); setError("");
    try { const result = await api<{ message: string }>("/api/admin/products/cleanup", { confirm: true }); setNotice(result.message); if (selected) await reloadDetail(selected); }
    catch (err) { report(err); } finally { setBusy(false); }
  }
  const archived = detail?.product.publication_status === "ARCHIVED";
  const current = detail?.files.find(v => v.is_current);

  return <section className="catalog-manager" aria-label="Gestão de produtos">
    <div className="catalog-toolbar"><button disabled={busy} onClick={() => { setSelected(null); setDetail(null); setForm(blank); setFile(null); draftId.current = null; uploadId.current = null; }}>Novo material</button>
      <button disabled={busy} onClick={() => setRefresh(v => v + 1)}>Atualizar lista</button>
      <button disabled={busy} onClick={cleanup}>Limpar envios expirados</button></div>
    {error ? <p className="account-notice error" role="alert">{error}</p> : null}
    {notice ? <p className="dashboard-message" role="status">{notice}</p> : null}
    <div className="catalog-editor">
      <div className="catalog-editor-heading"><div><p className="eyebrow">{detail ? labels[detail.product.publication_status] : "Novo rascunho"}</p><h3>{detail ? "Editar material" : "Prepare seu próximo material."}</h3></div>
        {detail?.product.image_url ? <img src={detail.product.image_url} width={80} height={80} alt={`Capa de ${detail.product.name}`} referrerPolicy="no-referrer" /> : null}</div>
      <form className="product-form" onSubmit={save}>
        <fieldset disabled={busy || archived}>
          <label>Nome do material<input required minLength={2} maxLength={120} value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} /></label>
          <label>Preço (R$)<input required type="number" min="0.01" max="1000000" step="0.01" value={form.price} onChange={e => setForm(v => ({ ...v, price: e.target.value }))} /></label>
          <label className="product-form-wide">Descrição<textarea required minLength={10} maxLength={2000} value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} /></label>
          <button>{busy && !phase ? "Salvando..." : detail ? "Salvar alterações" : "Criar rascunho"}</button>
        </fieldset>
      </form>
      {detail ? <>
        {!archived ? <form className="material-upload" onSubmit={sendFile}>
          <fieldset disabled={busy}><legend>Arquivos do material</legend>
            <label>Tipo de envio<select value={kind} onChange={e => { setKind(e.target.value as "PDF" | "COVER"); setFile(null); uploadId.current = null; }}><option value="PDF">PDF privado · até 20 MiB</option><option value="COVER">Capa · até 5 MiB</option></select></label>
            {kind === "PDF" ? <label>Identificação da versão<input value={versionLabel} maxLength={40} placeholder="Ex.: Edição revisada — outubro" onChange={e => setVersionLabel(e.target.value)} /></label> : null}
            <label className="upload-dropzone">{file ? file.name : "Selecione o arquivo"}<input key={kind} type="file" accept={kind === "PDF" ? ".pdf,application/pdf" : ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"} onChange={e => { setFile(e.target.files?.[0] || null); uploadId.current = null; }} /></label>
            <p>PDFs estáticos, sem senha, scripts, anexos, formulários ou links externos. Atualizações substituem a versão atual para compradores autorizados, sem apagar versões anteriores.</p>
            <button disabled={!file || busy}>Enviar e validar {kind === "PDF" ? "PDF" : "capa"}</button>
          </fieldset>
          {phase ? <div className="upload-progress" role="status"><p>{phase}</p><progress max="100" value={progress} aria-label="Progresso do upload" /><span>{progress}% enviado</span></div> : null}
        </form> : <p>Material arquivado: histórico preservado e novas edições bloqueadas.</p>}
        <div className="publication-actions"><p>{current ? `PDF atual: versão ${current.version_label}` : "PDF validado ainda não disponível."}</p>
          {!archived ? <><button disabled={busy || !current || !detail.product.image_url || detail.product.publication_status === "PUBLISHED"} onClick={() => changeState("PUBLISHED")}>Publicar</button>
            <button disabled={busy || detail.product.publication_status !== "PUBLISHED"} onClick={() => changeState("UNPUBLISHED")}>Despublicar</button>
            <button disabled={busy} onClick={() => changeState("ARCHIVED")}>Arquivar</button></> : null}</div>
        <details className="version-history" open><summary>Histórico de versões · {detail.files.length}</summary>
          {detail.files.length ? detail.files.map(v => <div key={v.id}><strong>v{v.version} · {v.version_label} {v.is_current ? "· atual" : ""}</strong><span>{fileLabels[v.validation_status]} · {(v.size_bytes / 1024 / 1024).toFixed(2)} MiB · {new Date(v.created_at).toLocaleDateString("pt-BR")}</span></div>) : <p>Nenhum PDF enviado.</p>}
        </details>
        {detail.uploads.some(u => u.state !== "VALIDATED") ? <details className="version-history" open><summary>Envios pendentes ou rejeitados</summary>
          {detail.uploads.filter(u => u.state !== "VALIDATED").map(u => <div key={u.id}><strong>{u.original_name}</strong><span>{fileLabels[u.state]}{u.rejection_reason ? ` · ${u.rejection_reason}` : ""}</span>
            {u.state === "UPLOADING" && !archived ? <div className="catalog-toolbar"><button disabled={busy} onClick={() => pendingAction(u.id, "finalize")}>Tentar validar novamente</button><button disabled={busy} onClick={() => pendingAction(u.id, "cancel")}>Cancelar envio</button></div> : null}</div>)}
        </details> : null}
      </> : <p className="catalog-hint">Salve o rascunho para adicionar a capa e o PDF privado.</p>}
    </div>
    <h3 className="catalog-list-title">Seus materiais</h3>
    {loading ? <p role="status">Carregando materiais...</p> : <div className="product-list">{products.map(p => <article key={p.id} className={selected === p.id ? "selected" : ""}>
      {p.image_url ? <img src={p.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="cover-placeholder" aria-hidden="true">TE</div>}
      <div><p className="eyebrow">{labels[p.publication_status]} · {Number(p.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p><h3>{p.name}</h3><p>{p.description}</p><button disabled={busy} onClick={() => open(p.id)}>Gerenciar material</button></div>
    </article>)}</div>}
    {!loading && !total && !error ? <p>Nenhum material cadastrado. Comece por um rascunho.</p> : null}
    {total ? <nav className="pagination" aria-label="Páginas de materiais"><button disabled={busy || loading || page === 1} onClick={() => setPage(v => v - 1)}>Anterior</button><span>{page} de {Math.max(1, Math.ceil(total / 20))} · {total} materiais</span><button disabled={busy || loading || page * 20 >= total} onClick={() => setPage(v => v + 1)}>Próxima</button></nav> : null}
  </section>;
}
