# Nome do aluno

Complemento autorizado da fundação de PDFs protegidos. O nome canônico fica em
`public.profiles.full_name`, vinculado ao mesmo UUID de `auth.users`.

## Cadastro e perfil

- O formulário `/cadastro` exige **Nome completo** e envia `fullName` à API existente.
- A API valida o nome e envia `full_name` nos metadados do Supabase Auth.
- O trigger de criação de perfil copia o nome no mesmo INSERT de e-mail, CPF e telefone.
- Contas anteriores ficam com `NULL`: nenhum nome é inferido de e-mail ou CPF.
- O titular pode completar ou corrigir o nome em **Minha conta**, em `/perfil`.
- A grafia e os acentos são preservados. Unicode é normalizado para NFC; espaços
  nas extremidades e espaços repetidos são normalizados. O nome admite letras,
  espaços, ponto, apóstrofo e hífen, com 2 a 150 caracteres. Não comprova identidade civil.

## Segurança

`PATCH /api/profile` aceita exclusivamente `{ "fullName": "João da Silva" }`.
O proprietário vem de `getAuth()` / `auth.getUser()`, nunca do corpo da requisição.
O endpoint exige conta confirmada, origem do próprio site, JSON e corpo limitado.
A RPC `teorema_update_profile_name` é SECURITY INVOKER e executável somente por
`service_role`; reutiliza a checagem de conta confirmada, não anônima e não banida.

Não há nova permissão de edição direta para clientes. O navegador pode ler
somente o próprio perfil, inclusive `full_name`, pelas políticas RLS existentes.
O cliente administrativo continua exclusivamente server-side. Respostas têm
`Cache-Control: private, no-store`; erros não expõem SQL ou credenciais.

## Migração e compatibilidade

Migração nova `teorema_profile_full_name`:

1. Confere os triggers e os corpos conhecidos das funções de criação de perfil;
   lógica personalizada inesperada interrompe a transação em vez de ser substituída.
2. Acrescenta coluna nullable, constraint e normalização do nome.
3. Estende apenas o INSERT das duas funções conhecidas de criação de perfil,
   preservando nomes de triggers, dono, ACL, CPF/telefone e tratamento de conflito.
4. Concede SELECT somente dessa coluna a `authenticated`, mantendo as políticas.
5. Acrescenta a RPC server-side limitada à atualização do nome.

Não modifica registros existentes, licenças, pedidos, produtos, pagamentos,
Storage, flags comerciais ou segredos. O cadastro do cliente antigo permanece
compatível com nome ausente durante a transição de deploy. Não há índice de nome:
as consultas continuam usando a chave primária do perfil.

## Uso futuro no PDF

O backend de personalização deverá ler `profiles.full_name` da conta autenticada,
sem duplicar o nome em `pdf_licenses` e sem aceitar nome do cliente na requisição
de download. Esta entrega **não** altera o download atual, não gera watermark e
não inicia a Parte 2. A exigência de completar o nome antes de gerar uma cópia
personalizada será integrada na etapa correspondente.

## Verificação

```powershell
npm run typecheck
npm run lint
npm test
npm run build
# Com PLAYWRIGHT_MODULE apontando para a instalação existente:
node scripts/check-cart-browser.mjs
```

Os testes de nome cobrem acentos/NFC, entradas inválidas, proteção de identificadores,
contas antigas, cadastro atômico nos dois triggers conhecidos, RLS e negação da RPC
para clientes e contas inelegíveis. O ensaio de navegador usa apenas transporte,
contas e banco locais sintéticos; valida o nome após salvar e recarregar, as outras
informações intactas, CSRF/IDOR e layouts de 320, 390, 768 e 1440 pixels.

Para verificar a coluna sem expor dados pessoais:

O script `supabase/verify-profile-name.sql` também confere RLS, constraint, RPC e
privilégios de leitura/escrita, sem retornar informações pessoais.

```sql
select count(*) as total,
       count(full_name) as com_nome,
       count(*) filter (where full_name is null) as aguardando_nome
from public.profiles;
```

## Resultado da entrega — 09/10/2026

- Migração `20261009233158_teorema_profile_full_name` aplicada e verificada no
  projeto `urgzsaftoiebsjkgyhsg`.
- Duas contas anteriores preservadas; ambas aguardando preenchimento do nome.
  Comparação dos dados anteriores e das políticas RLS antes/depois sem diferenças.
- Trigger real `on_auth_user_created` preservado; dono, ACL e search_path das
  funções existentes preservados. Leitura restrita ao proprietário e RPC privada
  verificadas no banco real. Não foram criadas nem editadas contas reais no ensaio.
- TypeScript, lint e build aprovados. Suíte completa: **88 testes aprovados**.
- Ensaio local de navegador aprovado: cadastro, nome persistido após recarga,
  proteção contra identidade forjada/origem externa, responsividade e regressões
  de carrinho, pedidos, administração e biblioteca, sem erros de execução no browser.
- Nenhuma dependência ou variável de ambiente acrescentada.
- A auditoria manteve somente os avisos anteriores: diário privado sem políticas
  de leitura (negação intencional) e proteção contra senhas vazadas desativada no Auth.
  Esta entrega não altera essa configuração de autenticação. Referências:
  [aviso RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  e [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

O primeiro ensaio de navegador excedeu o timeout esperando `load` na navegação
inicial, apesar da resposta HTTP 200. O teste passou a aguardar `domcontentloaded`
e a prontidão funcional dos controles. A repetição completa passou; não houve
alteração da aplicação para contornar esse timeout.
