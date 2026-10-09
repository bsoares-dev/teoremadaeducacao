import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-dm-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], display: "swap", variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "Teorema da Educação | Aprender transforma",
  description: "Educação com propósito, clareza e prática para transformar trajetórias.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" data-scroll-behavior="smooth" className={`${dmSans.variable} ${playfair.variable}`}><body>{children}</body></html>;
}
