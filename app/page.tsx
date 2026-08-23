"use client";

import { useEffect, useState } from "react";

const products = [
  {
    type: "Material de estudo",
    title: "Caderno de práticas inclusivas",
    desc: "Conteúdos aplicáveis para transformar a rotina pedagógica.",
    price: "Em breve",
    accent: "blue",
  },
  {
    type: "Formação",
    title: "Aprender com propósito",
    desc: "Uma trilha para educadores que desejam ir além do conteúdo.",
    price: "Em breve",
    accent: "gold",
  },
  {
    type: "Material de estudo",
    title: "Kit Teorema da Educação",
    desc: "Materiais selecionados para estudar, refletir e praticar.",
    price: "Em breve",
    accent: "light",
  },
];

const whatsappNumber = "5548935011911";
const whatsappMessage = "Olá! Vim pelo site do Teorema da Educação e gostaria de descobrir meu próximo passo.";
const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;

const trajectories = {
  anderson: {
    name: "Anderson",
    role: "Professor & idealizador",
    photo: "/assets/anderson-photo.jpg",
    alt: "Anderson, professor e idealizador do Teorema da Educação",
    intro: "Educação, prática e propósito em cada conversa.",
    text: "Anderson acredita que a educação ganha força quando o conhecimento encontra a vida real. Sua atuação combina escuta, experiência e uma busca constante por caminhos mais acessíveis, claros e humanos para aprender.",
  },
  mariana: {
    name: "Mariana",
    role: "Educadora & idealizadora",
    photo: "/assets/mariana-photo.jpeg",
    alt: "Mariana, educadora e idealizadora do Teorema da Educação",
    intro: "Olhar sensível para criar novas possibilidades.",
    text: "Mariana entende a educação como um espaço de encontro, cuidado e transformação. Seu olhar sensível ajuda a construir experiências que respeitam diferentes histórias, ritmos e formas de descobrir novas possibilidades.",
  },
};

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activePerson, setActivePerson] = useState<keyof typeof trajectories | null>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePerson(null);
    };
    window.addEventListener("keydown", handleEscape);
    document.body.style.overflow = activePerson ? "hidden" : "";
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [activePerson]);
  return (
    <main>
      <header className="header">
        <a className="brand" href="#inicio">
          <span className="brand-mark">TE</span>
          <span>
            Teorema
            <br />
            <i>da Educação</i>
          </span>
        </a>
        <button
          className="menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Abrir menu"
        >
          ☰
        </button>
        <nav className={menuOpen ? "nav open" : "nav"}>
          <a href="#projeto" onClick={() => setMenuOpen(false)}>
            O projeto
          </a>
          <a href="#docentes" onClick={() => setMenuOpen(false)}>
            Docentes
          </a>
          <a href="#materiais" onClick={() => setMenuOpen(false)}>
            Materiais
          </a>
          <a href="#contato" onClick={() => setMenuOpen(false)}>
            Contato
          </a>
          <a
            className="nav-cta"
            href="#cadastro"
            onClick={() => setMenuOpen(false)}
          >
            Cadastre-se <span>↗</span>
          </a>
        </nav>
      </header>

      <section className="hero" id="inicio">
        <div className="hero-grid" />
        <div className="hero-copy">
          <p className="eyebrow">Educação que faz sentido</p>
          <h1>
            Conhecimento
            <br />
            <em>que transforma.</em>
          </h1>
          <p className="hero-text">
            Um espaço para quem acredita que educar é abrir caminhos, criar
            possibilidades e transformar realidades.
          </p>
          <a className="button button-light" href="#projeto">
            Conheça o projeto <span>↓</span>
          </a>
        </div>
        <div className="hero-art">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="hero-card">
            <img
              className="hero-mascot"
              src="/assets/mascot-anderson.png"
              alt="Mascote Anderson lendo um livro"
            />
          </div>
        </div>
        <div className="scroll-note">
          Role para descobrir <span>↓</span>
        </div>
      </section>

      <section className="intro section" id="projeto">
        <div className="section-label">01 / O projeto</div>
        <div className="intro-content">
          <div>
            <p className="eyebrow blue-text">Mais do que ensinar</p>
            <h2>
              Uma educação
              <br />
              <em>com intenção.</em>
            </h2>
          </div>
          <div className="intro-body">
            <p>
              O Teorema da Educação nasce do encontro entre experiência,
              pesquisa e o desejo de tornar o conhecimento mais acessível,
              humano e aplicável.
            </p>
            <p>
              Criamos conteúdos e materiais para apoiar educadores, estudantes e
              todos que entendem a educação como uma ferramenta de
              transformação.
            </p>
            <a className="text-link" href="#docentes">
              Conheça quem está por trás <span>↗</span>
            </a>
          </div>
        </div>
      </section>

      <section className="manifesto">
        <div className="manifesto-inner">
          <div className="section-label light-label">Nossa visão</div>
          <p>
            “Todo aprendizado
            <br />é uma <em>possibilidade</em>
            <br />
            em movimento.”
          </p>
          <div className="manifesto-line" />
        </div>
      </section>

      <section className="people section" id="docentes">
        <div className="section-label">02 / Idealizadores</div>
        <div className="people-heading">
          <div>
            <p className="eyebrow blue-text">Quem faz acontecer</p>
            <h2>
              Experiência que
              <br />
              <em>ensina pelo exemplo.</em>
            </h2>
          </div>
          <p>
            Conheça os idealizadores do Teorema da Educação e a visão que guia
            cada conteúdo, cada encontro e cada material.
          </p>
        </div>
        <div className="people-grid">
          <article className="person person-anderson">
            <div className="person-photo">
              <img src={trajectories.anderson.photo} alt={trajectories.anderson.alt} />
            </div>
            <div className="person-info">
              <p className="eyebrow">Professor & idealizador</p>
              <h3>Anderson</h3>
              <p>Educação, prática e propósito em cada conversa.</p>
              <a className="text-link" href="#trajetoria-anderson" onClick={(event) => { event.preventDefault(); setActivePerson("anderson"); }}>
                Conhecer trajetória <span>↗</span>
              </a>
            </div>
          </article>
          <article className="person person-mariana">
            <div className="person-photo">
              <img src={trajectories.mariana.photo} alt={trajectories.mariana.alt} />
            </div>
            <div className="person-info">
              <p className="eyebrow">Educadora & idealizadora</p>
              <h3>Mariana</h3>
              <p>Olhar sensível para criar novas possibilidades.</p>
              <a className="text-link" href="#trajetoria-mariana" onClick={(event) => { event.preventDefault(); setActivePerson("mariana"); }}>
                Conhecer trajetória <span>↗</span>
              </a>
            </div>
          </article>
        </div>
      </section>

      <section className="materials section" id="materiais">
        <div className="section-label">03 / Materiais</div>
        <div className="materials-heading">
          <div>
            <p className="eyebrow blue-text">Estude no seu ritmo</p>
            <h2>
              Conteúdo para
              <br />
              <em>levar com você.</em>
            </h2>
          </div>
          <p>
            Materiais pensados para sair da tela e fazer parte da sua prática.
            Cadastre-se para receber novidades e ser avisado dos próximos
            lançamentos.
          </p>
        </div>
        <div className="product-grid">
          {products.map((product) => (
            <article
              className={`product ${product.accent}`}
              key={product.title}
            >
              <div className="product-top">
                <span>{product.type}</span>
                <span>↗</span>
              </div>
              <div className="product-symbol">✦</div>
              <h3>{product.title}</h3>
              <p>{product.desc}</p>
              <div className="product-bottom">
                <strong>{product.price}</strong>
                <a href="#cadastro">Quero saber mais</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="signup" id="cadastro">
        <div className="signup-decoration">TE</div>
        <div className="signup-content">
          <p className="eyebrow">Fique por dentro</p>
          <h2>
            Envie-nos uma mensagem
            <br />
            <em>e descubra seu próximo passo.</em>
          </h2>
          <p>
            Fale diretamente com o Teorema da Educação e descubra qual material,
            formação ou caminho faz mais sentido para você.
          </p>
          <a className="whatsapp-cta" href={whatsappUrl} target="_blank" rel="noreferrer">
            Envie-nos uma mensagem <span>↗</span>
          </a>
          <small>
            Atendimento direto pelo WhatsApp oficial do Teorema da Educação.
          </small>
        </div>
      </section>

      <footer className="footer" id="contato">
        <div className="footer-top">
          <a className="brand footer-brand" href="#inicio">
            <img className="footer-logo" src="/assets/te-prof-anderson.png" alt="TE com Prof. Anderson" />
          </a>
          <p>
            Educação que abre caminhos
            <br />e transforma realidades.
          </p>
          <div className="socials">
            <a href="https://www.instagram.com/teoremaeducacao?igsi=MTNzeGQxMXhna2Z0dQ==" target="_blank" rel="noreferrer">
              Instagram <span>↗</span>
            </a>
            <a href="https://youtube.com/@teoremaeducacao?si=3HFnGvDc4t-nI8K5" target="_blank" rel="noreferrer">
              YouTube <span>↗</span>
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Teorema da Educação</span>
          <span>Feito com propósito.</span>
          <a href="#inicio">Voltar ao topo ↑</a>
        </div>
      </footer>
      <a className="whatsapp-float" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="Falar com o Teorema da Educação pelo WhatsApp">
        <span className="whatsapp-icon" aria-hidden="true">✆</span>
        <span className="whatsapp-float-label">Fale conosco</span>
      </a>
      {activePerson && (
        <div className="trajectory-backdrop" role="dialog" aria-modal="true" aria-labelledby="trajectory-title" onClick={() => setActivePerson(null)}>
          <article className="trajectory-modal" onClick={(event) => event.stopPropagation()}>
            <button className="trajectory-close" type="button" onClick={() => setActivePerson(null)} aria-label="Fechar trajetória">×</button>
            <div className="trajectory-image"><img src={trajectories[activePerson].photo} alt={trajectories[activePerson].alt} /></div>
            <div className="trajectory-copy">
              <p className="eyebrow">Trajetória em construção</p>
              <h2 id="trajectory-title">{trajectories[activePerson].name}</h2>
              <p className="trajectory-role">{trajectories[activePerson].role}</p>
              <p className="trajectory-intro">{trajectories[activePerson].intro}</p>
              <p>{trajectories[activePerson].text}</p>
              <small>Texto provisório. Esta apresentação será atualizada com a trajetória oficial em breve.</small>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
