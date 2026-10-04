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
- /perfil, /admin, /carrinho: autenticação validada no servidor.
- /admin: e-mail administrativo confirmado, listagem paginada e inclusão de produtos.
- /materiais: produtos do banco, consultas paginadas, compra assistida via WhatsApp.
- /carrinho: estado vazio protegido. Pagamento, pedidos e liberação de PDFs ainda não implementados.

## Banco / publicação
Leia [docs/SECURITY.md](docs/SECURITY.md) antes de publicar.
Execute `supabase/audit.sql` e revise triggers/políticas atuais.
Execute, nessa ordem, `supabase/migrations/20261003_accounts_catalog.sql` e `supabase/migrations/20261003_carts.sql`.
Depois execute `supabase/verify.sql`. O passo a passo e os limites estão em [docs/BANCO-DE-DADOS.md](docs/BANCO-DE-DADOS.md).
O arquivo `supabase/schema.sql` representa apenas o cadastro legado e é mantido para recuperação.
As correções foram aplicadas ao projeto Supabase remoto em 04/10/2026 UTC. Consulte docs/BANCO-DE-DADOS.md para o histórico, verificação e pendências de configuração Auth.

## Testes de banco
Os testes criam um PostgreSQL em memória (PGlite) com fixtures sintéticas de auth.users.
Validam isolamento, grants por coluna, preservação do trigger/dados existentes, CPF, preços, RPCs exclusivas do servidor e rollback de carrinho.
Não substituem a verificação do schema/triggers reais e o fluxo de e-mail em produção.
