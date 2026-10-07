import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readOrder } from "@/lib/orders";
import { cartPreviewEnabled, cartMoney } from "@/lib/cart-contract";
import { orderStatusLabel } from "@/lib/order-contract";
import { SessionGuard, RetryButton } from "@/app/components/session-controls";
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
  catch { return <main className="orders-page"><h1>Não foi possível consultar o pedido.</h1><p>Isso não significa que ele deixou de ser registrado. Tente atualizar.</p><RetryButton /><Link href="/pedidos">Meus pedidos</Link></main>; }
  if (!order) notFound();
  return <SessionGuard userId={user.id}><main className="orders-page">
    <header><Link href="/">Teorema <em>da Educação</em></Link><Link href="/pedidos">Meus pedidos</Link></header>
    <p className="eyebrow">{order.code}</p><h1>Seu pedido está <em>registrado.</em></h1>
    <p className="order-status">{orderStatusLabel[order.status]}</p>
    <p>{order.status === "AGUARDANDO_CONFIRMACAO" ? "Converse com a equipe pelo WhatsApp para combinar o pagamento. Abrir o aplicativo não envia a mensagem nem confirma a compra." : "Consulte abaixo os dados registrados do seu pedido. O status é atualizado pela equipe."}</p>
    <section className="order-lines" aria-label="Resumo do pedido"><ul>{order.items.map(i => <li key={i.id}><span>{i.name}<small>1 unidade · PDF</small></span><strong>{cartMoney(i.priceCents)}</strong></li>)}</ul><p className="order-review-total">Total registrado: {cartMoney(order.totalCents)}</p></section>
    <OrderActions order={order} />
    <footer><RetryButton label="Atualizar status" /><Link href="/materiais">Continuar escolhendo</Link><Link href="/perfil">Meu perfil</Link></footer>
  </main></SessionGuard>;
}
