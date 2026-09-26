"use client";

import { useEffect, useState } from "react";

const products = [
  {
    type: "Curso completo",
    title: "Preparatório Extensivo para Concursos",
    desc: "Videoaulas de todos os temas da educação, resumos estratégicos, mapas mentais e questões comentadas em vídeo e PDF.",
    price: "Acesso imediato",
    accent: "blue",
    cta: "Quero ser aprovado",
  },
  {
    type: "Foco em bancas de SC",
    title: "Curso de Questões e Processos Seletivos",
    desc: "Videoaulas com correção comentada de questões das principais bancas de Santa Catarina + PDFs dos conteúdos cobrados.",
    price: "Editais & ACTs",
    accent: "gold",
    cta: "Quero praticar",
  },
  {
    type: "Materiais em PDF",
    title: "Kit Estratégico em PDF",
    desc: "Resumos objetivos, mapas mentais visuais e cadernos de questões gabaritadas e comentadas para estudo dinâmico.",
    price: "Download imediato",
    accent: "light",
    cta: "Garantir kit",
  },
];

const whatsappNumber = "5548935011911";
const whatsappMessage = "Olá! Vim pelo site do Teorema da Educação e gostaria de descobrir meu próximo passo.";
const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;
const formatCpf = (value: string) => value.replace(/\D/g, "").slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const formatPhone = (value: string) => value.replace(/\D/g, "").slice(0, 11).replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{4})$/, "$1-$2");

const trajectories = {
  anderson: {
    name: "Anderson Hirsch",
    role: "Professor & idealizador",
    photo: "/assets/anderson-photo.jpg",
    alt: "Anderson Hirsch, professor e idealizador do Teorema da Educação",
    intro: "Anderson Henrique Hirsch é o idealizador do Teorema da Educação.",
    text: "Licenciado em Matemática pela UNINTER e em Educação Física pela Anhanguera. Atualmente é mestrando em Matemática pela Universidade Federal de Santa Catarina (UFSC) e possui pós-graduações em Educação Tecnológica (UNIFAVENI), Educação Ambiental pelo IFSC e Gestão Escolar pela FaSouza. No Teorema da Educação, atua como o professor à frente das aulas em vídeo do projeto, e lado a lado com a profª. Mariana no planejamento, criação de aulas e elaboração dos materiais de estudo, promovendo conteúdos estruturados e de alta qualidade pedagógica.",
    lattes: "",
  },
  mariana: {
    name: "Mariana Tiepo",
    role: "Educadora & idealizadora",
    photo: "/assets/mariana-photo.jpeg",
    alt: "Mariana Tiepo, educadora e idealizadora do Teorema da Educação",
    intro: "Mariana Zaninelli Cordeiro Tiepo é professora efetiva de Educação Especial no município de Palhoça/SC.",
    text: "Graduada em Pedagogia Bilíngue (Libras/Português) pelo IFSC, possui especialização em Educação Especial e Inclusiva (Faculdade Dom Alberto) e é especialista em Educação de Surdos pelo IFSC. Participou do grupo de estudos LEdi/UDESC, dedica sua trajetória às pesquisas sobre inclusão e Justiça da Deficiência. No Teorema da Educação, atua lado a lado com o prof. Anderson na elaboração e construção das aulas e materiais de estudo, contribuindo para a formação e o fortalecimento de práticas pedagógicas verdadeiramente inclusivas.",
    lattes: "http://lattes.cnpq.br/0939120114756570",
  },
};

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activePerson, setActivePerson] = useState<keyof typeof trajectories | null>(null);
  const [registration, setRegistration] = useState({ name: "", email: "", phone: "", cpf: "" });
  const [registrationFeedback, setRegistrationFeedback] = useState("");
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registrationLoading, setRegistrationLoading] = useState(false);

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

  async function handleRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegistrationLoading(true);
    setRegistrationFeedback("");
    setRegistrationSuccess(false);
    try {
      const response = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(registration) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir o cadastro.");
      setRegistration({ name: "", email: "", phone: "", cpf: "" });
      setRegistrationSuccess(true);
      setRegistrationFeedback("Cadastro recebido. Em breve, entraremos em contato.");
    } catch (error) {
      setRegistrationFeedback(error instanceof Error ? error.message : "Não foi possível concluir o cadastro agora.");
    } finally {
      setRegistrationLoading(false);
    }
  }
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
          <p className="eyebrow">Preparatório para concursos e processos seletivos</p>
          <h1>
            Sua aprovação na Educação
            <br />
            <em>começa aqui.</em>
          </h1>
          <p className="hero-text">
            Videoaulas completas, resumos estratégicos em PDF, mapas mentais e
            questões comentadas das principais bancas de Santa Catarina.
          </p>
          <a className="button button-light" href="#projeto">
            Conheça nossos cursos <span>↓</span>
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
            <p className="eyebrow blue-text">Metodologia focada em resultados</p>
            <h2>
              Estude com clareza, objetividade
              <br />
              <em>e foco.</em>
            </h2>
          </div>
          <div className="intro-body">
            <p>
              No Teorema da Educação, transformamos edital em planejamento
              eficiente. Unimos professores especialistas a materiais visuais
              como mapas mentais e resumos estratégicos para acelerar seu
              aprendizado.
            </p>
            <p>
              Seja para concursos públicos ou processos seletivos (ACT),
              entregamos o direcionamento exato que você precisa para dominar a
              legislação pedagógica e garantir sua vaga.
            </p>
            <a className="text-link" href="#docentes">
              Conheça nossa metodologia <span>↗</span>
            </a>
          </div>
        </div>
      </section>

      <section className="manifesto">
        <div className="manifesto-inner">
          <div className="section-label light-label">Nosso compromisso</div>
          <p>
            "Preparação de excelência para você dominar a banca
            <br />e alcançar a sua tão sonhada
            <br />
            <em>nomeação.</em>"
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
              Servidores efetivos em SC que
              <br />
              <em>conhecem o caminho da aprovação.</em>
            </h2>
          </div>
          <p>
            Conheça os idealizadores do Teorema da Educação: professores
            concursados, pesquisadores e especialistas comprometidos em
            transformar a preparação para concursos públicos e processos
            seletivos em Santa Catarina.
          </p>
        </div>
        <div className="people-grid">
          <article className="person person-anderson">
            <div className="person-photo">
              <img src={trajectories.anderson.photo} alt={trajectories.anderson.alt} />
            </div>
            <div className="person-info">
              <p className="eyebrow">Professor & idealizador</p>
              <h3>Anderson Hirsch</h3>
              <p>Servidor efetivo no município de Palhoça/SC. Licenciado em Matemática e Ed. Física, Mestrando na UFSC e especialista em Educação Tecnológica e Gestão Escolar.</p>
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
              <h3>Mariana Tiepo</h3>
              <p>Professora efetiva de Educação Especial em Palhoça/SC. Graduada em Pedagogia Bilíngue pelo IFSC e especialista em Educação Inclusiva e Educação de Surdos.</p>
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
            <p className="eyebrow blue-text">Seu plano de estudos</p>
            <h2>
              A preparação ideal
              <br />
              <em>para o seu ritmo.</em>
            </h2>
          </div>
          <p>
            Escolha o formato de estudo que melhor se adapta à sua rotina. Do
            conteúdo teórico completo à prática intensa de questões das bancas
            de Santa Catarina.
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
                <a href="#cadastro">{product.cta}</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="signup" id="cadastro">
        <div className="signup-decoration">TE</div>
        <div className="signup-content">
          <p className="eyebrow">Cadastre-se</p>
          <h2>
            Faça parte do
            <br />
            <em>Teorema da Educação.</em>
          </h2>
          <p>
            Deixe seus dados para acompanhar novidades, materiais e oportunidades
            de formação do Teorema da Educação.
          </p>
          <form className="registration-form" onSubmit={handleRegistration}>
            <div className="registration-field registration-field-wide"><label htmlFor="registration-name">Nome e sobrenome</label><input id="registration-name" name="name" value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })} autoComplete="name" required /></div>
            <div className="registration-field"><label htmlFor="registration-email">E-mail</label><input id="registration-email" name="email" type="email" value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })} autoComplete="email" required /></div>
            <div className="registration-field"><label htmlFor="registration-phone">Número de telefone</label><input id="registration-phone" name="phone" inputMode="tel" value={registration.phone} onChange={(event) => setRegistration({ ...registration, phone: formatPhone(event.target.value) })} autoComplete="tel" required /></div>
            <div className="registration-field"><label htmlFor="registration-cpf">CPF</label><input id="registration-cpf" name="cpf" inputMode="numeric" value={registration.cpf} onChange={(event) => setRegistration({ ...registration, cpf: formatCpf(event.target.value) })} autoComplete="off" required /></div>
            <button className="registration-submit" type="submit" disabled={registrationLoading}>{registrationLoading ? "Enviando..." : "Quero me cadastrar"}<span>↗</span></button>
          </form>
          {registrationFeedback && <p className={registrationSuccess ? "registration-feedback success" : "registration-feedback"} role="status">{registrationFeedback}</p>}
          <small>Seus dados serão protegidos e usados apenas para comunicações do Teorema da Educação.</small>
        </div>
      </section>

      <footer className="footer" id="contato">
        <div className="footer-top">
          <a className="brand footer-brand" href="#inicio">
            <img className="footer-logo" src="/assets/te-prof-anderson.png" alt="TE com Prof. Anderson" />
          </a>
          <p>
            Preparando professores para a aprovação
            <br />nos concursos de Santa Catarina.
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
              <p className="eyebrow">Trajetória</p>
              <h2 id="trajectory-title">{trajectories[activePerson].name}</h2>
              <p className="trajectory-role">{trajectories[activePerson].role}</p>
              <p className="trajectory-intro">{trajectories[activePerson].intro}</p>
              <p>{trajectories[activePerson].text}</p>
              {trajectories[activePerson].lattes && (
                <a className="text-link" href={trajectories[activePerson].lattes} target="_blank" rel="noreferrer">
                  Currículo Lattes <span>↗</span>
                </a>
              )}
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
