import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-policy";
import { SessionGuard } from "@/app/components/session-controls";
import AdminDashboard from "./dashboard";

export default async function AdminPage() {
  const { user } = await requireUser("/admin");
  if (!isAdmin(user)) return <main className="profile-page"><section className="profile-card"><h1>Acesso negado.</h1><p>Esta área é reservada à administração.</p><Link className="account-button" href="/perfil">Meu perfil</Link></section></main>;
  return <SessionGuard userId={user.id}><AdminDashboard /></SessionGuard>;
}
