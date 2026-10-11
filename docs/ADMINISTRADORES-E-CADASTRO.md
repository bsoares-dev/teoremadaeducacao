# Administradores e cadastro

## Acesso administrativo

A autorização é o UUID ativo em `teorema_private.commerce_admins`, conferido
por `teorema_admin_check` no servidor. Não existe mais a restrição de um único
e-mail no código. Nenhum e-mail, atributo do perfil ou `user_metadata` concede
privilégios por si só. O administrador original permanece autorizado.

É possível preparar o acesso antes do primeiro login. Crie a conta pelo
convite oficial do Supabase, confira o UUID e o e-mail retornados e adicione
somente esse UUID à tabela privada. Nunca insira diretamente em `auth.users`,
crie uma senha compartilhada ou vincule automaticamente novos cadastros por e-mail.

O convite leva a `/auth/ativar`: o proprietário aceita o convite recebido em sua
caixa de e-mail e define a própria senha. A sessão é conferida pela API Auth;
tokens do fragmento são removidos da URL e não são registrados. Reabrir a página
com uma sessão válida é permitido. A tela não concede privilégios.

Após login ou definição de senha, `/auth/destination` consulta a autorização
no servidor e encaminha para `/admin` ou `/perfil`, com resposta privada sem cache.
A área do aluno mostra o atalho administrativo somente após a mesma consulta.
Todas as APIs e RPCs administrativas existentes preservam suas verificações.

O script `node scripts/invite-admins.mjs EMAIL_AUTORIZADO ...` exige as
credenciais server-side locais já existentes, o projeto correto, a tela publicada
e confirmação de e-mail ativa. Executar envia e-mails: não repita sem conferir o
estado da conta. Ele não imprime tokens nem atribui privilégios automaticamente.

Para suspender alguém, altere somente `is_active=false` na tabela privada,
identificando previamente o UUID correto. Não apague a conta ou seu histórico.

## Cadastro dos alunos sem confirmação

Decisão do responsável: manter Supabase Auth, login com e-mail e senha e remover
somente a confirmação de e-mail no cadastro dos alunos.

**Não desative a confirmação geral enquanto houver convites administrativos
pendentes.** O cadastro sem confirmação assume a propriedade do endereço; um
cadastro público não pode ser usado para ativar privilégios de uma conta pendente.
Primeiro confira que os administradores convidados aceitaram o convite e definiram
as senhas. Depois, no painel do Supabase:

1. Authentication → Sign In / Providers → Email.
2. Mantenha o provedor Email ativo e desative apenas **Confirm email**.
3. Salve. Não altere SMTP, troca segura de e-mail, recuperação ou permissões.
4. Confira `/auth/v1/settings`: `mailer_autoconfirm=true`.
5. Teste um cadastro sintético autorizado: a API `/api/register` já aceita a
   sessão imediata e o frontend já encaminha sem exigir confirmação.

Não se apaga a tela antiga de confirmação: ela continua necessária para links
já emitidos e para operações de identidade. Desligar a confirmação reduz a prova
de propriedade de e-mails de alunos e aumenta o risco de endereços incorretos e
cadastros falsos. Licenças, pedidos e acesso aos PDFs continuam vinculados ao UUID.
Novos administradores exigem um provisionamento controlado separado; nunca
atribua admin automaticamente pelo e-mail de um cadastro público.

Referências: [configuração Auth](https://supabase.com/docs/guides/auth/general-configuration),
[convites](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).

## Validação

- Testes de autorização por UUID, múltiplos administradores, confirmação, revogação,
  acesso privado e impedimento de autopromoção.
- Testes de sessão de convite, token inválido/expirado, conta anônima e senha.
- TypeScript, lint, suíte existente, build e checagem de secrets no frontend.
- Não é necessária migração: a tabela privada e os controles já existem.
- A confirmação geral permanece ligada até concluir o primeiro acesso dos convidados.

### Conferência em 11/10/2026

- `npm run typecheck`, `npm run lint` e `npm run build`: aprovados.
- `npm test`: 146 testes aprovados, zero falhas.
- `scripts/check-build-secrets.mjs`: 30 assets de cliente conferidos sem credenciais privadas.
- Build servido localmente: `/auth/ativar` responde 200 e `noindex`; não aparece
  no sitemap. `/auth/destination`, `/admin` e `/perfil` encaminham visitantes sem
  sessão ao login. `/api/admin/products` responde 401 privado. A API antiga de
  registrations continua desativada (410), sem alteração.
- Supabase: confirmação ainda ativa, RLS administrativa ativa e clientes sem
  permissão de leitura/escrita na lista privada. Administrador original preservado.
- Resend: domínio de envio verificado, envio habilitado e rastreamento de clique
  desativado. A aceitação dos convites e a definição de senha dependem dos donos
  das caixas; não são simuladas com as contas reais.
- Controle de navegador indisponível nesta sessão: o primeiro acesso visual com
  uma conta real ainda precisa ser confirmado pelos convidados. Os testes de
  sessão, as páginas/headers HTTP e os guards SQL foram conferidos separadamente.
- Sem alteração de schema, dependências, SMTP, secrets, DNS ou travas comerciais.
- Advisors mantêm avisos anteriores: [proteção de senhas vazadas desabilitada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
  e [RLS sem policy em journal privado](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
  Nenhum upgrade ou abertura de acesso foi realizado.
