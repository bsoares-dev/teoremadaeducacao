import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, FileText } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readOrder } from "@/lib/orders";
import { cartPreviewEnabled, cartMoney } from "@/lib/cart-contract";
import { orderStatusLabel } from "@/lib/order-contract";
import { SessionGuard, RetryButton } from "@/app/components/session-controls";
import StudentShell from "@/app/components/student-shell";
import OrderActions from "../order-actions";
import "../orders.css";

export const metadata: Metadata = { title: "Seu pedido | Teorema da Educação", robots: { index: false, follow: false } };
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  if (!cartPreviewEnabled(process.env)) notFound();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { user, supabase } = await requireUser(`/pedidos/${id}`);
  let order;
  try { order = await readOrder(supabase, user.id, id); }
  catch { return <SessionGuard userId={user.id}><StudentShell active="orders" email={user.email}><div className="student-page-heading"><h1>Não foi possível consultar o pedido.</h1><p>Isso não significa que ele deixou de ser registrado. Tente atualizar.</p></div><RetryButton /></StudentShell></SessionGuard>; }
  if (!order) notFound();
  return <SessionGuard userId={user.id}><StudentShell active="orders" email={user.email}><div className="student-orders">
    <Link className="student-back-link" href="/pedidos"><ArrowLeft size={15} aria-hidden="true" />Todos os pedidos</Link>
    <div className="student-page-heading"><p className="eyebrow">{order.code}</p><h1>Seu pedido está <em>registrado.</em></h1>
    <p>{order.status === "AGUARDANDO_CONFIRMACAO" ? "Converse com a equipe pelo WhatsApp para combinar o pagamento. Abrir o aplicativo não envia a mensagem nem confirma a compra." : "Consulte abaixo os dados registrados do seu pedido. O status é atualizado pela equipe."}</p></div>
    <p className={`order-status-badge ${order.status.toLowerCase()}`}>{orderStatusLabel[order.status]}</p>
    <div className="student-order-layout"><section className="order-lines" aria-label="Resumo do pedido"><h2>Seus materiais</h2><ul>{order.items.map(i => <li key={i.id}><span className="order-item-icon"><FileText size={20} strokeWidth={1.5} aria-hidden="true" /></span><span>{i.name}<small>1 unidade · PDF</small></span><strong>{cartMoney(i.priceCents)}</strong></li>)}</ul><p className="order-review-total">Total registrado: <strong>{cartMoney(order.totalCents)}</strong></p></section>
    <div className="student-order-followup"><OrderActions order={order} /></div></div>
    <footer className="student-order-footer"><RetryButton label="Atualizar status" /><Link href="/materiais">Continuar escolhendo</Link></footer>
  </div></StudentShell></SessionGuard>;
}
