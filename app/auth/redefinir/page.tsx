import type { Metadata } from "next";
import ResetPassword from "./reset-password";

export const metadata: Metadata = { title: "Nova senha | Teorema da Educação", robots: { index: false, follow: false } };

export default function ResetPage() { return <ResetPassword />; }
