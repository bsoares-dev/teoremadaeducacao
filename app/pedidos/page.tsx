import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowUpRight, ReceiptText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { cartPreviewEnabled, cartMoney } from "@/lib/cart-contract";
import { orderColumns, summarizeOrder } from "@/lib/orders";
import { orderStatusLabel } from "@/lib/order-contract";
import { pagination } from "@/lib/schemas";
import { SessionGuard, RetryButton } from "@/app/components/session-controls";
import StudentShell from "@/app/components/student-shell";
import "./orders.css";
export const metadata: Metadata = { title: "Meus pedidos | Teorema da Educação", robots: { index: false, follow: false } };
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!cartPreviewEnabled(process.env)) notFound();
  const { user, supabase } = await requireUser("/pedidos");
  const { page, size, from, to } = pagination((await searchParams).page ?? null);
  const { data, error, count } = await supabase.from("orders").select(orderColumns, { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).order("id").range(from, to);
  return <SessionGuard userId={user.id}><StudentShell active="orders" email={user.email}><div className="student-orders">
    <div className="student-page-heading"><p className="eyebrow">Cada escolha, um novo caminho</p><h1>Meus <em>pedidos.</em></h1><p>Consulte seus registros e retome o atendimento sem criar outro pedido.</p></div>
    {error ? <section className="account-notice error" role="alert"><p>Não foi possível consultar seus pedidos.</p><RetryButton /></section> : <>
      {!data?.length && <section className="student-empty"><span className="student-icon"><ReceiptText size={26} strokeWidth={1.5} aria-hidden="true" /></span><h2>Seu próximo passo está por vir.</h2><p>Nenhum pedido nesta página.</p><p>Escolha seus materiais no catálogo. Os pedidos registrados na sua conta aparecerão aqui.</p><Link className="account-button" href="/materiais">Explorar materiais<ArrowUpRight size={16} aria-hidden="true" /></Link></section>}
      <div className="order-history">{(data || []).map(row => { const o = summarizeOrder(row); return <Link href={`/pedidos/${o.id}`} key={o.id}>
        <span className="order-history-icon"><ReceiptText size={22} strokeWidth={1.5} aria-hidden="true" /></span>
        <div className="order-history-info"><strong>{o.code}</strong><small>{new Date(o.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</small></div>
        <span className={`order-status-badge ${o.status.toLowerCase()}`}>{orderStatusLabel[o.status]}</span>
        <strong className="order-history-price">{cartMoney(o.totalCents)}</strong><span className="order-history-action">Ver pedido<ArrowUpRight size={16} aria-hidden="true" /></span>
      </Link>; })}</div>
      {!!data?.length && <nav className="student-pagination" aria-label="Páginas de pedidos">{page > 1 && <Link className="account-button secondary" href={`/pedidos?page=${page - 1}`}>Anterior</Link>}<span>Página {page}</span>{page * size < (count || 0) && <Link className="account-button secondary" href={`/pedidos?page=${page + 1}`}>Próxima</Link>}</nav>}
    </>}
  </div></StudentShell></SessionGuard>;
}
