import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teorema da Educação | Aprender transforma",
  description: "Educação com propósito, clareza e prática para transformar trajetórias.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
