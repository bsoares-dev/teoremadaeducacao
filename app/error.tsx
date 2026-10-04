"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="profile-page"><section className="profile-card"><p className="eyebrow">Teorema da Educação</p><h1>Não foi possível carregar.</h1><p>O serviço está temporariamente indisponível. Tente novamente em instantes.</p><button className="account-button" onClick={reset}>Tentar novamente</button></section></main>;
}
