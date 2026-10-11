import type { Metadata } from "next";
import InviteActivation from "./invite-activation";

export const metadata: Metadata = { title: "Primeiro acesso | Teorema da Educação", robots: { index: false, follow: false } };

export default function ActivatePage() {
  return <InviteActivation />;
}
