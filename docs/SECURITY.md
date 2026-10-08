# Autenticação, banco e operação

## Configuração atual
- NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: cliente público.
- SUPABASE_SERVICE_ROLE_KEY: somente servidor, usada após identidade verificada e autorização específica da operação.
- A autorização administrativa exige e-mail confirmado, conta não anônima e UUID elegível na tabela privada, validado por `teorema_admin_check`. E-mail ou metadados editáveis sozinhos não autorizam. Página e API de usuários usam a mesma regra.
- ADMIN_PASSWORD e o cookie teorema_admin_session não autorizam mais nenhuma operação.
- /api/admin/login, /logout e /registrations antigos retornam 410.
- /api/register foi convertido para criar conta Supabase; não grava mais em registrations.
- POSTGRES_URL e ENCRYPTION_KEY não são necessários ao site atual. Preserve a chave antiga se houver dados cifrados em registrations.

A API e as páginas protegidas verificam a identidade com getUser. As respostas de perfil/admin não são armazenadas em cache público.
A notificação de sessão no navegador só atualiza a interface; a autorização real ocorre no servidor.
Consulte a [documentação oficial de SSR do Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

Revisão de 07/10/2026 — etapa 9: Next.js corrigido para 16.3.8 e source-map-js para 1.2.2. `npm audit` sem vulnerabilidades nas versões instaladas nessa data; isso não substitui atualização contínua, revisão de código ou proteção da infraestrutura.

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
Produtos novos são rascunhos. Publicação exige PDF validado, capa válida e ação explícita; `is_active` acompanha o estado publicado. O banco, e não somente a interface, impede publicar material incompleto. Despublicar não revoga compras anteriores. O catálogo de produção exclui o prefixo reservado `[HOMOLOGACAO] ` após o deploy dessa revisão.
Política restritiva de perfil limita políticas SELECT antigas permissivas. Grants de mutação são revogados.
A service role ignora RLS; mantenha-a exclusivamente no servidor.
Referência: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Operações de carrinho
- `teorema_read_cart`/`teorema_sync_cart` e `teorema_create_order` são exclusivas do servidor. Writers legados foram retirados do fluxo e não devem ser reativados.
- UUID vem de `getUser()`, não do corpo. Origem exata, JSON com media type exato, corpo limitado e schemas estritos antes da escrita. Valores esperados pelo cliente são somente uma comparação com os preços recalculados no banco.
- Revisão do carrinho, trava por conta e chave idempotente protegem merge/remoção e pedido. Quantidade digital é 1; máximo de 50 materiais. Retentativas recuperam a mesma operação, inclusive após uma resposta perdida depois do commit.
- Registrar pedido não libera PDF. A mensagem do WhatsApp é editável; admin confere pedido salvo e pagamento fora do site antes da confirmação transacional de todos os itens.
- Confirmar/cancelar/revogar/reliberar exigem UUID administrativo privado; decisões têm auditoria e isolamento por conta. Escrita SQL privilegiada fora das RPCs continua sendo responsabilidade do operador.
- Carrinho/pedidos/biblioteca/download permanecem bloqueados em Production, mesmo com flags true. Só desenvolvimento ou Preview autorizado pode executar esse fluxo até o aceite de publicação.
- Referência: [Funções e permissões no Supabase](https://supabase.com/docs/guides/database/functions).

## Pedidos e PDFs — estrutura aplicada da etapa 2

A migração de pedidos, arquivos, acessos e auditoria foi aplicada no Supabase atual em 04/10/2026 após autorização; migração adicional cobre as três FKs compostas com índices. Clientes não executam suas RPCs nem gravam decisões. O servidor precisa validar `getUser()`, origem e corpo da requisição antes de usar a chave privada; IDs de cliente/operador nunca vêm do navegador. O smoke test de leitura passou na API real, sem criar contas/pedidos/arquivos.

O Supabase atual não concede leitura de `auth.users` a `service_role`. Uma única função privada `SECURITY DEFINER`, com proprietário `postgres`, `search_path` vazio, chamada restrita a service role e sem retorno de dados de Auth, verifica elegibilidade. Não expor `teorema_private` na Data API nem conceder leitura ampla de Auth para contornar erros. UUIDs administrativos são fixados na tabela privada; metadados editáveis não concedem acesso.

Uploads diretos usam reserva idempotente, staging privado e validação limitada de bytes por worker; extensão/MIME informados pelo cliente não são prova de segurança. PDFs validados ficam no bucket privado, fora de `public/` do Next.js. Capas são reprocessadas. Não representa antivírus ou DRM.

A biblioteca exige sessão confirmada e acesso ativo. Cada download revalida autorização e versão atual após inspecionar o objeto no Storage; tamanho/MIME/cache divergentes bloqueiam a assinatura. URL privada por 60 segundos, sem armazenamento em localStorage/sessionStorage, logs ou banco. Revogar impede novas URLs; não recolhe cópias nem invalida imediatamente uma URL já emitida. Atualizações do material estão incluídas, sem prazo automático de acesso. Evidências/limites: [etapa 8](ETAPA-8-BIBLIOTECA-DOWNLOAD.md) e [etapa 9](ETAPA-9-HOMOLOGACAO.md).

## Limites persistentes e HTTP

Migração `20261008024344_teorema_request_limits`: contador atômico privado por UUID/ação, compartilhado entre instâncias. Não guarda IP, payload, CPF ou token; no máximo seis linhas por conta. RPC `SECURITY INVOKER` com search_path vazio, somente service role; não amplia leitura de Auth. `supabase/verify-request-limits.sql` verifica RLS/grants/contrato sem retornar PII.

| Operação | Limite por conta |
| --- | --- |
| Biblioteca / leitura de carrinho | 120 por minuto para cada ação |
| Download | 20 por minuto |
| Alteração de carrinho | 60 por minuto |
| Criação/recuperação de pedido | 10 por 15 minutos |
| Reserva de upload administrativo | 30 por 15 minutos |

Resposta `429`, `Retry-After` e `no-store`; a tentativa pendente não é descartada. Falha do limitador fecha a operação com `503`, sem fallback em memória. Contadores saturam e a próxima janela reinicia o orçamento. Não é proteção DDoS, quota global de Storage ou solução antiabuso para contas em massa: Auth tem limites próprios; CAPTCHA, SMTP, alertas e camada de borda precisam de configuração antes da publicação.

Headers: `nosniff`, `DENY`/frame-ancestors, referrer `no-referrer`, Permissions-Policy e CSP com destinos restritos ao Supabase deste projeto e fontes utilizadas. Removido X-Powered-By. Rotas privadas e APIs recebem `X-Robots-Tag: noindex, nofollow, noarchive`; desenvolvimento/Preview recebem noindex global. Isso não substitui controle de acesso. CSP estática permite inline para o bootstrap do Next e o design existente; não prometer proteção equivalente a CSP estrita com nonce. Não definir domínio/canonical/HSTS por inferência. Verificar Vercel Toolbar/CSP no Preview real.

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
- Administrador confirmado e UUID elegível: consulta páginas de usuários/produtos/pedidos. Remover elegibilidade deve negar também leitura de dados pessoais.
- Produto salvo: fica como rascunho; só aparece após validar PDF/capa e publicar. Nada é tratado como compra paga sem confirmação explícita.
- Saída: testar em duas abas; falha de rede não deve anunciar saída concluída.
- Perfil ausente/RLS indisponível: exibir erro com opção de tentar novamente, sem loop de login.
- Signup: inválido bloqueado; válido com confirmação pendente não vai para carrinho.
- Execute scripts/check-supabase.mjs após aplicar SQL; teste os dois usuários com contas de teste autorizadas.
- Configure limites/CAPTCHA do Supabase conforme o tráfego. O site não usa rate limit em memória como proteção distribuída.

## Limites
Sem credencial SQL/Management ou sessão no Dashboard, a service role REST não permite auditar pg_policies nem executar migrações.
Testes locais cobrem PostgreSQL/RLS com auth simulada; Vercel, SMTP e sessões reais precisam de validação no ambiente de publicação.
Produtos, pedidos e downloads têm autorizações distintas; confirmar pagamento é procedimento humano externo ao site, não integração financeira automática.

Infraestrutura ainda pendente antes da publicação:
- Banco consultado em 07/10/2026: PostgreSQL 17.6. Supabase publicou correções em 17.11; planejar backup e janela de manutenção, pois atualização pode exigir indisponibilidade. Não executar pause/restore/upgrade pela autorização de migrações SQL. [Changelog oficial](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
- Advisor mantém aviso de proteção contra senhas vazadas desabilitada. Não contratar plano ou alterar configurações/segredos automaticamente. Revisar senha administrativa e MFA com o responsável. [Orientação oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Integração Vercel retorna 403 neste escopo. Push não comprova build/deploy bem-sucedido. Exige verificar projeto/deployment quando houver acesso.
- SMTP, recuperação de senha e confirmação no e-mail real ainda precisam de ensaio. Confirmar somente contas sintéticas de homologação pelo Admin API não comprova entrega de e-mail e nunca deve virar o fluxo de clientes.
- Snapshot DPAPI da etapa 2 não é backup completo de Auth/Storage. Preservar chaves históricas de `registrations`; dados cifrados não podem ser recuperados sem elas.
