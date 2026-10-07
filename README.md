# Teorema da Educação

Next.js + TypeScript + Supabase Auth/Postgres. O estilo usa CSS do projeto (não há Tailwind instalado).

## Desenvolvimento
1. `npm ci`.
2. Copie as chaves de `.env.example` para `.env.local`.
3. `npm run dev`.

## Verificações
- `npm run lint`
- `npm run typecheck`
- `npm test`: regras de acesso, validações e migração em PostgreSQL local descartável.
- `npm run build`
- `node scripts/check-supabase.mjs`: inspeção remota somente leitura, sem retornar dados pessoais.
- `npm run start -- --port 3100` e depois `node scripts/check-http.mjs`: bloqueios HTTP e formulário inválido, sem criar contas.

## Fluxos
- Home: institucional e contato pelo WhatsApp. O formulário de leads foi removido.
- /cadastro: valida CPF/telefone/senha na interface e API. Usa Supabase Auth.
- /auth/callback e /auth/confirm: confirmação e sessão.
- /login: vai ao perfil (ou admin autorizado); aceita apenas destinos internos permitidos.
- /perfil, /admin, /carrinho, /pedidos: autenticação validada no servidor.
- /admin: listagem de usuários e nova gestão de produtos/PDFs preparada localmente. Ativação depende da migração, buckets e variável servidor; ver etapa 3. Cadastro antigo que publicava sem PDF desativado.
- /materiais: produtos do banco, consultas paginadas, compra assistida via WhatsApp.
- /carrinho: carrinho persistido por conta e revisão do pedido em prévia controlada; produção mantém o estado vazio protegido.
- /pedidos e /pedidos/[id]: histórico e resumo persistido, com retomada do atendimento pelo WhatsApp. Liberação de PDFs será integrada nas próximas etapas.

## Banco / publicação
Leia [docs/SECURITY.md](docs/SECURITY.md) antes de publicar.
Execute `supabase/audit.sql` e revise triggers/políticas atuais.
As migrações-base `20261004005128`, `20261004005139` e `20261004005326` já estão registradas no projeto remoto. Os arquivos em `supabase/migrations/` agora correspondem ao histórico remoto; scripts manuais anteriores foram preservados em `supabase/legacy/` e não devem ser aplicados.
Use `supabase/verify.sql` para verificar a base. O passo a passo e os limites estão em [docs/BANCO-DE-DADOS.md](docs/BANCO-DE-DADOS.md).
O arquivo `supabase/schema.sql` representa apenas o cadastro legado e é mantido para recuperação.
As correções foram aplicadas ao projeto Supabase remoto em 04/10/2026 UTC. Consulte docs/BANCO-DE-DADOS.md para o histórico, verificação e pendências de configuração Auth.

## Venda de PDFs — execução por etapas

[Plano numerado](docs/PLANO-VENDA-PDFS.md): etapa 1 aprovada; estrutura da etapa 2 aplicada no Supabase atual em 04/10/2026, após autorização explícita. [Modelagem, contratos, Storage, evidências e recuperação](docs/ETAPA-2-BANCO-PDFS.md).
Migrações `20261005004458_teorema_pdf_orders_access.sql`, `20261005004940_teorema_commerce_fk_indexes.sql` e `20261005235705_teorema_admin_product_uploads.sql` já registradas remotamente: não reaplicar nem executar `db reset` em produção. `node scripts/check-commerce.mjs` verifica a API somente leitura. [Etapa 3](docs/ETAPA-3-PRODUTOS-PDFS.md): painel/upload implementados; três buckets criados e verificados no Supabase atual. Após configuração manual de `TEOREMA_PRODUCT_UPLOADS_ENABLED=true` e chave administrativa na Vercel, o responsável demonstrou gravação de rascunho. Upload/capa/publicação reais foram adiados. A integração Vercel permanece com 403.

[Etapa 4](docs/ETAPA-4-CATALOGO-SELECAO.md): vitrine publicada, capas otimizadas e seleção de PDFs implementadas em prévia. `TEOREMA_CATALOG_SELECTION_ENABLED=true` habilita a seleção somente em desenvolvimento local ou Vercel Preview, nunca Production. `node scripts/check-catalog-browser.mjs` verifica a interface com fixtures locais (requer Playwright e Edge; `PLAYWRIGHT_MODULE` permite usar uma instalação existente).

[Etapa 5](docs/ETAPA-5-CARRINHO.md): carrinho por conta, mesclagem após autenticação, preços do servidor e recuperação idempotente. Migração `20261006155743_teorema_cart_sync.sql` aplicada e verificada no Supabase em 06/10/2026. Requer `TEOREMA_CART_ENABLED=true`, além da flag da etapa 4, somente em desenvolvimento/Preview. `node scripts/check-cart-browser.mjs` verifica navegador → API → SQL real em PGlite isolado, com Auth/REST simulados.

[Etapa 6](docs/ETAPA-6-PEDIDOS-WHATSAPP.md): revisão explícita, pedido transacional, recuperação após falha e mensagem baseada nos títulos/preços registrados. Usa a RPC da etapa 2 já aplicada; não há nova migração. Histórico privado e contrato de listagem administrativa disponíveis em prévia. Homologação real, confirmação administrativa e biblioteca/download permanecem nas próximas etapas.

## Testes de banco
Os testes criam um PostgreSQL em memória (PGlite) com fixtures sintéticas de auth.users.
Validam isolamento, grants por coluna, preservação do trigger/dados existentes, CPF, preços, RPCs exclusivas do servidor, rollback de carrinho e a nova estrutura de pedidos/acessos/arquivos privados.
Não substituem a verificação do schema/triggers reais e o fluxo de e-mail em produção.
