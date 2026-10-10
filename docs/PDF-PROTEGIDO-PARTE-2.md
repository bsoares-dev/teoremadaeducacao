# PDF protegido - Parte 2: personalização

## Escopo e preservação

Esta parte adiciona **somente** o renderizador de cópias personalizadas. Nenhuma
rota, tela, regra de autenticação, pagamento, compra, licença ou download existente
foi alterada. Não houve migration, alteração no Supabase, Storage ou segredos.
Não foi iniciada a Parte 3: o fluxo atual ainda não chama este serviço.

## Arquitetura

Entrada server-side: `lib/pdf-watermark/service.ts`, marcada `server-only`.
`personalizePdf(input)` retorna `Promise<Uint8Array>`; aceita `Buffer` como entrada
porque ele estende `Uint8Array`. Não mantém resultados em cache, grava arquivos ou
acessa o Storage. Só os bytes públicos da fonte são mantidos em cache.

O chamador da futura Parte 3 deverá autenticar, verificar compra/liberação/licença
e buscar os dados canônicos do banco **antes** de chamar o renderizador. O serviço
não cria licença nem concede acesso. Nunca preencher seus argumentos diretamente
com `userId`, nome, e-mail, código de licença ou status enviados pelo navegador.

- `types.ts`: contratos de entrada, configuração e erros sanitizados.
- `config.ts`: parser estrito das três opções, todas `true` por padrão.
- `identity.ts`: validação do código da Parte 1, nome canônico, e-mail e máscara.
- `font.ts`: incorporação/subsetting da Noto Sans e cobertura de caracteres.
- `layout.ts`: geometria por página, recortes, rotações e posições determinísticas.
- `draw.ts`: três camadas independentes.
- `metadata.ts`: título do material, assunto e palavras-chave com a licença.
- `personalize.ts`: motor Node isolado, também utilizado pelos testes offline.
- `service.ts`: única entrada destinada ao código do aplicativo.

Exemplo para o futuro chamador autorizado:

```ts
import { personalizePdf } from "@/lib/pdf-watermark/service";

// Valores já autenticados/autorizados e obtidos no servidor.
const personalizedBytes = await personalizePdf({
  original: originalBytes,
  customerName: profile.full_name,
  customerEmail: user.email,
  licenseCode: license.license_code,
  product: { name: product.name },
});
```

Nome vem de `profiles.full_name`, não de uma biografia inferida ou de metadata
desatualizada do Auth. Por padrão, falta de nome/e-mail gera `INVALID_INPUT`.
As contas antigas já podem preencher o nome em `/perfil`. Com a opção de exibir
nome/e-mail desligada, o respectivo campo pode ser `null`.

## Marcas em todas as páginas

1. Lateral vertical: `Licenciado para João da Silva • jo***@gmail.com • LIC-...`.
   Fonte de 7 pt, cinza, na borda esquerda. Identificações longas são distribuídas
   em colunas sem remover letras, acentos ou truncar a licença.
2. Diagonal: `João da Silva • LIC-...`, cinza, 8% de opacidade, rotação de 36°.
   Tamanho adaptado ao espaço disponível para não cortar a identificação.
3. Identificador pequeno: código completo, alternando entre rodapé esquerdo,
   central, direito e canto superior direito. SHA-256 da licença escolhe a ordem;
   o índice da página determina a posição. Não usa `Math.random()` e não cria
   uma nova licença a cada geração. Mesma licença/página mantém a mesma posição.

`page.getSize()` é consultado individualmente. MediaBox/CropBox e rotações
0/90/180/270 são considerados sem redimensionar ou substituir o conteúdo original.
Nenhuma identificação usa CPF, IDs internos de usuário/pedido ou segredo.

## Fonte e Unicode

Nova dependência única: `@pdf-lib/fontkit` **1.1.1**. `pdf-lib` **1.17.1** já existia.
A [incorporação de fontes customizadas documentada pelo pdf-lib](https://pdf-lib.js.org/#embed-font-and-measure-text)
evita depender da codificação WinAnsi das fontes padrão.

Fonte original Noto Sans, mantida em `assets/pdf/`, fora de `public/` e sem
download de rede em runtime. Origem/revisão e licença SIL OFL 1.1 estão no mesmo
diretório. SHA-256 verificado:
`b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`.

Foram testados João da Silva, José Gonçalves, André Luís, Débora França, Łukasz
Željko e Ольга Иванова. Composição NFC preserva os acentos, inclusive texto de
entrada decomposto. Caracteres fora da cobertura desta fonte (por exemplo CJK)
geram `UNSUPPORTED_CHARACTER`; não são removidos nem substituídos por quadrados.

## Configuração server-side

Valores opcionais, sem prefixo `NEXT_PUBLIC_`:

```ini
PDF_SHOW_CUSTOMER_NAME=true
PDF_SHOW_CUSTOMER_EMAIL=true
PDF_MASK_CUSTOMER_EMAIL=true
```

Não é necessário cadastrar essas opções para usar os padrões acima. Apenas
`true` e `false` literais são aceitos; valores vazios/ambíguos geram erro e não
habilitam exposição por engano. O domínio do e-mail é mantido e são revelados no
máximo dois caracteres do identificador local; identificadores de uma letra ficam
totalmente ocultos. `maskEmail("joao.silva@gmail.com")` retorna `jo***@gmail.com`.

Não foi criado ou modificado `.env.local`, nem foi restaurada a exclusão prévia
do usuário de `.env.example`. Não há novo segredo ou `PDF_LICENSE_SECRET`: a
Parte 1 já usa código opaco com 128 bits aleatórios.

## Validação e limites

Reutiliza a política existente do projeto: arquivo de até **20 MiB**, de **1 a
5.000 páginas**, estático, sem senha, scripts, formulários, anexos ou links externos.
A checagem estrutural usa o worker já existente, com limite de memória/tempo.
Não entrega bytes do original quando a geração falha.

Páginas inválidas, excessivamente pequenas ou sem espaço para identificação
legível geram `PAGE_UNSUPPORTED` em vez de receber uma marca cortada/invisível.
Os tamanhos A4 vertical, A4 paisagem, customizado e recortado foram validados.
Marcas marginais não analisam semanticamente o conteúdo: materiais sem margem
devem ter sua diagramação revisada antes da publicação. A marca diagonal é
deliberadamente sobreposta, com opacidade baixa, mantendo a leitura.

Metadados novos: Title = nome do material; Subject = `Licensed copy: LIC-...`;
Keywords = `licensed` e licença. Nome/e-mail do comprador não são adicionados
aos metadados. Metadados editoriais pré-existentes do original são preservados.

Este serviço não é DRM e não implementa criptografia, limite de downloads,
revogação administrativa, logs ou download protegido. Integração com compra,
Storage privado, resposta HTTP e empacotamento dos recursos no endpoint ocorrerá
na Parte 3; limites operacionais de geração serão conferidos no ambiente real.

## Como testar sem dados reais

```powershell
node --import tsx --test tests/pdf-watermark.test.ts
node --import tsx scripts/check-pdf-watermark.ts
pdftoppm -cropbox -r 110 -png .data/pdf-watermark-check/output-test.pdf .data/pdf-watermark-check/page
npm run typecheck
npm run lint
npm test
npm run build
```

O script gera apenas `.data/pdf-watermark-check/output-test.pdf`, com quatro
páginas e identidade fictícia. `.data/` já é ignorada pelo Git. Não carrega `.env`,
não utiliza PDF privado e não cadastra usuário, pedido ou produto no Supabase.
As quatro páginas foram renderizadas e inspecionadas; a extração independente
com pypdf confirmou nome acentuado, e-mail mascarado e três ocorrências da mesma
licença em cada página.

Os 13 testes específicos verificam o PDF salvo e seu mapa ToUnicode, não apenas
mocks: camadas por página, dimensões preservadas, bytes originais imutáveis,
acentos, CropBox/rotação, nome longo, opções de privacidade, metadados, repetição,
concorrência entre identidades, código persistente e erros de PDF/fonte.

## Arquivos da entrega

Criados: os nove módulos `lib/pdf-watermark/*.ts`; `assets/pdf/NotoSans-Regular.ttf`,
`assets/pdf/OFL.txt`, `assets/pdf/README.md`; `tests/pdf-watermark.test.ts`;
`scripts/check-pdf-watermark.ts`; este relatório.

Modificados: somente `package.json` e `package-lock.json` para a dependência nova.
Migration: **nenhuma necessária**.

## Resultado das verificações

- Testes específicos: **13/13 aprovados**.
- Suíte completa: **101/101 aprovados**, sem falhas, cancelamentos ou testes ignorados.
- TypeScript: aprovado (`npm run typecheck`).
- Lint: aprovado (`npm run lint`).
- Build de produção: aprovado (`npm run build`), mesmas 28 páginas estáticas e rotas.
- Scanner do bundle: 27 assets de cliente, sem valores de credenciais server-side.
- Inspeção visual: quatro páginas aprovadas com Poppler, incluindo CropBox/rotação.

Nenhum PDF gerado, dado de cliente ou arquivo `.env` faz parte do commit.
