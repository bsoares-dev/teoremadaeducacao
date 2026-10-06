"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Trash2, BookOpen } from "lucide-react";
import { LogoutButton } from "@/app/components/session-controls";
import { SELECTION_KEY, parseSelection, serializeSelection } from "@/lib/catalog-selection";
import { cartMoney, cartSnapshot, cartResult, cartPendingKey, parsePending, remainingSelection, type CartMutation, type CartSnapshot, type CartResult } from "@/lib/cart-contract";

class CartError extends Error { constructor(message: string, public status = 0) { super(message); } }
async function request(body?: CartMutation) {
  const response = await fetch("/api/cart", { cache: "no-store", signal: AbortSignal.timeout(20000),
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new CartError(data.error || "Não foi possível atualizar o carrinho.", response.status);
  return data;
}

export default function Cart({ userId }: { userId: string }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rejected, setRejected] = useState<CartResult["rejected"]>([]);
  const [hasPending, setHasPending] = useState(false);
  const working = useRef(false), active = useRef(false);
  const journal = cartPendingKey(userId);

  const run = useCallback(async (removeId?: string, merge = true) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError("");
    let mutating = false;
    try {
      const current = cartSnapshot.parse((await request()).cart);
      if (!active.current) return;
      setCart(current);
      const pending = parsePending(sessionStorage.getItem(journal));
      setHasPending(!!pending);
      const selection = merge ? parseSelection(localStorage.getItem(SELECTION_KEY)) : [];
      const operation = pending || (removeId || selection.length ? {
        operationId: crypto.randomUUID(), cartId: current.id, revision: current.revision,
        addIds: removeId ? [] : selection, removeIds: removeId ? [removeId] : [],
      } : null);
      if (!operation) return;
      // Journal BEFORE sending; retry exactly the same operation after a lost response.
      sessionStorage.setItem(journal, JSON.stringify(operation)); setHasPending(true); mutating = true;
      const result = cartResult.parse(await request(operation));
      if (!active.current) return;
      setCart(result.cart); setRejected(result.rejected);
      const acknowledge = () => {
        const latest = parseSelection(localStorage.getItem(SELECTION_KEY));
        localStorage.setItem(SELECTION_KEY, serializeSelection(remainingSelection(latest, result.acceptedIds)));
      };
      if (navigator.locks) await navigator.locks.request(SELECTION_KEY, acknowledge); else acknowledge();
      sessionStorage.removeItem(journal); setHasPending(false);
      setMessage(operation.removeIds.length ? "Material removido do carrinho." : "Seleção salva no seu carrinho.");
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof CartError && cause.status === 401) { router.replace("/login?next=/carrinho"); router.refresh(); return; }
      if (mutating && cause instanceof CartError && cause.status === 409) {
        sessionStorage.removeItem(journal); setHasPending(false);
      }
      setError(cause instanceof CartError ? cause.message : "Não foi possível concluir. Sua seleção foi preservada. Permita o armazenamento no navegador e tente novamente.");
    } finally { working.current = false; if (active.current) setBusy(false); }
  }, [journal, router]);

  useEffect(() => {
    active.current = true;
    const timer = setTimeout(() => { void run(); }, 0);
    const focus = () => { void run(undefined, false); };
    const storage = (event: StorageEvent) => { if (event.key === SELECTION_KEY || event.key === null) void run(undefined, false); };
    window.addEventListener("focus", focus); window.addEventListener("storage", storage);
    return () => { active.current = false; clearTimeout(timer); window.removeEventListener("focus", focus); window.removeEventListener("storage", storage); };
  }, [run]);

  async function dismissRejected() {
    try {
      const remove = () => localStorage.setItem(SELECTION_KEY, serializeSelection(remainingSelection(parseSelection(localStorage.getItem(SELECTION_KEY)), rejected.map(item => item.id))));
      if (navigator.locks) await navigator.locks.request(SELECTION_KEY, remove); else remove();
      setRejected([]); setMessage("Itens não adicionados removidos da seleção deste navegador.");
    } catch { setError("Não foi possível atualizar a seleção neste navegador."); }
  }

  return <main className="pdf-cart-page">
    <header className="pdf-cart-header"><Link href="/" className="materials-brand">Teorema <em>da Educação</em></Link><Link href="/materiais">Continuar escolhendo ↗</Link></header>
    <section className="pdf-cart-heading"><p className="eyebrow blue-text">Sua seleção</p><h1>Seu próximo passo <em>começa aqui.</em></h1><p>Revise seus materiais. Seu carrinho fica salvo na sua conta para você continuar quando quiser.</p></section>
    <div className="pdf-cart-feedback" aria-live="polite" role="status">{busy ? "Conferindo seu carrinho…" : message}</div>
    {error && <div className="pdf-cart-notice" role="alert">{error} <button disabled={busy} onClick={() => run()}>Tentar novamente</button></div>}
    {rejected.length > 0 && <div className="pdf-cart-notice"><strong>Alguns materiais não foram adicionados.</strong>
      <ul>{["unavailable", "owned", "limit"].map(reason => {
        const count = rejected.filter(item => item.reason === reason).length;
        return count > 0 ? <li key={reason}>{count} {reason === "owned" ? "já disponível(is) na sua biblioteca." : reason === "limit" ? "além do limite de 50 PDFs. Remova itens do carrinho para tentar novamente." : "indisponível(is) para compra."}</li> : null;
      })}</ul><p>A seleção desses itens continua no navegador.</p><button disabled={busy} onClick={dismissRejected}>Descartar esses itens da seleção</button></div>}
    {cart && cart.items.length === 0 ? <section className="pdf-cart-empty"><ShoppingCart size={36} aria-hidden="true" /><h2>Um espaço para novas descobertas.</h2><p>Seu carrinho está vazio. Conheça os materiais e escolha os próximos temas do seu estudo.</p><Link className="catalog-add" href="/materiais">Explorar materiais</Link></section> : null}
    {cart && cart.items.length > 0 ? <div className="pdf-cart-layout"><section aria-label="Materiais no carrinho" className="pdf-cart-items">
      {cart.items.map(item => <article className="pdf-cart-item" key={item.id}>
        <div className="pdf-cart-cover">{item.image_url ? <Image src={item.image_url} alt={`Capa de ${item.name}`} fill sizes="100px" /> : <BookOpen aria-hidden="true" />}</div>
        <div><p className="eyebrow blue-text">Material digital · 1 PDF</p><h2>{item.name}</h2>
          {item.state !== "available" ? <p className="pdf-cart-warning">{item.state === "owned" ? "Já disponível na sua biblioteca. Remova este item do carrinho." : "Indisponível para novas compras. Remova para continuar."}</p>
            : <><p className="pdf-cart-price">{cartMoney(item.priceCents)}</p>{item.priceChanged && <p className="pdf-cart-warning">Preço atualizado: de {cartMoney(item.previousPriceCents)} para {cartMoney(item.priceCents)}. Confira o novo valor.</p>}</>}
        </div><button className="pdf-cart-remove" disabled={busy || hasPending} onClick={() => run(item.id, false)} aria-label={`Remover ${item.name}`}><Trash2 size={18} aria-hidden="true" /> Remover</button>
      </article>)}
    </section><aside className="pdf-cart-summary" aria-label="Resumo do carrinho"><p className="eyebrow">Seu carrinho</p><h2>Resumo da seleção</h2><p>{cart.items.length} {cart.items.length === 1 ? "material" : "materiais"} · uma unidade de cada PDF</p>
      <div className="pdf-cart-total"><span>Total atual</span><strong>{cartMoney(cart.totalCents)}</strong></div>
      {cart.hasBlockedItems && <p>Materiais indisponíveis ou já adquiridos não entram no total. Remova-os antes de continuar.</p>}
      <button disabled>Continuar para o pedido</button><p className="pdf-cart-preview">Prévia do carrinho. O registro do pedido e o atendimento pelo WhatsApp serão habilitados na próxima etapa. Nenhuma compra foi registrada.</p>
    </aside></div> : null}
    <footer className="pdf-cart-footer"><button disabled={busy} onClick={() => run()}>Atualizar e recuperar seleção</button><Link href="/perfil">Meu perfil</Link><LogoutButton /></footer>
  </main>;
}
