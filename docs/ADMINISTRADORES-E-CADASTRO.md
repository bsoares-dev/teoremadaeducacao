# Administradores e cadastro

## Acesso administrativo

A autorização é o UUID ativo em `teorema_private.commerce_admins`, conferido
por `teorema_admin_check` no servidor. Não existe mais a restrição de um único
e-mail no código. Nenhum e-mail, atributo do perfil ou `user_metadata` concede
privilégios por si só. O administrador original permanece autorizado.

É possível preparar o acesso antes do primeiro login. Prepare a conta pela
API administrativa oficial do Supabase e envie o convite, confira o UUID e o e-mail retornados e adicione
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

O script `node scripts/invite-admins.mjs EMAIL_AUTORIZADO=UUID_RESERVADO ...` exige as
credenciais server-side locais já existentes, o projeto correto, a tela publicada
e confirmação de e-mail ativa. Executar envia e-mails: não repita sem conferir o
estado da conta. Ele não imprime tokens nem atribui privilégios automaticamente.

### Exceção controlada para CPF e telefone

A migração `20261011190826_teorema_controlled_admin_profiles.sql` acrescenta somente
reservas privadas em `teorema_private.admin_profile_invitations` e adapta o validador.
A migração complementar `20261011191357_teorema_admin_profile_api_order.sql` respeita a ordem real
de `createUser`: o Supabase grava `app_metadata` após o INSERT, na mesma transação.
Uma constraint trigger privada, diferida até o COMMIT, exige o marcador confiável
antes de permitir a conclusão. Falha reverte conta, perfil e consumo da reserva.
Os alunos continuam obrigados a informar CPF válido e telefone. Os gatilhos Auth,
perfis, pedidos, licenças e administrador original não são substituídos.

Procedimento operacional, somente após autorização explícita:

1. Confira que não existe conta com o endereço autorizado; não sobrescreva contas.
2. Gere um UUID v4 aleatório por pessoa e reserve esse UUID e o endereço exato na
   tabela privada usando a conexão administrativa do banco. A reserva expira em
   uma hora se não utilizada. Não inclua esses dados em migrations versionadas.
3. Execute o script com os pares autorizados. Ele usa `auth.admin.createUser`
   com esse UUID, e-mail não confirmado e marcador em `app_metadata`, sem definir
   senha compartilhada. Em seguida usa `inviteUserByEmail` uma única vez.
4. O gatilho existente cria o perfil: a exceção exige simultaneamente reserva
   válida, UUID, e-mail e marcador server-side; registra o provisionamento na mesma
   transação. Ausências viram `NULL`, nunca CPF/telefone fictício. Dados informados
   continuam validados. `user_metadata` e endereço isolado não habilitam a exceção.
5. Confira UUID, perfil e convite no banco, e a entrega no Resend. Só então
   acrescente o UUID a `commerce_admins`. A reserva não concede admin por si só.
6. O destinatário aceita o convite e define sua senha; até confirmar a identidade,
   os guards administrativos continuam negando acesso.

Reservas não possuem FK para `auth.users` porque precedem a criação oficial da
conta. Depois de utilizadas, são registros de auditoria vinculados ao UUID e a
dispensa dos identificadores persiste para esse perfil. Nenhum cliente pode ler
ou escrever reservas; `service_role` tem apenas leitura, não pode autoprovê-las.
Somente o gatilho já existente, executado como proprietário, consome uma reserva.
O verificador diferido é `SECURITY DEFINER` apenas para ler Auth e a reserva privada
ao final da transação; está em schema privado, com `search_path` vazio e sem
permissão de execução para clientes ou `service_role`. Não é um endpoint público.

Se houver falha ou tempo limite no envio, confira conta e entrega antes de repetir.
O script interrompe ao primeiro erro e recusa contas já convidadas ou confirmadas.
Não exclua contas para repetir o processo. Nenhum endpoint público de matrícula
administrativa foi criado; não existe promoção automática por e-mail ou metadados.

Execute `supabase/admin-profile-verify.sql` na conexão administrativa para conferir
RLS, grants e identificadores: todos os contadores técnicos devem retornar zero.
O relatório legado `supabase/verify.sql`, anterior à exceção, pode contar esses
perfis sem CPF/telefone como legado inválido; não preencha dados fictícios para
zerá-lo. A verificação específica distingue as dispensas autorizadas.

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
- A tabela de papéis administrativos já existe; somente a exceção de perfis
  utiliza a nova migração, sem alterar dados antigos.
- A confirmação geral permanece ligada até concluir o primeiro acesso dos convidados.

### Conferência anterior à exceção em 11/10/2026

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

### Conferência da exceção controlada em 11/10/2026

- As duas migrações acima foram aplicadas ao projeto existente; o histórico local
  usa os mesmos identificadores retornados pelo Supabase. Não há migrations antigas reescritas.
- As duas contas explicitamente autorizadas foram preparadas pela API Auth,
  convidadas e registradas como administradoras por UUID. Resend confirmou entrega
  de ambos os e-mails. Não há senhas compartilhadas, dados fictícios ou privilégio
  derivado de endereço/user_metadata.
- Conta, perfil e consumo da reserva são transacionais; falha anterior de criação
  foi revertida antes do envio. O teste reproduz INSERT → app_metadata UPDATE → COMMIT.
- `admin-profile-verify.sql`: seis verificações técnicas com zero pendências.
  RLS permanece ativa e nenhuma função privada nova é executável por clientes.
- Conferência real de `teorema_admin_check`: administrador original autorizado;
  as duas contas ainda não confirmadas retornam 42501, apesar do papel já registrado.
  Isso é esperado até os proprietários aceitarem os convites.
- `npm test`: 148 aprovados, zero falhas; TypeScript, lint, build e varredura de
  credenciais no frontend aprovados. Não houve mudança visual ou de dependências.
- Nenhum link de convite real foi aberto ou resgatado durante os testes. A aceitação,
  a definição das senhas e a conferência visual do primeiro acesso cabem aos convidados.
- Confirmação de e-mail geral continua ativa enquanto esses primeiros acessos estão
  pendentes. SMTP, DNS, secrets, dados anteriores e travas comerciais foram preservados.
- Advisors de segurança continuam somente com os dois avisos preexistentes acima;
  nenhuma nova advertência após as migrações.
