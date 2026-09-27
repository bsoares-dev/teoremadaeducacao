import Link from "next/link";
import { ShoppingCart } from "lucide-react";

export default function CarrinhoPage() {
  return (
    <main className="cart-page">
      <section className="cart-card">
        <ShoppingCart aria-hidden="true" size={30} strokeWidth={1.4} />
        <p className="eyebrow">Carrinho</p>
        <h1>Seu acesso foi criado.</h1>
        <p>Agora escolha os materiais que vão acompanhar a sua próxima etapa de estudos.</p>
        <Link href="/materiais">Conhecer materiais <span>↗</span></Link>
      </section>
    </main>
  );
}
