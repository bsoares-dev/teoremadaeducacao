"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/app/components/session-controls";

type Profile = { id: string; email: string; cpf: string; phone: string; created_at: string };
type Product = { id: string; name: string; description: string; price: number; image_url: string; created_at: string };
const blank = { name: "", description: "", price: "", imageUrl: "" };

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<"users" | "products">("users");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [users, setUsers] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(blank);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setUsers([]); setProducts([]); setTotal(0);
    async function load() {
      try {
        const response = await fetch("/api/admin/dashboard?section=" + tab + "&page=" + page, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { router.replace("/login?next=/admin"); return; }
        if (response.status === 403) { router.replace("/perfil"); router.refresh(); return; }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Falha ao consultar os dados.");
        if (controller.signal.aborted) return;
        if (tab === "users") setUsers(result.items); else setProducts(result.items);
        setTotal(result.total);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Falha de conexão.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [page, tab, revision, router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (response.status === 401) { router.replace("/login?next=/admin"); return; }
      if (response.status === 403) { router.replace("/perfil"); router.refresh(); return; }
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar.");
      setForm(blank); setNotice("Produto cadastrado e disponível no catálogo."); setPage(1); setRevision(v => v + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha de conexão. Confira a lista antes de reenviar."); }
    finally { setSaving(false); }
  }

  function changeTab(next: "users" | "products") { setTab(next); setPage(1); setError(""); setNotice(""); }

  return <main className="dashboard-page">
    <aside className="dashboard-sidebar">
      <div><p className="eyebrow">Teorema da Educação</p><h1>Painel</h1></div>
      <nav aria-label="Administração">
        <button className={tab === "users" ? "active" : ""} aria-current={tab === "users" ? "page" : undefined} onClick={() => changeTab("users")}>Usuários</button>
        <button className={tab === "products" ? "active" : ""} aria-current={tab === "products" ? "page" : undefined} onClick={() => changeTab("products")}>Produtos</button>
      </nav>
      <Link href="/perfil">Meu perfil</Link><Link href="/materiais">Ver catálogo</Link><LogoutButton />
    </aside>
    <section className="dashboard-content" aria-busy={loading}>
      <p className="eyebrow">{tab === "users" ? "Gestão de acesso" : "Catálogo"}</p>
      <h2>{tab === "users" ? "Usuários" : "Produtos"}</h2>
      <p className="dashboard-description">{tab === "users" ? "Contas cadastradas na plataforma." : "Os produtos salvos aqui aparecem na página de materiais."}</p>
      {error && <div className="account-notice error" role="alert"><p>{error}</p><button onClick={() => setRevision(v => v + 1)}>Atualizar lista</button></div>}
      {notice && <p className="dashboard-message" role="status">{notice}</p>}
      {tab === "products" && <form className="product-form" onSubmit={save}>
        <label>Nome<input required minLength={2} maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>Preço (R$)<input required type="number" min="0.01" max="1000000" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></label>
        <label className="product-form-wide">Descrição<textarea required minLength={10} maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        <label className="product-form-wide">URL da imagem (HTTPS)<input required type="url" maxLength={2000} pattern="https://.*" value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} /></label>
        <button disabled={saving}>{saving ? "Salvando..." : "Cadastrar produto"}</button>
      </form>}
      {loading ? <p role="status">Carregando...</p> : !error && <>
        {tab === "users" ? <div className="dashboard-table-wrap"><table>
          <caption className="sr-only">Usuários cadastrados</caption>
          <thead><tr><th scope="col">E-mail</th><th scope="col">CPF</th><th scope="col">Telefone</th><th scope="col">Cadastro</th></tr></thead>
          <tbody>{users.map(u => <tr key={u.id}><td>{u.email}</td><td>{u.cpf || "—"}</td><td>{u.phone || "—"}</td><td>{new Date(u.created_at).toLocaleDateString("pt-BR")}</td></tr>)}</tbody>
        </table></div> : <div className="product-list">{products.map(p => <article key={p.id}>
          {p.image_url?.startsWith("https://") && <img src={p.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
          <div><p className="eyebrow">{Number(p.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p><h3>{p.name}</h3><p>{p.description}</p></div>
        </article>)}</div>}
        {total === 0 ? <p>Nenhum registro encontrado.</p> : <nav className="pagination" aria-label="Páginas">
          <button disabled={page === 1} onClick={() => setPage(v => v - 1)}>Anterior</button>
          <span>Página {page} de {Math.max(1, Math.ceil(total / 20))} · {total} registros</span>
          <button disabled={page * 20 >= total} onClick={() => setPage(v => v + 1)}>Próxima</button>
        </nav>}
      </>}
    </section>
  </main>;
}
