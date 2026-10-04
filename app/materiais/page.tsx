import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { pagination } from "@/lib/schemas";

const whatsappNumber = "5548935011911";


function getWhatsappUrl(title: string) {
  const message = `Olá! Tenho interesse no material ${title} e gostaria de saber como adquirir.`;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page, from, to } = pagination((await searchParams).page || null, 12);
  const client = await createClient();
  const { data: materials, error, count } = await client.from("products")
    .select("id,name,description,price,image_url", { count: "exact" })
    .eq("is_active", true)
    .order("created_at", { ascending: false }).order("id").range(from, to);

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
        {!error && !materials?.length && <p>Nenhum material disponível nesta página. Fale com nossa equipe ou volte à primeira página.</p>}
        <div className="materials-grid">
          {(materials || []).map((material, index) => (
            <article className={`material-sale-card material-sale-card-${index % 3 + 1}`} key={material.id}>
              <div className="material-card-number">0{index + 1}</div>
              {material.image_url?.startsWith("https://") && <img className="catalog-image" src={material.image_url} alt={material.name} loading="lazy" referrerPolicy="no-referrer" />}
              <h3>{material.name}</h3>
              <p>{material.description}</p>
              <div className="material-card-footer">
                <span>{Number(material.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                <a href={getWhatsappUrl(material.name)} target="_blank" rel="noreferrer">
                  Quero adquirir <span>↗</span>
                </a>
              </div>
            </article>
          ))}
        </div>
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
