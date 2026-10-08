import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { pagination } from "@/lib/schemas";
import type { Metadata } from "next";
import { publicCover, selectionPreviewEnabled } from "@/lib/catalog-selection";
import { cartPreviewEnabled } from "@/lib/cart-contract";
import Catalog from "./catalog";
import "./catalog.css";

const whatsappNumber = "5548935011911";


export const metadata: Metadata = {
  title: "Materiais de estudo em PDF | Teorema da Educação",
  description: "Conheça os materiais digitais do Teorema da Educação. Conteúdos de Anderson e Mariana para estudar com clareza e propósito.",
  robots: process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development" ? { index: false, follow: false } : { index: true, follow: true },
  openGraph: { title: "Materiais do Teorema da Educação", description: "Conhecimento para acompanhar seu próximo passo. Conheça nossos materiais de estudo em PDF.", type: "website", locale: "pt_BR" },
};

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page, from, to } = pagination((await searchParams).page || null, 12);
  const selectionEnabled = selectionPreviewEnabled(process.env);
  const result = await (async () => {
    try {
      const client = await createClient();
      const query = client.from("products")
    .select("id,name,description,price,image_url", { count: "exact" })
    .eq("is_active", true)
    // Database constraint makes is_active equivalent to PUBLISHED. The public
    // role intentionally cannot SELECT the internal publication_status column.
    .order("created_at", { ascending: false }).order("id");
      // Reserved prefix for the explicitly authorized live acceptance test.
      // Test metadata can be read in Preview, never offered on the production UI.
      if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview") query.not("name", "like", "[HOMOLOGACAO] %");
      return await query.range(from, to);
    } catch { return { data: null, error: true, count: null }; }
  })();
  const { data: materials, error, count } = result;

  return (
    <main className="materials-page">
      <header className="materials-header">
        <Link className="materials-brand" href="/">
          Teorema <em>da Educação</em>
        </Link>
        <Link className="materials-back" href="/">
          Voltar ao início <span>↗</span>
        </Link>
      </header>

      <section className="materials-hero">
        <p className="eyebrow blue-text">Materiais do Teorema</p>
        <h1>
          Conhecimento que <em>acompanha</em> o seu próximo passo.
        </h1>
        <p>
          Escolha o material ideal para sua preparação. Nossos conteúdos são
          desenvolvidos por Anderson e Mariana para tornar o estudo mais claro,
          estratégico e aplicável.
        </p>
      </section>

      <section className="materials-catalog" aria-labelledby="catalog-title">
        <div className="materials-section-heading">
          <p className="eyebrow blue-text">Catálogo</p>
          <h2 id="catalog-title">Materiais para estudar com propósito.</h2>
        </div>

        {error && <p role="alert">Não foi possível carregar os materiais. <Link href="/materiais">Tentar novamente</Link></p>}
        {!error && !materials?.length && <div className="catalog-empty"><h3>{page > 1 ? "Nenhum material nesta página." : "Novos caminhos estão sendo preparados."}</h3>
          <p>{page > 1 ? "Volte ao início do catálogo para conferir os materiais disponíveis." : "Em breve, você encontrará nossos materiais por aqui. Converse com a equipe para conhecer o projeto."}</p>
          {page > 1 && <Link href="/materiais">Voltar à primeira página</Link>}</div>}
        {!error && <Catalog selectionEnabled={selectionEnabled} cartEnabled={cartPreviewEnabled(process.env)} materials={(materials || []).map(material => ({
          id: material.id, name: material.name, description: material.description, price: Number(material.price),
          image_url: publicCover(material.image_url, process.env.NEXT_PUBLIC_SUPABASE_URL),
        }))} />}
        {!error && <nav className="pagination" aria-label="Páginas do catálogo">
          {page > 1 && <Link href={"/materiais?page=" + (page - 1)}>Anterior</Link>}
          <span>Página {page}</span>
          {page * 12 < (count || 0) && <Link href={"/materiais?page=" + (page + 1)}>Próxima</Link>}
        </nav>}
      </section>

      <section className="materials-contact">
        <div>
          <p className="eyebrow">Ainda está em dúvida?</p>
          <h2>Envie-nos uma mensagem e descubra seu próximo passo.</h2>
        </div>
        <a
          href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Olá! Vim pelo site do Teorema da Educação e quero descobrir meu próximo passo.")}`}
          target="_blank"
          rel="noreferrer"
          className="materials-contact-button"
        >
          Falar com o Teorema <span>↗</span>
        </a>
      </section>

      <footer className="materials-footer">
        <span>© 2026 Teorema da Educação</span>
        <span>Feito com propósito.</span>
        <Link href="/">Voltar ao início ↑</Link>
      </footer>
    </main>
  );
}
