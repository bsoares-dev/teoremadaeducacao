# Auditoria e direção de arte

O briefing anexado é a fonte do roteiro. A busca no repositório, docs, assets, public, output e tmp não encontrou vídeo, áudio, storyboard nem renderizador Canvas anterior. A API `window.__render(t, mode)` será criada e mantida estável.

## Identidade
Paleta: #061828, #0B2B43, #F0BC67, #F8FBFF, #9EB5C9. Tipografia do site preservada: DM Sans e Playfair Display, auto-hospedadas via Fontsource (OFL). Geometria fina dourada, grandes áreas vazias, contraste e movimento contido.

- Marca: public/assets/logo-te-dark.jpeg (1600×1600), original; nenhuma recriação do logotipo.
- Mascote: public/assets/mascot-anderson.png (145×320, alpha), original; resolução limitada para vídeo Full HD. Substituir futuramente por master transparente de pelo menos 1000px de altura. Não gerar personagem alternativo.
- Referências: public/assets/reference-dark.jpeg e reference-light.jpeg (1080×1350).
- O favicon serifado é um asset técnico distinto: não será usado como substituto do logo geométrico oficial.

## Verdade do produto
- Home: implementada em app/page.tsx.
- Cursos: lib/home-products.ts encaminha para Hotmart. Não são apresentados como LMS interno.
- Materiais: catálogo real em /materiais; não criar números, itens ou preços fictícios.
- Questionários: /questionarios informa EM DESENVOLVIMENTO. Manter esta indicação na campanha.
- Capturas públicas: scripts/capture-site.mjs, evidence.json com URLs e status. Não consultar dados pessoais nem gravar no banco.

## Isolamento
Projeto Vite/TypeScript/GSAP em motion/, independente do Next.js. Sem alteração de rotas, segredos, banco, permissões ou travas comerciais. Nenhuma migração necessária. Exclusão prévia de .env.example não pertence a esta entrega.

## Validação por etapa
1. Dependências, TypeScript e build da estrutura.
2. Storyboard e amostras das seis cenas, incluindo landscape.
3. Play/pause/replay/seek, determinismo e limites.
4. Áudio original e export de 3 montagens, cada uma com e sem som.
5. Quadros, dimensões, legibilidade, ffprobe e regressão do projeto original.
