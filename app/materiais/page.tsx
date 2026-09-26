import Link from "next/link";

const whatsappNumber = "5548935011911";

const materials = [
  {
    eyebrow: "PDF estratégico",
    title: "Kit Estratégico em PDF",
    description:
      "Resumos objetivos, mapas mentais visuais e cadernos de questões comentadas para organizar sua preparação.",
    detail: "Download digital",
  },
  {
    eyebrow: "Prática pedagógica",
    title: "Caderno de práticas inclusivas",
    description:
      "Conteúdos aplicáveis para transformar a rotina pedagógica e ampliar as possibilidades de aprendizagem.",
    detail: "Material em PDF",
  },
  {
    eyebrow: "Formação",
    title: "Aprender com propósito",
    description:
      "Uma trilha para educadores que desejam ir além do conteúdo e construir práticas com mais intenção.",
    detail: "Em breve",
  },
];

function getWhatsappUrl(title: string) {
  const message = `Olá! Tenho interesse no material ${title} e gostaria de saber como adquirir.`;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export default function MaterialsPage() {
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

        <div className="materials-grid">
          {materials.map((material, index) => (
            <article className={`material-sale-card material-sale-card-${index + 1}`} key={material.title}>
              <div className="material-card-number">0{index + 1}</div>
              <p className="eyebrow">{material.eyebrow}</p>
              <h3>{material.title}</h3>
              <p>{material.description}</p>
              <div className="material-card-footer">
                <span>{material.detail}</span>
                <a href={getWhatsappUrl(material.title)} target="_blank" rel="noreferrer">
                  Quero adquirir <span>↗</span>
                </a>
              </div>
            </article>
          ))}
        </div>
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
