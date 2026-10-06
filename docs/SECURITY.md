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
3. A base remota já tem `20261004005128`, `20261004005139` e `20261004005326` aplicadas. Para reprodução em outro ambiente autorizado, use os arquivos correspondentes em `supabase/migrations/`, conferindo o histórico e a ordem. Não reaplique os scripts manuais em `supabase/legacy/` no projeto atual.
4. As migrações-base são repetíveis para recuperação técnica e não apagam tabelas, usuários, produtos nem registros históricos. A migração nova da etapa 2 é transacional, mas não de reaplicação manual: consulte [ETAPA-2-BANCO-PDFS.md](ETAPA-2-BANCO-PDFS.md).
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

## Pedidos e PDFs — estrutura aplicada da etapa 2

A migração de pedidos, arquivos, acessos e auditoria foi aplicada no Supabase atual em 04/10/2026 após autorização; migração adicional cobre as três FKs compostas com índices. Clientes não executam suas RPCs nem gravam decisões. O servidor precisa validar `getUser()`, origem e corpo da requisição antes de usar a chave privada; IDs de cliente/operador nunca vêm do navegador. O smoke test de leitura passou na API real, sem criar contas/pedidos/arquivos.

O Supabase atual não concede leitura de `auth.users` a `service_role`. Uma única função privada `SECURITY DEFINER`, com proprietário `postgres`, `search_path` vazio, chamada restrita a service role e sem retorno de dados de Auth, verifica elegibilidade. Não expor `teorema_private` na Data API nem conceder leitura ampla de Auth para contornar erros. UUIDs administrativos são fixados na tabela privada; metadados editáveis não concedem acesso.

Downloads exigirão validação de acesso ativo e geração de URLs temporárias na etapa 8. O banco prepara os controles, mas não substitui a validação de bytes do upload nem representa um fluxo de download já implementado. Homologação real e procedimento de backup estão no documento da etapa 2.

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
