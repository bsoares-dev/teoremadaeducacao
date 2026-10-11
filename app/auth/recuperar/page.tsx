import type { Metadata } from "next";
import RequestPassword from "./request-password";

export const metadata: Metadata = { title: "Recuperar senha | Teorema da Educação", robots: { index: false, follow: false } };

export default function RecoverPage() { return <RequestPassword />; }
