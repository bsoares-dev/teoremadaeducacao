# PDFs protegidos — Parte 1: fundação de licenças

## Escopo e preservação

Esta etapa acrescenta a identidade da licença. Não ativa watermark, novos downloads,
limites, logs ou ações no painel. Nenhum arquivo preexistente do aplicativo foi alterado.
Autenticação, cadastro, catálogo, carrinho, confirmação pelo WhatsApp, biblioteca,
Storage e travas de publicação comercial permanecem como estavam.

## Arquitetura constatada

| Área | Implementação atual |
| --- | --- |
| Framework | Next.js 16.3.8, App Router, React 18.3.1, TypeScript estrito |
| Banco | Supabase, PostgreSQL 17; acesso via supabase-js e RPCs SQL, sem ORM no fluxo comercial |
| Autenticação | Supabase Auth com SSR/cookies; `getAuth()` usa `auth.getUser()` no servidor; proxy renova sessão |
| Usuários | `public.profiles` vinculado a `auth.users`; e-mail, CPF, telefone e data; sem coluna de nome |
| Catálogo | `products`, versões em `product_files`, rascunho/publicação/arquivamento no painel existente |
| Pedidos | `orders` e `order_items`; preços, nomes e origem do arquivo preservados em snapshots imutáveis |
| Pagamento | Conferência manual pelo WhatsApp; confirmação administrativa atômica com status `CONFIRMADO` |
| Autorizações | `access_grants`, por item do pedido; estados `ATIVO`/`REVOGADO`; revogação e restauração auditadas |
| Administração | E-mail autorizado mais UUID administrativo privado; autorização efetiva em RPCs server-side |
| Testes | Node test runner + tsx + PGlite; mantidos, sem novo framework |

Não existe gateway/tabela `payments` nesse fluxo. `CONFIRMADO` é o estado existente
que autoriza a emissão; iniciar o WhatsApp não comprova pagamento. Há código legado
de inscrições com `@vercel/postgres`, sem participação no fluxo atual de PDFs; não
foi removido ou substituído.

Buckets reais: `teorema-pdfs` privado (PDFs), `teorema-uploads` privado (envios),
`teorema-covers` público (capas validadas). Nenhum bucket novo foi criado.

### Pesquisa dos pontos de segurança

- `lib/supabaseAdmin.ts`: cliente administrativo existente, marcado `server-only`,
  usa `SUPABASE_SERVICE_ROLE_KEY` exclusivamente no servidor. Foi reutilizado.
- `lib/library.ts`: o fluxo atual autoriza a compra e emite URL assinada do original
  privado por 60 segundos. Ele **não foi alterado** nesta etapa. Na Parte 3, essa
  entrega precisará ser substituída, mediante a autorização daquela etapa, pela
  geração e resposta server-side da cópia personalizada.
- `lib/admin-products.ts`: URLs assinadas para validação interna dos arquivos.
- `app/api/admin/products/[id]/uploads/[uploadId]/route.ts`: `getPublicUrl` é usado
  para a capa pública validada, não para o PDF original.
- `lib/orders.ts`, `lib/admin-commerce.ts` e RPCs existentes: compra, confirmação,
  autorização e revogação preservadas. Já existe rate limit persistente no banco.

## Modelo adicionado

`public.pdf_licenses`: `id`, `user_id`, `product_id`, `order_id`, `order_item_id`,
`license_code`, `status`, `created_at`, `updated_at`, `revoked_at`.

Decisões:

1. Um pedido pode conter vários PDFs. A unicidade é por **pedido + produto**,
   também protegida por `UNIQUE(order_item_id)`: uma licença por material comprado.
2. FKs vinculam a licença ao item, proprietário, produto, pedido e autorização
   original. O guard valida a correspondência exata do pedido com o item.
3. `license_code` tem formato `LIC-` + 32 caracteres hexadecimais, com 128 bits
   produzidos por `node:crypto.randomBytes`. Não inclui IDs, e-mail, CPF ou nome.
   É identificador público, **não é credencial para autorizar download**.
4. Identidade, código e origem são imutáveis. Histórico não pode ser apagado pelos
   papéis da aplicação. Datas e estado de revogação são controlados pelo banco.
5. Nome/e-mail não foram duplicados na licença. A licença permanece ligada ao
   produto, não a uma versão de arquivo, permitindo atualizações do mesmo material.
6. Emissão exige conta confirmada, não anônima/não banida, pedido `CONFIRMADO`
   e autorização `ATIVO` **do mesmo item**, não de outra compra.
7. `active`/`revoked` são estados exclusivos da licença: não substituem os estados
   dos pedidos ou das autorizações existentes.

## Concorrência e RLS

A RPC `teorema_get_or_create_pdf_license` roda como `SECURITY INVOKER`, com
`search_path` vazio, disponível somente para `service_role`. Reutiliza o helper
privado de elegibilidade e o advisory lock por proprietário já adotado pela compra
e revogação. A consulta da autorização bloqueia a linha durante a emissão.

Constraints únicas protegem requisições concorrentes independentemente do código
TypeScript. Repetições retornam a mesma licença sem trocar o código ou reativá-la.
Colisões aleatórias de códigos têm até três tentativas no repository.

RLS habilitada e forçada na nova tabela. `authenticated` lê somente suas licenças;
`anon` não lê/escreve; clientes não inserem, atualizam, apagam ou chamam a RPC.
Policies restritivas preservam essas restrições mesmo diante de futuras policies
permissivas excessivas. `service_role` tem apenas SELECT/INSERT/UPDATE.

Essas escolhas seguem as [orientações oficiais de RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
e o isolamento [server-only do Next.js](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning).

## Código e utilização futura

- `lib/pdf-licenses/code.ts`: geração do identificador opaco.
- `lib/pdf-licenses/types.ts`: tipos, contratos Zod e erros públicos controlados.
- `lib/pdf-licenses/repository.ts`: queries por proprietário e RPC de emissão.
- `lib/pdf-licenses/service.ts`: recebe somente pedido/produto, obtém o usuário
  da sessão validada e rejeita licença revogada.

Entradas server-side disponíveis: `findMyPdfLicense({ orderId, productId })` e
`ensureMyActivePdfLicense({ orderId, productId })`. Não foram conectadas a nenhuma
rota, componente, confirmação ou download existente. Não há emissão automática
nem backfill nesta etapa.

Na integração futura, licença ativa **não basta**: compra/autorização devem ser
revalidadas antes da entrega. Revogar autorização existente continua bloqueando
a emissão. A API atual ainda não utiliza o estado da nova licença.

## Arquivos criados

- `supabase/migrations/20261009225322_teorema_pdf_licenses.sql`
- `supabase/migrations/20261009225705_teorema_pdf_licenses_origin_index.sql`
- `supabase/verify-pdf-licenses.sql`
- Os quatro arquivos em `lib/pdf-licenses/` listados acima.
- `tests/pdf-licenses.test.ts`
- Este relatório.

Arquivos preexistentes modificados: **nenhum**. Dependências novas: **nenhuma**.
Variáveis novas necessárias nesta etapa: **nenhuma**; a geração aleatória dispensa
`PDF_LICENSE_SECRET`. `.env.local` não foi alterado. A exclusão de `.env.example`
encontrada antes do trabalho foi preservada e não entra no commit desta etapa.

## Verificação

Execute `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`.
O teste específico é `node --import tsx --test tests/pdf-licenses.test.ts`.
O arquivo `supabase/verify-pdf-licenses.sql` faz inspeção somente leitura no banco.

Cobertura: código aleatório, contratos, compra pendente/cancelada/de terceiros,
repetições paralelas, constraints únicas, identidade imutável, origem incorreta,
colisão de código, estado revogado, autorização revogada, conta não confirmada,
banida/anônima e isolamento RLS mesmo com permissões excessivas simuladas.
PGlite serializa as conexões de teste: o teste paralelo verifica idempotência e as
constraints, não simula várias conexões independentes de produção. A proteção
concorrente real é estabelecida pelo lock transacional e constraints PostgreSQL.

Resultados: **78 testes passaram, sem falhas** (10 da nova fundação), TypeScript,
lint e build de produção passaram. Nenhum pedido/aluno/material sintético foi
criado em produção.

A migração `20261009225322_teorema_pdf_licenses` foi aplicada e verificada no
projeto Supabase existente. O arquivo local foi alinhado à versão efetivamente
registrada pelo servidor. Uma migração complementar acrescenta o covering index
da FK composta; a primeira migração aplicada não foi reescrita. O histórico passou
a ter onze migrações. Conferência remota:
RLS habilitada/forçada, constraints e índices presentes, clientes sem escrita/RPC,
`SECURITY INVOKER` com `search_path` vazio e zero licenças (sem integração ainda).

Preservação confirmada por comparação antes/depois: definições das funções e
policies existentes têm os mesmos hashes; buckets e privacidade permaneceram
iguais. Contagens preservadas: 2 perfis, 4 produtos, 0 pedidos, 0 itens e 0 acessos.

## Dependências para as próximas partes — não implementadas

- Nome do aluno: não existe em `profiles`; será necessária uma escolha autorizada
  de como coletar/manter esse dado antes de personalizar PDFs com nome.
- A Parte 3 deverá substituir somente a entrega dos materiais protegidos; capas
  públicas e validação interna dos envios não devem ser alteradas indevidamente.
- Watermark, download personalizado, logs, limites, administração de licenças e
  criptografia ficam para as partes expressamente solicitadas.
- Avisos de segurança já existentes antes desta etapa: proteção contra senhas
  vazadas desativada no Auth e tabela privada `cart_operations` com RLS sem policy
  de cliente (acesso client-side intencionalmente negado). Nenhuma configuração
  de Auth foi alterada. [Referência para proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

O aviso de FK sem covering index identificado na verificação intermediária foi
resolvido pelo índice complementar, testado localmente antes da aplicação. A
verificação final não aponta FK sem índice; permanecem apenas avisos informativos
de índices ainda não utilizados. Nenhum índice preexistente foi removido.

A consulta direta de deploy pela integração Vercel continua retornando 403; a CLI
não possui credenciais e seu login automático foi interrompido. Não foram alterados
tokens, vinculações ou permissões. O estado da integração Git/Vercel será consultado
no GitHub após o push, sem confundir build local com deploy remoto.
