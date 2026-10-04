import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LogoutButton, SessionGuard } from "@/app/components/session-controls";

export default async function CarrinhoPage() {
  const { user } = await requireUser("/carrinho");
  return <SessionGuard userId={user.id}><main className="cart-page"><section className="cart-card">
    <ShoppingCart aria-hidden="true" size={30} />
    <p className="eyebrow">Carrinho</p><h1>Seu carrinho está vazio.</h1>
    <p>Por enquanto, as compras são atendidas pelo WhatsApp. Consulte o catálogo e converse com a equipe para adquirir seus materiais.</p>
    <Link href="/materiais">Conhecer materiais ↗</Link>
    <div className="profile-actions"><Link href="/perfil">Meu perfil</Link><LogoutButton /></div>
  </section></main></SessionGuard>;
}
