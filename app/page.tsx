import { publicPageMetadata } from "@/lib/seo";
import HomeContent from "./home-content";

export const metadata = publicPageMetadata(
  "/",
  "Teorema da Educação | Concursos para professores em SC",
  "Prepare-se para concursos e processos seletivos na Educação em Santa Catarina. Conheça os cursos, videoaulas e materiais em PDF do Teorema da Educação.",
);

export default function HomePage() {
  return <HomeContent />;
}
