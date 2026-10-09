import Link from "next/link";
import { ShoppingCart, ArrowUpRight, MailCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { SessionGuard } from "@/app/components/session-controls";
import StudentShell from "@/app/components/student-shell";
import { cartPreviewEnabled } from "@/lib/cart-contract";
import type { Metadata } from "next";
import Cart from "./cart";
import "./cart.css";
import "@/app/pedidos/orders.css";
import "@/app/materiais/catalog.css";

export const metadata: Metadata = { title: "Seu carrinho | Teorema da Educação", robots: { index: false, follow: false } };

export default async function CarrinhoPage() {
  const { user } = await requireUser("/carrinho");
  const commerceEnabled = cartPreviewEnabled(process.env);
  return <SessionGuard userId={user.id}><StudentShell active="cart" email={user.email} commerceEnabled={commerceEnabled}>
    {commerceEnabled ? user.email_confirmed_at && !user.is_anonymous ? <Cart userId={user.id} /> :
      <section className="student-empty"><span className="student-icon"><MailCheck size={26} aria-hidden="true" /></span><div className="student-page-heading"><h1>Confirme seu e-mail.</h1></div><p>Abra o link enviado ao seu e-mail e volte ao carrinho. Sua seleção continua neste navegador.</p></section> :
      <><div className="student-page-heading"><p className="eyebrow">Sua seleção</p><h1>Meu <em>carrinho.</em></h1><p>Encontre os materiais que fazem sentido para o seu próximo passo.</p></div><section className="student-empty">
        <span className="student-icon"><ShoppingCart aria-hidden="true" size={26} strokeWidth={1.5} /></span><h2>Seu carrinho está vazio.</h2>
        <p>Por enquanto, as compras são atendidas pelo WhatsApp. Consulte o catálogo e converse com a equipe para adquirir seus materiais.</p>
        <Link className="account-button" href="/materiais">Conhecer materiais<ArrowUpRight size={16} aria-hidden="true" /></Link>
      </section></>}
  </StudentShell></SessionGuard>;
}
