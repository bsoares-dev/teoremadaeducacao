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
As migrações-base `20261004005128`, `20261004005139` e `20261004005326` já estão registradas no projeto remoto. Os arquivos em `supabase/migrations/` agora correspondem ao histórico remoto; scripts manuais anteriores foram preservados em `supabase/legacy/` e não devem ser aplicados.
Use `supabase/verify.sql` para verificar a base. O passo a passo e os limites estão em [docs/BANCO-DE-DADOS.md](docs/BANCO-DE-DADOS.md).
O arquivo `supabase/schema.sql` representa apenas o cadastro legado e é mantido para recuperação.
As correções foram aplicadas ao projeto Supabase remoto em 04/10/2026 UTC. Consulte docs/BANCO-DE-DADOS.md para o histórico, verificação e pendências de configuração Auth.

## Venda de PDFs — execução por etapas

[Plano numerado](docs/PLANO-VENDA-PDFS.md): etapa 1 aprovada; etapa 2 modelada/testada localmente e em validação para homologação real, sem aplicação remota. [Modelagem, contratos, Storage e recuperação](docs/ETAPA-2-BANCO-PDFS.md).
A nova migração `20261004235755_teorema_pdf_orders_access.sql` ainda não está aplicada no Supabase. Não executar scripts de criação antigos nem `db reset` em produção. Homologação isolada e publicação exigem autorização; o fluxo atual da aplicação permanece inalterado.

## Testes de banco
Os testes criam um PostgreSQL em memória (PGlite) com fixtures sintéticas de auth.users.
Validam isolamento, grants por coluna, preservação do trigger/dados existentes, CPF, preços, RPCs exclusivas do servidor, rollback de carrinho e a nova estrutura de pedidos/acessos/arquivos privados.
Não substituem a verificação do schema/triggers reais e o fluxo de e-mail em produção.
