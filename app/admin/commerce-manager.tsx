"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { cartMoney } from "@/lib/cart-contract";
import { orderStatusLabel } from "@/lib/order-contract";
import { accessRow, commerceOrder, commerceDetail, pendingDecision, parseDecision, commerceJournalKey, decisionLabels, auditLabels,
  type AccessRow, type CommerceOrder, type CommerceDetail, type PendingDecision } from "@/lib/admin-commerce-contract";

const initialFilters = { code: "", email: "", status: "", state: "", from: "", to: "" };
const date = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
type Review = { action: "confirm" } | { action: "cancel" } | { action: "access"; grantId: string; state: "ATIVO" | "REVOGADO"; name: string };

export default function CommerceManager({ actorId, onBusyChange }: { actorId: string; onBusyChange: (busy: boolean) => void }) {
  const router = useRouter(), journal = commerceJournalKey(actorId);
  const [section, setSection] = useState<"orders" | "access">("orders");
  const [form, setForm] = useState(initialFilters), [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0), [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<CommerceOrder[]>([]), [accesses, setAccesses] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [journalInvalid, setJournalInvalid] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<CommerceDetail | null>(null), [pending, setPending] = useState<PendingDecision | null>(null);
  const [review, setReview] = useState<Review | null>(null), [reason, setReason] = useState(""), [verified, setVerified] = useState(false);
  const working = useRef(false), dialog = useRef<HTMLDialogElement>(null), mounted = useRef(false);
  useEffect(() => { mounted.current = true; try { setPending(parseDecision(sessionStorage.getItem(journal))); setJournalInvalid(false); } catch { setJournalInvalid(true); }
    return () => { mounted.current = false; }; }, [journal]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => { if (review) dialog.current?.showModal(); else dialog.current?.close(); }, [review]);

  const api = useCallback(async (path: string, decision?: PendingDecision["decision"], signal?: AbortSignal) => {
    const response = await fetch(path, { method: decision ? "POST" : "GET", cache: "no-store", signal: signal || AbortSignal.timeout(20000),
      ...(decision ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(decision) } : {}) });
    if (response.status === 401) { router.replace("/login?next=/admin"); throw new RequestError("Sessão encerrada.", 401); }
    if (response.status === 403) throw new RequestError("Acesso negado ou conta indisponível. Atualize antes de continuar.", 403);
    const result = await response.json();
    if (!response.ok) throw new RequestError(result.error || "Operação indisponível.", response.status);
    return result;
  }, [router]);

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setOrders([]); setAccesses([]); setTotal(0);
    const query = new URLSearchParams({ ...filters, page: String(page) });
    if (section === "orders") query.delete("state"); else { query.delete("status"); query.delete("code"); }
    void api(`/api/admin/${section}?${query}`, undefined, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (section === "orders") setOrders(z.array(commerceOrder).parse(result.items)); else setAccesses(z.array(accessRow).parse(result.items));
      setTotal(result.total);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha de conexão."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, filters, page, refresh, section]);

  async function open(id: string, historyPage = 1) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(""); setNotice(""); setReview(null); setDetail(null);
    try { const result = commerceDetail.parse(await api(`/api/admin/orders/${id}?historyPage=${historyPage}`)); if (mounted.current) setDetail(result); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Falha ao consultar pedido."); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  function begin(next: Review) { setVerified(false); setReason(""); setReview(next); setError(""); }
  async function execute(operation: PendingDecision) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(""); setNotice("");
    try {
      // Journal before POST. An unknown outcome must retain the original UUID.
      sessionStorage.setItem(journal, JSON.stringify(operation)); setPending(operation);
      const result = commerceDetail.parse(await api(`/api/admin/orders/${operation.orderId}`, operation.decision));
      sessionStorage.removeItem(journal);
      if (mounted.current) { setPending(null); setDetail(result); setReview(null); setRefresh(v => v + 1); setNotice("Decisão registrada. Confira o estado atual e o histórico abaixo."); }
    } catch (cause) {
      if (cause instanceof RequestError && [400, 404, 409].includes(cause.status)) {
        // These responses happen before commit or after a rolled-back SQL action.
        try { sessionStorage.removeItem(journal); if (mounted.current) setPending(null); } catch { /* Preserve unresolved storage state. */ }
      }
      if (mounted.current) { setReview(null); setDetail(null); setError(cause instanceof Error ? cause.message : "Resultado não confirmado. Recupere a mesma tentativa antes de decidir novamente."); }
    } finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  async function decide(event: FormEvent) {
    event.preventDefault(); if (!review || !detail || pending || journalInvalid || working.current) return;
    try {
      const decision = review.action === "confirm" ? { action: "confirm", paymentVerified: verified }
        : review.action === "cancel" ? { action: "cancel", reason }
        : { action: "access", grantId: review.grantId, state: review.state, reason, operationId: crypto.randomUUID() };
      await execute(pendingDecision.parse({ orderId: detail.order.id, decision }));
    } catch (cause) { setError(cause instanceof z.ZodError ? cause.issues[0].message : "Confira os dados da decisão."); }
  }
  function search(event: FormEvent) { event.preventDefault(); setFilters(form); setPage(1); setDetail(null); }
  const blocked = busy || !!pending || journalInvalid;
  const heading = review?.action === "access" ? decisionLabels[review.state] : review ? decisionLabels[review.action] : "";
  return <div className="commerce-manager">
    <nav className="commerce-toolbar" aria-label="Pedidos e acessos"><button disabled={busy} aria-pressed={section === "orders"} onClick={() => { setSection("orders"); setPage(1); setDetail(null); }}>Pedidos</button><button disabled={busy} aria-pressed={section === "access"} onClick={() => { setSection("access"); setPage(1); setDetail(null); }}>Acessos</button><button disabled={busy} onClick={() => { setRefresh(v => v + 1); if (detail) void open(detail.order.id, detail.historyPage); }}>Atualizar lista</button></nav>
    <form className="commerce-filters" onSubmit={search}>
      {section === "orders" && <label>Código do pedido<input value={form.code} placeholder="TE-000000000001" onChange={e => setForm({ ...form, code: e.target.value })} maxLength={23} /></label>}
      <label>E-mail do cliente<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} maxLength={255} /></label>
      <label>{section === "orders" ? "Status do pedido" : "Estado do acesso"}<select value={section === "orders" ? form.status : form.state} onChange={e => setForm({ ...form, [section === "orders" ? "status" : "state"]: e.target.value })}><option value="">Todos</option>{section === "orders" ? Object.entries(orderStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>) : <><option value="ATIVO">Ativo</option><option value="REVOGADO">Revogado</option></>}</select></label>
      <label>Data inicial<input type="date" value={form.from} onChange={e => setForm({ ...form, from: e.target.value })} /></label><label>Data final<input type="date" value={form.to} onChange={e => setForm({ ...form, to: e.target.value })} /></label>
      <button disabled={busy}>Buscar</button><button type="button" disabled={busy} onClick={() => { setForm(initialFilters); setFilters(initialFilters); setPage(1); }}>Limpar filtros</button>
    </form>
    <p className="commerce-hint">Busca por e-mail completo. Datas em São Paulo: registro do pedido ou última liberação do acesso.</p>
    {error && <p className="account-notice error" role="alert">{error}</p>}{notice && <p className="account-notice success" role="status">{notice}</p>}
    {journalInvalid && <p className="account-notice error" role="alert">Tentativa pendente ilegível. Novas decisões estão bloqueadas nesta aba. Consulte o estado e o histórico do pedido antes de continuar; não reenvie uma alteração sem conferir seu resultado.</p>}
    {pending && <section className="commerce-pending" role="status"><strong>Existe uma decisão com resultado pendente.</strong><p>Consulte o pedido e recupere a mesma tentativa para verificar o resultado.</p><button disabled={busy} onClick={() => open(pending.orderId)}>Consultar pedido pendente</button><button disabled={busy} onClick={() => execute(pending)}>Recuperar tentativa</button></section>}
    {loading ? <p role="status">Consultando registros…</p> : <div className="commerce-list">
      {section === "orders" ? orders.map(o => <article key={o.id}><div><h3>{o.code}</h3><p>{o.email || o.userId}</p><p>{date(o.createdAt)}</p></div><div><p>{orderStatusLabel[o.status]}</p><strong>{cartMoney(o.totalCents)}</strong></div><button disabled={busy} onClick={() => open(o.id)}>Ver pedido</button></article>)
        : accesses.map(a => <article key={a.id}><div><h3>{a.name}</h3><p>{a.email || a.userId}</p><p>Origem: {a.code} · {a.state === "ATIVO" ? "Ativo" : "Revogado"}</p><p>{a.effectiveAccess ? "Cliente com autorização ativa para este material." : "Cliente sem autorização ativa para este material."}</p><small>Liberado por {a.grantedBy} em {date(a.grantedAt)}</small></div><button disabled={busy} onClick={() => open(a.orderId)}>Ver origem e histórico</button></article>)}
      {!error && total === 0 && <p>Nenhum registro encontrado.</p>}
    </div>}
    {total > 0 && <nav className="pagination" aria-label="Páginas de registros"><button disabled={busy || loading || page === 1} onClick={() => setPage(v => v - 1)}>Anterior</button><span>Página {page} de {Math.ceil(total / 20)} · {total} registros</span><button disabled={busy || loading || page * 20 >= total} onClick={() => setPage(v => v + 1)}>Próxima</button></nav>}
    {detail && <section className="commerce-detail" aria-label="Detalhes do pedido">
      <div className="commerce-detail-heading"><div><p className="eyebrow">{detail.order.code}</p><h3>Pedido e materiais</h3></div><button disabled={busy} onClick={() => setDetail(null)}>Fechar detalhes</button></div>
      <p>{detail.order.email || detail.order.userId}</p><p>{orderStatusLabel[detail.order.status]} · {date(detail.order.createdAt)}</p>
      {detail.order.confirmedAt && <p>Confirmado por {detail.order.confirmedBy} em {date(detail.order.confirmedAt)}</p>}
      {detail.order.canceledAt && <p>Cancelado por {detail.order.canceledBy} em {date(detail.order.canceledAt)}. Motivo: {detail.order.reason}</p>}
      <ul className="commerce-items">{detail.items.map(i => <li key={i.id}><div><h4>{i.name}</h4><strong>{cartMoney(i.priceCents)}</strong><p>1 unidade · PDF</p></div>{i.access && <div className="commerce-grant"><p>{i.access.state === "ATIVO" ? "Acesso ativo" : "Acesso revogado"}</p><small>Liberado por {i.access.grantedBy} em {date(i.access.grantedAt)}</small>{i.access.revokedAt && <p>Revogado por {i.access.revokedBy} em {date(i.access.revokedAt)}. Motivo: {i.access.reason}</p>}{i.access.state === "REVOGADO" && i.access.effectiveAccess && <p>Outra compra mantém autorização ativa para este material.</p>}<button disabled={blocked} onClick={() => begin({ action: "access", grantId: i.access!.id, state: i.access!.state === "ATIVO" ? "REVOGADO" : "ATIVO", name: i.name })}>{i.access.state === "ATIVO" ? "Revogar acesso" : "Reliberar acesso"}</button></div>}</li>)}</ul>
      <p className="commerce-total">Total registrado: {cartMoney(detail.order.totalCents)}</p>
      <p className="commerce-hint">Valores e títulos são os registrados na compra. Despublicar um produto não revoga o acesso dos compradores.</p>
      {detail.order.status === "AGUARDANDO_CONFIRMACAO" && <div className="commerce-toolbar"><button className="commerce-primary" disabled={blocked} onClick={() => begin({ action: "confirm" })}>Confirmar compra e liberar materiais</button><button disabled={blocked} onClick={() => begin({ action: "cancel" })}>Cancelar pedido</button></div>}
      <h3>Histórico deste pedido</h3><ol className="commerce-history">{detail.history.map(h => <li key={h.id}><strong>{auditLabels[h.action] || h.action}</strong><p>{h.actorEmail || h.actorId} · {date(h.createdAt)}</p>{h.entityId !== detail.order.id && <p>Material: {detail.items.find(i => i.access?.id === h.entityId)?.name || h.entityId}</p>}{h.reason && <p>Motivo: {h.reason}</p>}</li>)}</ol>{!detail.history.length && <p>Nenhuma decisão administrativa nesta página.</p>}
      {detail.historyTotal > 20 && <nav className="pagination" aria-label="Páginas do histórico"><button disabled={busy || detail.historyPage === 1} onClick={() => open(detail.order.id, detail.historyPage - 1)}>Histórico anterior</button><span>Página {detail.historyPage}</span><button disabled={busy || detail.historyPage * 20 >= detail.historyTotal} onClick={() => open(detail.order.id, detail.historyPage + 1)}>Próximo histórico</button></nav>}
    </section>}
    <dialog ref={dialog} className="commerce-dialog" aria-labelledby="commerce-review-title" onCancel={event => { if (busy) event.preventDefault(); else setReview(null); }}>
      {review && detail && <form onSubmit={decide}><p className="eyebrow">{detail.order.code}</p><h3 id="commerce-review-title">{heading}</h3><p>Cliente: {detail.order.email || detail.order.userId}</p>
        {error && <p role="alert">{error}</p>}
        {review.action === "confirm" ? <><ul>{detail.items.map(i => <li key={i.id}>{i.name} · {cartMoney(i.priceCents)}</li>)}</ul><p className="commerce-total">Total: {cartMoney(detail.order.totalCents)}</p><label className="commerce-check"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} required />Conferi o pagamento fora do site e os dados deste pedido. Liberar todos os materiais para esta conta.</label></>
          : <><p>{review.action === "access" ? `Material: ${review.name}. A decisão afeta somente a autorização deste pedido.` : "O cancelamento encerra o pedido pendente e não libera materiais."}</p><label>Motivo<textarea value={reason} onChange={e => setReason(e.target.value)} required minLength={5} maxLength={1000} /></label></>}
        <div className="commerce-toolbar"><button className="commerce-primary" disabled={busy || !!pending || (review.action === "confirm" && !verified)}>{busy ? "Registrando…" : heading}</button><button type="button" disabled={busy} onClick={() => setReview(null)}>Voltar</button></div>
      </form>}
    </dialog>
  </div>;
}
