# Favicon do Teorema da Educação

Monograma TE dourado (`#b1a28b`, sand do site) sobre azul-marinho
(`#0d334e`, navy do site). Letras em paths vetoriais: sem dependência de fonte,
texto pequeno, imagens externas ou alteração da logo usada nas páginas.

## Arquivos

- Fonte editável: `assets/brand/favicon-te.svg`.
- `app/favicon.ico`: versões 16, 32, 48, 96, 192 e 256 px.
- `app/icon.png`: 192 x 192 px.
- `app/apple-icon.png`: 180 x 180 px.

As convenções de arquivos do Next.js 16.3.8 incluem automaticamente os links
no head. Não é necessário duplicar os metadados em `app/layout.tsx`.
O caminho `/favicon.ico` é estável. Os PNGs são estáticos e entregues sem
autenticação. Layout, títulos, canonicals, sitemap e acesso aos PDFs não mudam.

## Regeneração e validação

```powershell
node scripts/generate-favicons.mjs
node --import tsx --test tests/favicon.test.ts tests/seo.test.ts
node scripts/check-favicon.mjs http://127.0.0.1:3100
```

O último comando exige o site em execução. Para conferir produção sem fazer
escritas ou entrar em contas:

```powershell
node scripts/check-favicon.mjs https://www.teoremadaeducacao.com.br
```

O smoke verifica o HTML da página inicial, os links reais, as dimensões
declaradas, a resposta pública de cada ícone e o hash dos bytes publicados.
ICO e PNGs são versionados; não há conversão durante o build ou nova dependência.

## Google

Depois da publicação, pode-se solicitar a indexação da **página inicial** no
Search Console. O ícone dos resultados depende do próximo rastreamento e
processamento do Google: não muda imediatamente e a exibição não é garantida.
Não é necessário enviar o favicon ao sitemap ou alterar registros DNS.

Referência: [favicon na Pesquisa Google](https://developers.google.com/search/docs/appearance/favicon-in-search).
