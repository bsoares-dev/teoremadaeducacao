"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { licenseList, licenseHistory, pendingLicenseDecision, parseLicenseDecision, licenseJournalKey, pdfEventLabels,
  type AdminLicenseRow, type LicenseHistory, type PendingLicenseDecision } from "@/lib/admin-pdf-contract";

const emptyFilters = { email: "", code: "", status: "" };
const date = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }

export default function PdfLicenseManager({ actorId, onBusyChange }: { actorId: string; onBusyChange: (busy: boolean) => void }) {
  const router = useRouter(), journal = licenseJournalKey(actorId);
  const [form, setForm] = useState(emptyFilters), [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState<AdminLicenseRow[]>([]), [total, setTotal] = useState(0), [limit, setLimit] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingLicenseDecision | null>(null), [invalid, setInvalid] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null), [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<LicenseHistory | null>(null), [historyError, setHistoryError] = useState("");
  const [review, setReview] = useState<AdminLicenseRow | null>(null), [reason, setReason] = useState("");
  const working = useRef(false), mounted = useRef(false), dialog = useRef<HTMLDialogElement>(null);
  const selected = rows.find(row => row.id === selectedId);
  const blocked = busy || !ready || !!pending || invalid;
  useEffect(() => {
    mounted.current = true;
    try { setPending(parseLicenseDecision(sessionStorage.getItem(journal))); setInvalid(false); }
    catch { setInvalid(true); }
    setReady(true);
    return () => { mounted.current = false; };
  }, [journal]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => { if (review) dialog.current?.showModal(); else dialog.current?.close(); }, [review]);

  const api = useCallback(async (path: string, decision?: PendingLicenseDecision["decision"], signal?: AbortSignal): Promise<unknown> => {
    const response = await fetch(path, { method: decision ? "POST" : "GET", cache: "no-store", signal: signal || AbortSignal.timeout(20000),
      ...(decision ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(decision) } : {}) });
    if (response.status === 401) { router.replace("/login?next=/admin"); throw new RequestError("Sessão encerrada.", 401); }
    const result: unknown = await response.json();
    if (!response.ok) {
      const failure = z.object({ error: z.string() }).safeParse(result);
      throw new RequestError(failure.success ? failure.data.error : "Operação indisponível.", response.status);
    }
    return result;
  }, [router]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setRows([]); setTotal(0);
    void api(`/api/admin/pdf-licenses?${new URLSearchParams({ ...filters, page: String(page) })}`, undefined, controller.signal)
      .then(raw => { const result = licenseList.parse(raw); if (!controller.signal.aborted) { setRows(result.items); setTotal(result.total); setLimit(result.maxDownloads); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha de conexão."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, filters, page, refresh]);
  useEffect(() => {
    const controller = new AbortController(); setHistory(null); setHistoryError("");
    if (selectedId) void api(`/api/admin/pdf-licenses/${selectedId}?page=${historyPage}`, undefined, controller.signal)
      .then(raw => { const result = licenseHistory.parse(raw); if (!controller.signal.aborted) setHistory(result); })
      .catch(cause => { if (!controller.signal.aborted) setHistoryError(cause instanceof Error ? cause.message : "Histórico indisponível."); });
    return () => controller.abort();
  }, [api, selectedId, historyPage, refresh]);

  async function execute(operation: PendingLicenseDecision) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(""); setNotice("");
    try {
      sessionStorage.setItem(journal, JSON.stringify(operation)); setPending(operation);
      const ack = z.object({ id: z.uuid() }).strict().parse(await api(`/api/admin/pdf-licenses/${operation.licenseId}`, operation.decision));
      if (ack.id !== operation.licenseId) throw new Error("Resultado não confirmado. Recupere a mesma tentativa.");
      sessionStorage.removeItem(journal);
      if (mounted.current) { setPending(null); setReview(null); setRefresh(v => v + 1); setNotice("Decisão registrada. Confira o estado atual e o histórico."); }
    } catch (cause) {
      if (cause instanceof RequestError && [400, 404, 409].includes(cause.status)) {
        try { sessionStorage.removeItem(journal); if (mounted.current) setPending(null); }
        catch { if (mounted.current) setInvalid(true); }
      }
      if (mounted.current) { setReview(null); setError(cause instanceof Error ? cause.message : "Resultado não confirmado. Recupere a mesma tentativa."); }
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  function decide(event: FormEvent) {
    event.preventDefault(); if (!review || blocked || working.current) return;
    const operation = pendingLicenseDecision.safeParse({ licenseId: review.id, decision: { state: review.status === "active" ? "revoked" : "active", reason,
      operationId: crypto.randomUUID(), expectedUpdatedAt: review.updatedAt } });
    if (!operation.success) { setError(operation.error.issues[0].message); return; }
    void execute(operation.data);
  }
  function search(event: FormEvent) { event.preventDefault(); setFilters(form); setPage(1); setSelectedId(null); }
  function showHistory(id: string) { setSelectedId(id); setHistoryPage(1); }
  return <div className="commerce-manager">
    <div className="commerce-toolbar"><button disabled={busy} onClick={() => setRefresh(v => v + 1)}>Atualizar licenças</button></div>
    <p className="commerce-hint">{limit === 0 ? "Downloads sem limite automático." : `Limite configurado: ${limit} downloads por licença.`} O contador registra PDFs personalizados autorizados para envio, não comprova que o cliente salvou o arquivo.</p>
    <form className="commerce-filters" onSubmit={search}>
      <label>E-mail do cliente<input type="email" maxLength={255} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
      <label>Código da licença<input maxLength={36} placeholder="LIC-…" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></label>
      <label>Estado da licença<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="">Todos</option><option value="active">Ativa</option><option value="revoked">Revogada</option></select></label>
      <button disabled={busy}>Buscar licenças</button><button type="button" disabled={busy} onClick={() => { setForm(emptyFilters); setFilters(emptyFilters); setPage(1); setSelectedId(null); }}>Limpar filtros</button>
    </form>
    {error && <p className="account-notice error" role="alert">{error}</p>}{notice && <p className="account-notice success" role="status">{notice}</p>}
    {invalid && <p role="alert">Tentativa pendente ilegível. Novas decisões bloqueadas. Consulte o estado e o histórico antes de continuar.</p>}
    {pending && <section className="commerce-pending" role="status"><strong>Decisão com resultado pendente.</strong><p>Não crie outra tentativa. Recupere a original para confirmar o resultado.</p><button disabled={busy} onClick={() => showHistory(pending.licenseId)}>Consultar histórico pendente</button><button disabled={busy} onClick={() => void execute(pending)}>Recuperar decisão da licença</button></section>}
    {loading ? <p role="status">Consultando licenças…</p> : <div className="commerce-list">
      {rows.map(row => <article key={row.id}><div><h3>{row.product}</h3><p>{row.name || "Nome não informado"} · {row.email}</p><p>Pedido: {row.orderCode}</p><p>{row.code}</p><small>Criada em {date(row.createdAt)}</small></div>
        <div><strong>{row.status === "active" ? "Ativa" : "Revogada"}</strong><p>{row.downloads} downloads autorizados</p><p>Último download: {row.lastDownload ? date(row.lastDownload) : "—"}</p></div>
        <div className="commerce-toolbar"><button disabled={busy} onClick={() => showHistory(row.id)}>Ver histórico</button><button disabled={blocked} onClick={() => { setReview(row); setReason(""); setError(""); }}>{row.status === "active" ? "Revogar licença" : "Reativar licença"}</button></div>
      </article>)}{!error && total === 0 && <p>Nenhuma licença encontrada. Ela é criada no primeiro preparo autorizado do material.</p>}
    </div>}
    {total > 0 && <nav className="pagination" aria-label="Páginas de licenças"><button disabled={busy || loading || page === 1} onClick={() => setPage(v => v - 1)}>Anterior</button><span>Página {page} de {Math.ceil(total / 20)} · {total} licenças</span><button disabled={busy || loading || page * 20 >= total} onClick={() => setPage(v => v + 1)}>Próxima</button></nav>}
    {selectedId && <section className="commerce-detail" aria-label="Histórico da licença"><div className="commerce-detail-heading"><h3>Histórico da licença</h3><button disabled={busy} onClick={() => setSelectedId(null)}>Fechar histórico</button></div>{selected && <p>{selected.product} · {selected.code}</p>}
      {historyError ? <p role="alert">{historyError}</p> : !history ? <p role="status">Consultando histórico…</p> : <><ol className="commerce-history">{history.items.map(event => <li key={event.id}><strong>{pdfEventLabels[event.event]}</strong><p>{date(event.created_at)}{event.actor_email ? ` · ${event.actor_email}` : ""}</p>{event.reason && <p>Motivo: {event.reason}</p>}{event.error_code && <p>Código: {event.error_code}</p>}</li>)}</ol>
        {history.total > 20 && <nav className="pagination" aria-label="Páginas de eventos"><button disabled={busy || historyPage === 1} onClick={() => setHistoryPage(v => v - 1)}>Eventos anteriores</button><span>Página {historyPage}</span><button disabled={busy || historyPage * 20 >= history.total} onClick={() => setHistoryPage(v => v + 1)}>Próximos eventos</button></nav>}</>}
    </section>}
    <dialog ref={dialog} className="commerce-dialog" aria-labelledby="pdf-license-review-title" onCancel={e => { if (busy) e.preventDefault(); else setReview(null); }}>
      {review && <form onSubmit={decide}><p className="eyebrow">{review.orderCode}</p><h3 id="pdf-license-review-title">{review.status === "active" ? "Revogar licença" : "Reativar licença"}</h3><p>{review.product} · {review.email}</p><p>{review.code}</p>
        <p>{review.status === "active" ? "A revogação bloqueia novos downloads desta licença. Arquivos já baixados continuam utilizáveis." : "A reativação exige que a compra e o acesso continuem válidos. O código e o contador de downloads serão preservados."}</p>
        <label>Motivo da decisão<textarea required minLength={5} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
        {error && <p role="alert">{error}</p>}<div className="commerce-toolbar"><button className="commerce-primary" disabled={blocked}>{busy ? "Registrando…" : "Confirmar decisão"}</button><button type="button" disabled={busy} onClick={() => setReview(null)}>Voltar</button></div>
      </form>}
    </dialog>
  </div>;
}
