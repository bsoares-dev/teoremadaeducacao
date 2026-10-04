# Autenticação, banco e operação

## Configuração atual
- NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: cliente público.
- SUPABASE_SERVICE_ROLE_KEY: somente servidor, usada após verificar a sessão e o e-mail administrativo confirmado.
- A autorização administrativa está centralizada em lib/auth-policy.ts.
- ADMIN_PASSWORD e o cookie teorema_admin_session não autorizam mais nenhuma operação.
- /api/admin/login, /logout e /registrations antigos retornam 410.
- /api/register foi convertido para criar conta Supabase; não grava mais em registrations.
- POSTGRES_URL e ENCRYPTION_KEY não são necessários ao site atual. Preserve a chave antiga se houver dados cifrados em registrations.

A API e as páginas protegidas verificam a identidade com getUser. As respostas de perfil/admin não são armazenadas em cache público.
A notificação de sessão no navegador só atualiza a interface; a autorização real ocorre no servidor.
Consulte a [documentação oficial de SSR do Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## Aplicação da migração
1. Obtenha backup/snapshot do banco e execute supabase/audit.sql (somente estrutura, sem dados pessoais).
2. Confira os tipos de id (UUID), created_at (timestamp) e preço (numeric). Guarde definições de triggers/políticas.
3. Execute supabase/migrations/20261003_accounts_catalog.sql e depois supabase/migrations/20261003_carts.sql no SQL Editor, em consultas separadas. Só prossiga se a anterior terminar com sucesso.
4. A migração é transacional e repetível; não apaga tabelas, usuários, produtos nem registros históricos.
5. Preserva triggers INSERT existentes que referenciem profiles. Se houver um trigger INSERT desconhecido, aborta para revisão.
6. Confirme manualmente que o trigger preservado usa new.id, new.email, raw_user_meta_data.cpf e raw_user_meta_data.phone.
7. Apenas perfis ausentes com metadados válidos são preenchidos. Contas sem CPF/telefone válidos continuam ativas; a interface informa perfil pendente.
8. Não habilite escrita direta de profiles/products/carts/cart_items pelo navegador. O novo cadastro acontece pelo trigger; produtos passam pela API administrativa.
9. Execute supabase/verify.sql. Os controles técnicos devem ter zero pendências; registros antigos inválidos são preservados e precisam de revisão manual. Veja docs/BANCO-DE-DADOS.md.

A migração normaliza/valida CPF e telefone em novas escritas de profiles. Não corrige dados inválidos existentes silenciosamente.
RLS permite ao aluno consultar apenas o próprio perfil e carrinhos/itens. Somente produtos com is_active=true são públicos.
Produtos cadastrados no painel são publicados imediatamente. Produtos existentes com is_active=false ou NULL continuam ocultos.
Política restritiva de perfil limita políticas SELECT antigas permissivas. Grants de mutação são revogados.
A service role ignora RLS; mantenha-a exclusivamente no servidor.
Referência: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Operações de carrinho
- Funções teorema_get_or_create_cart, teorema_set_cart_item e teorema_prepare_cart são SECURITY INVOKER e executáveis apenas por service_role (além do proprietário do banco).
- O backend deve obter p_user_id exclusivamente de getUser(), validar origem/corpo da requisição e só então usar a service role. Nunca aceite user_id, preço, total ou status do navegador.
- Alterações bloqueiam a linha do carrinho; adição busca produto ativo e preço no catálogo. Quantidade zero remove o item. Criação usa trava transacional por usuário.
- A preparação revalida os produtos/preços em uma transação e muda OPEN para SENT_TO_WHATSAPP. Falha em qualquer item desfaz toda a operação.
- SENT_TO_WHATSAPP significa preparação para atendimento; não comprova entrega de mensagem, pagamento ou autorização de download. Nenhuma dessas RPCs permite COMPLETED.
- Alterações feitas manualmente com SQL privilegiado ou service role fora dessas funções continuam sendo responsabilidade do operador. Essas credenciais ignoram RLS.
- As funções não são expostas por endpoints novos nesta alteração. A tela atual continua com compra assistida por WhatsApp; conectar uma interface de carrinho a essas funções é uma etapa separada.
- Referência: [Funções e permissões no Supabase](https://supabase.com/docs/guides/database/functions).

## Confirmação de e-mail
A confirmação permanece habilitada. A interface não anuncia login antes de existir sessão.
Configure o Site URL oficial no Supabase e adicione à allowlist:
- https://SEU-DOMINIO/auth/callback
- http://localhost:3000/auth/callback (desenvolvimento)
Se usar o template padrão, o callback PKCE exige o mesmo navegador que iniciou o cadastro.
Para confirmar em outro navegador, altere o template Confirm signup para:
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/carrinho`
Não use a chave service role para confirmar automaticamente contas de clientes.
Links inválidos/expirados voltam ao login com explicação.
Um e-mail já existente pode gerar resposta genérica por proteção contra enumeração; a tela orienta entrar com senha.

## Validação antes de publicar
- Anônimo: /perfil, /admin e /carrinho devem redirecionar; APIs privadas respondem 401.
- Aluno: lê só seu perfil, /admin negado, API administrativa 403, escrita direta em products/profiles negada.
- Administrador confirmado: consulta páginas de usuários/produtos e cria produto.
- Produto salvo: aparece no catálogo; nada é tratado como compra paga.
- Saída: testar em duas abas; falha de rede não deve anunciar saída concluída.
- Perfil ausente/RLS indisponível: exibir erro com opção de tentar novamente, sem loop de login.
- Signup: inválido bloqueado; válido com confirmação pendente não vai para carrinho.
- Execute scripts/check-supabase.mjs após aplicar SQL; teste os dois usuários com contas de teste autorizadas.
- Configure limites/CAPTCHA do Supabase conforme o tráfego. O site não usa rate limit em memória como proteção distribuída.

## Limites
Sem credencial SQL/Management ou sessão no Dashboard, a service role REST não permite auditar pg_policies nem executar migrações.
Testes locais cobrem PostgreSQL/RLS com auth simulada; Vercel, SMTP e sessões reais precisam de validação no ambiente de publicação.
Produtos, pedidos e downloads não compartilham autorização: pagamento/entrega será implementado separadamente.
