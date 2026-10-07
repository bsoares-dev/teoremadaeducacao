import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LogoutButton, SessionGuard } from "@/app/components/session-controls";
import { cartPreviewEnabled } from "@/lib/cart-contract";
import type { Metadata } from "next";
import Cart from "./cart";
import "./cart.css";
import "@/app/pedidos/orders.css";
import "@/app/materiais/catalog.css";

export const metadata: Metadata = { title: "Seu carrinho | Teorema da Educação", robots: { index: false, follow: false } };

export default async function CarrinhoPage() {
  const { user } = await requireUser("/carrinho");
  if (cartPreviewEnabled(process.env)) {
    return <SessionGuard userId={user.id}>{user.email_confirmed_at && !user.is_anonymous ? <Cart userId={user.id} /> :
      <main className="cart-page"><section className="cart-card"><h1>Confirme seu e-mail.</h1><p>Abra o link enviado ao seu e-mail e volte ao carrinho. Sua seleção continua neste navegador.</p><LogoutButton /></section></main>}
    </SessionGuard>;
  }
  return <SessionGuard userId={user.id}><main className="cart-page"><section className="cart-card">
    <ShoppingCart aria-hidden="true" size={30} />
    <p className="eyebrow">Carrinho</p><h1>Seu carrinho está vazio.</h1>
    <p>Por enquanto, as compras são atendidas pelo WhatsApp. Consulte o catálogo e converse com a equipe para adquirir seus materiais.</p>
    <Link href="/materiais">Conhecer materiais ↗</Link>
    <div className="profile-actions"><Link href="/perfil">Meu perfil</Link><LogoutButton /></div>
  </section></main></SessionGuard>;
}
