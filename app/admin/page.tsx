"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Profile = { id: string; email: string; cpf: string; phone: string; created_at: string };
type Product = { id: string; name: string; description: string; price: number; image_url: string; created_at: string };
type ProductForm = { name: string; description: string; price: string; imageUrl: string };

const emptyProduct: ProductForm = { name: "", description: "", price: "", imageUrl: "" };

export default function AdminPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<"users" | "products">("users");
  const [product, setProduct] = useState<ProductForm>(emptyProduct);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [denied, setDenied] = useState(false);
  const [message, setMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.replace("/login");
      return;
    }

    const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    if (response.status === 403) {
      setDenied(true);
      setLoading(false);
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "Não foi possível carregar o painel.");
      setLoading(false);
      return;
    }

    setProfiles(data.profiles || []);
    setProducts(data.products || []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadDashboard();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => listener.subscription.unsubscribe();
  }, [loadDashboard, router]);

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/admin/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product),
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    if (response.status === 403) {
      setDenied(true);
      return;
    }
    if (!response.ok) {
      setMessage(data.error || "Não foi possível cadastrar o produto.");
      setSaving(false);
      return;
    }

    setProducts((current) => [data.product, ...current]);
    setProduct(emptyProduct);
    setMessage("Produto cadastrado com sucesso.");
    setSaving(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) return <main className="dashboard-page"><p className="dashboard-loading">Carregando painel...</p></main>;
  if (denied) return <main className="dashboard-page"><section className="dashboard-denied"><p className="eyebrow">Teorema da Educação</p><h1>Acesso negado.</h1><p>Esta área é reservada à administração da plataforma.</p><button onClick={() => router.replace("/perfil")}>Ir para meu perfil</button></section></main>;

  return (
    <main className="dashboard-page">
      <aside className="dashboard-sidebar">
        <div><p className="eyebrow">Teorema da Educação</p><h1>Painel</h1></div>
        <nav aria-label="Navegação administrativa">
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Utilizadores <span>{profiles.length}</span></button>
          <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>Produtos <span>{products.length}</span></button>
        </nav>
        <button className="dashboard-signout" onClick={handleSignOut}>Sair</button>
      </aside>

      <section className="dashboard-content">
        {tab === "users" ? (
          <>
            <p className="eyebrow">Gestão de acesso</p>
            <h2>Utilizadores</h2>
            <p className="dashboard-description">Contas criadas na plataforma através do Supabase.</p>
            <div className="dashboard-table-wrap">
              <table>
                <thead><tr><th>E-mail</th><th>CPF</th><th>Telefone</th><th>Data de registo</th></tr></thead>
                <tbody>{profiles.map((entry) => <tr key={entry.id}><td>{entry.email}</td><td>{entry.cpf}</td><td>{entry.phone}</td><td>{new Date(entry.created_at).toLocaleDateString("pt-BR")}</td></tr>)}</tbody>
              </table>
              {profiles.length === 0 && <p className="dashboard-empty">Nenhum utilizador encontrado.</p>}
            </div>
          </>
        ) : (
          <>
            <p className="eyebrow">Catálogo</p>
            <h2>Produtos</h2>
            <p className="dashboard-description">Cadastre os materiais que estarão disponíveis para venda.</p>
            <form className="product-form" onSubmit={handleCreateProduct}>
              <label>Nome<input value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} required /></label>
              <label>Preço<input type="number" inputMode="decimal" min="0.01" step="0.01" value={product.price} onChange={(event) => setProduct({ ...product, price: event.target.value })} required /></label>
              <label className="product-form-wide">Descrição<textarea value={product.description} onChange={(event) => setProduct({ ...product, description: event.target.value })} required /></label>
              <label className="product-form-wide">URL da imagem<input type="url" value={product.imageUrl} onChange={(event) => setProduct({ ...product, imageUrl: event.target.value })} required /></label>
              <button type="submit" disabled={saving}>{saving ? "Cadastrando..." : "Cadastrar produto"}<span>↗</span></button>
            </form>
            {message && <p className="dashboard-message" role="status">{message}</p>}
            <div className="product-list">
              {products.map((item) => <article key={item.id}><img src={item.image_url} alt="" /><div><p className="eyebrow">R$ {Number(item.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p><h3>{item.name}</h3><p>{item.description}</p></div></article>)}
              {products.length === 0 && <p className="dashboard-empty">Nenhum produto cadastrado.</p>}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
