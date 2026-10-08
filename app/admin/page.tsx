import Link from "next/link";
import type { Metadata } from "next";
import { adminAccess } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionGuard } from "@/app/components/session-controls";
import AdminDashboard from "./dashboard";
import "./catalog.css";
import "./commerce.css";
import { cartPreviewEnabled } from "@/lib/cart-contract";

export const metadata: Metadata = { title: "Administração | Teorema da Educação", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const { user, allowed } = await adminAccess();
  if (!user) redirect("/login?next=%2Fadmin");
  if (!allowed) return <main className="profile-page"><section className="profile-card"><h1>Acesso negado.</h1><p>Esta área é reservada à administração.</p><Link className="account-button" href="/perfil">Meu perfil</Link></section></main>;
  return <SessionGuard userId={user.id}><AdminDashboard actorId={user.id} commerceEnabled={cartPreviewEnabled(process.env)} /></SessionGuard>;
}
