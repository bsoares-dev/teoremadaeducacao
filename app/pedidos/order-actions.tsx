"use client";
import { useState } from "react";
import { orderWhatsApp, type OrderSnapshot } from "@/lib/order-contract";
export default function OrderActions({ order }: { order: OrderSnapshot }) {
  const [feedback, setFeedback] = useState("");
  const [fallback, setFallback] = useState(false);
  if (order.status !== "AGUARDANDO_CONFIRMACAO") return <p>Este pedido não está aguardando pagamento. Não efetue um novo pagamento usando uma mensagem antiga.</p>;
  const message = orderWhatsApp(order);
  async function copy() {
    try { await navigator.clipboard.writeText(message.message); setFeedback("Mensagem copiada. Cole na conversa do Teorema."); }
    catch { setFallback(true); setFeedback("Selecione e copie o texto abaixo."); }
  }
  return <section className="order-actions" aria-label="Atendimento pelo WhatsApp">
    <h2>Continue a conversa.</h2><p>Seu pedido permanece salvo mesmo se o WhatsApp não abrir. A liberação dos materiais depende da confirmação da equipe.</p>
    {message.summarized && <p role="status">Para caber no link, a mensagem contém o código, a quantidade e o total. A lista completa está salva neste pedido e disponível para consulta da equipe.</p>}
    <a className="order-primary" href={message.url} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
    <button className="order-secondary" onClick={copy}>Copiar mensagem</button>
    <p role="status" aria-live="polite">{feedback}</p>
    {fallback && <label>Mensagem para copiar<textarea readOnly value={message.message} onFocus={event => event.currentTarget.select()} /></label>}
    <p className="order-footnote">Código de atendimento não é autorização de acesso. Nenhuma cobrança é realizada nesta página.</p>
  </section>;
}
