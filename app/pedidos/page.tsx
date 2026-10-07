import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { cartPreviewEnabled, cartMoney } from "@/lib/cart-contract";
import { orderColumns, summarizeOrder } from "@/lib/orders";
import { orderStatusLabel } from "@/lib/order-contract";
import { pagination } from "@/lib/schemas";
import { SessionGuard, RetryButton } from "@/app/components/session-controls";
import "./orders.css";
export const metadata: Metadata = { title: "Meus pedidos | Teorema da Educação", robots: { index: false, follow: false } };
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!cartPreviewEnabled(process.env)) notFound();
  const { user, supabase } = await requireUser("/pedidos");
  const { page, size, from, to } = pagination((await searchParams).page ?? null);
  const { data, error, count } = await supabase.from("orders").select(orderColumns, { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).order("id").range(from, to);
  return <SessionGuard userId={user.id}><main className="orders-page">
    <header><Link href="/">Teorema <em>da Educação</em></Link><Link href="/carrinho">Meu carrinho</Link></header>
    <p className="eyebrow">Área do aluno</p><h1>Meus <em>pedidos.</em></h1><p>Consulte seus registros e retome o atendimento sem criar outro pedido.</p>
    {error ? <section role="alert"><p>Não foi possível consultar seus pedidos.</p><RetryButton /></section> : <>
      {!data?.length && <p>Nenhum pedido nesta página.</p>}
      <div className="order-history">{(data || []).map(row => { const o = summarizeOrder(row); return <Link href={`/pedidos/${o.id}`} key={o.id}><strong>{o.code}</strong><span>{orderStatusLabel[o.status]}</span><span>{cartMoney(o.totalCents)}</span><span>Ver pedido ↗</span></Link>; })}</div>
      <nav aria-label="Páginas de pedidos">{page > 1 && <Link href={`/pedidos?page=${page - 1}`}>Anterior</Link>}<span>Página {page}</span>{page * size < (count || 0) && <Link href={`/pedidos?page=${page + 1}`}>Próxima</Link>}</nav>
    </>}
  </main></SessionGuard>;
}
