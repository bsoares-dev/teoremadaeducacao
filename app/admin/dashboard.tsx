"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/app/components/session-controls";
import ProductsManager from "./products-manager";
import CommerceManager from "./commerce-manager";

type Profile = { id: string; email: string; cpf: string; phone: string; created_at: string };

type Tab = "users" | "products" | "commerce";
export default function AdminDashboard({ actorId, commerceEnabled }: { actorId: string; commerceEnabled: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("users");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [users, setUsers] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [commerceBusy, setCommerceBusy] = useState(false);

  useEffect(() => {
    if (tab !== "users") { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(""); setUsers([]); setTotal(0);
    async function load() {
      try {
        const response = await fetch("/api/admin/dashboard?section=" + tab + "&page=" + page, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { router.replace("/login?next=/admin"); return; }
        if (response.status === 403) { router.replace("/perfil"); router.refresh(); return; }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Falha ao consultar os dados.");
        if (controller.signal.aborted) return;
        setUsers(result.items);
        setTotal(result.total);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Falha de conexão.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [page, tab, revision, router]);

  function changeTab(next: Tab) { if (commerceBusy) return; setTab(next); setPage(1); setError(""); }

  return <main className="dashboard-page">
    <aside className="dashboard-sidebar">
      <div><p className="eyebrow">Teorema da Educação</p><h1>Painel</h1></div>
      <nav aria-label="Administração">
        <button disabled={commerceBusy} className={tab === "users" ? "active" : ""} aria-current={tab === "users" ? "page" : undefined} onClick={() => changeTab("users")}>Usuários</button>
        <button disabled={commerceBusy} className={tab === "products" ? "active" : ""} aria-current={tab === "products" ? "page" : undefined} onClick={() => changeTab("products")}>Produtos</button>
        {commerceEnabled && <button disabled={commerceBusy} className={tab === "commerce" ? "active" : ""} aria-current={tab === "commerce" ? "page" : undefined} onClick={() => changeTab("commerce")}>Pedidos e acessos</button>}
      </nav>
      <Link href="/perfil">Meu perfil</Link><Link href="/materiais">Ver catálogo</Link><LogoutButton />
    </aside>
    <section className="dashboard-content" aria-busy={loading}>
      <p className="eyebrow">{tab === "users" ? "Contas" : tab === "products" ? "Catálogo" : "Atendimento e liberações"}</p>
      <h2>{tab === "users" ? "Usuários" : tab === "products" ? "Produtos" : "Pedidos e acessos"}</h2>
      <p className="dashboard-description">{tab === "users" ? "Contas cadastradas na plataforma." : tab === "products" ? "Prepare rascunhos, valide seus PDFs e escolha quando cada material entra no catálogo." : "Confira o pedido salvo, confirme o pagamento e acompanhe os acessos dos clientes."}</p>
      {tab === "commerce" ? <CommerceManager actorId={actorId} onBusyChange={setCommerceBusy} /> : tab === "products" ? <ProductsManager /> : <>
      {error && <div className="account-notice error" role="alert"><p>{error}</p><button onClick={() => setRevision(v => v + 1)}>Atualizar lista</button></div>}
      {loading ? <p role="status">Carregando...</p> : !error && <>
        <div className="dashboard-table-wrap"><table>
          <caption className="sr-only">Usuários cadastrados</caption>
          <thead><tr><th scope="col">E-mail</th><th scope="col">CPF</th><th scope="col">Telefone</th><th scope="col">Cadastro</th></tr></thead>
          <tbody>{users.map(u => <tr key={u.id}><td>{u.email}</td><td>{u.cpf || "—"}</td><td>{u.phone || "—"}</td><td>{new Date(u.created_at).toLocaleDateString("pt-BR")}</td></tr>)}</tbody>
        </table></div>
        {total === 0 ? <p>Nenhum registro encontrado.</p> : <nav className="pagination" aria-label="Páginas">
          <button disabled={page === 1} onClick={() => setPage(v => v - 1)}>Anterior</button>
          <span>Página {page} de {Math.max(1, Math.ceil(total / 20))} · {total} registros</span>
          <button disabled={page * 20 >= total} onClick={() => setPage(v => v + 1)}>Próxima</button>
        </nav>}
      </>}
      </>}
    </section>
  </main>;
}
