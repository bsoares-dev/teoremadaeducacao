# Etapa 8 — biblioteca e download privado

07/10/2026 (São Paulo). Implementação entregue em desenvolvimento/Preview; EM VALIDAÇÃO integrada. Autorizada com “inicie a etapa 8”. Não ativa vendas/download em produção nem inicia a etapa 9.

## Experiência entregue

- `/meus-materiais`, vinculada ao perfil, histórico e detalhes de pedidos. Página privada e noindex, sessão acompanhada na interface e validada no servidor.
- Cards com título registrado na compra, capa pública permitida, pedido de origem e estados pendente, disponível ou revogado. Paginação de 20 materiais; um card por produto, sem duplicar origens de compra.
- Uma autorização ativa prevalece sobre outra compra revogada. Sem autorização ativa, um pedido pendente aparece como aguardando liberação; pedidos cancelados sem compra válida não entram na biblioteca.
- Apenas materiais ativos com arquivo atual validado e presente no bucket privado recebem botão de download. Despublicação do catálogo não remove acesso comprado. Versões anteriores são preservadas; compradores recebem a versão atual sem nova cobrança.
- Carregamento, vazio, atualização manual, indisponibilidade, erro de conexão e sessão encerrada. Clique repetido é bloqueado durante a preparação; requisição tem timeout e é abortada ao sair da tela.
- Download nativo do navegador, sem carregar um PDF inteiro em memória JavaScript. Não implementa visualizador embutido, DRM nem restrição de prazo automático de acesso.

## Contrato de segurança

`GET /api/library` aceita somente a paginação e usa a identidade obtida de `auth.getUser()` no servidor. A RPC exige conta confirmada, não anônima, não excluída e não bloqueada. O cliente não fornece o titular.

`POST /api/library/download` aceita apenas `{ productId }`, com UUID válido, mesma origem e JSON limitado. Não aceita usuário, preço, bucket, caminho ou nome de arquivo. Respostas privadas/no-store; o link não é persistido em tabelas, localStorage, sessionStorage ou estado React, nem registrado em logs da aplicação.

O servidor resolve a autorização pelo banco, verifica o caminho imutável e os metadados reais de Storage (tamanho, MIME e cache), consulta novamente o acesso/versão e só então assina o objeto. A entrega usa URL de **60 segundos**, nome de download higienizado e nonce de cache. O retorno deve pertencer ao Supabase configurado, ao bucket privado e ao produto/arquivo resolvidos; URLs arbitrárias são rejeitadas. Arquivo atualizado durante a preparação exige nova tentativa.

PDFs precisam estar com `max-age=0` ou `no-store`. O upload da etapa 3 já grava `cacheControl: "0"`. Objetos legados/adulterados com cache prolongado são bloqueados antes da assinatura: URLs em cache CDN podem sobreviver à expiração do token se o cache for maior. Conferir cabeçalhos reais e comportamento do CDN na homologação, não apenas a validade nominal do token.

URLs assinadas são credenciais temporárias de posse: quem recebe a URL pode usá-la durante sua validade, sem sessão. Revogação impede novas emissões, mas não recolhe arquivos baixados nem cancela necessariamente um link já emitido. Não prometer DRM, acesso vitalício ou impedir todo compartilhamento. A URL da página da biblioteca, por si só, não concede acesso a terceiros.

As flags existentes `TEOREMA_CATALOG_SELECTION_ENABLED=true` e `TEOREMA_CART_ENABLED=true` habilitam a biblioteca apenas em desenvolvimento ou Vercel Preview. Mesmo com ambas true, Production permanece bloqueado. Não foram alterados segredos, configurações Auth ou travas comerciais.

## Banco e operação

Migração `20261008020054_teorema_library_read.sql`, aplicada e registrada no projeto `urgzsaftoiebsjkgyhsg`: acrescenta somente a RPC de leitura paginada `teorema_read_library(uuid,integer)`. É SECURITY INVOKER, com search_path vazio e execução exclusiva de service_role. Não altera compras, dados pessoais, RLS, grants de tabelas, arquivos ou liberações existentes. O backend continua usando `teorema_resolve_pdf`, já aplicado na etapa 2.

Histórico remoto conferido antes/depois; arquivo local alinhado à versão remota. Execução confirmada para service_role e negada a authenticated/anon, cinco tabelas comerciais com RLS e bucket de PDF privado preservados. As 14 verificações agregadas de segurança/integridade/operação/configuração retornaram zero pendências. Contagens antes/depois idênticas: um perfil, um produto, zero carrinhos, pedidos, liberações e arquivos, e dois eventos administrativos já existentes. Não reaplicar migrações antigas, executar reset ou editar as permissões de Storage como atalho.

Recuperação: desabilitar a prévia/reverter a versão da aplicação caso necessário; a consulta nova é somente leitura e pode permanecer sem uso. Qualquer correção de schema deve entrar em nova migração, preservando o histórico registrado. Não apagar compras ou arquivos para recuperar a interface.

## Verificação

- 61 testes aprovados: contratos estritos, URLs/nomes seguros, estados da biblioteca, versão atual, objeto ausente, conta sem elegibilidade, múltiplas origens válidas, cancelamento, isolamento, negação de RPC para anon/authenticated e paginação com 21 produtos; regressões anteriores mantidas.
- `npm test` usa execução serial. A primeira execução paralela apresentou falha nativa de JIT/WebAssembly do Node 24.11.1 no Windows (`jit_page_->allocations_.erase`); a repetição serial passou. Não era uma assertion da aplicação. A serialização reduz concorrência do PostgreSQL de testes, sem mudar o runtime da aplicação nem instalar dependências.
- `scripts/check-cart-browser.mjs`: navegador → API → SQL/RLS das migrações em PGlite isolado, com transportes Auth/REST/Storage simulados. Inclui percurso das etapas 5–7 e biblioteca pendente/ativa/revogada, download efetivamente iniciado/concluído pelo navegador, troca de versão, arquivo ausente, cache inseguro, autorização revogada após renderizar o card, expiração do token, dois clientes, identidade/origem adulteradas e sessão encerrada. Não utiliza PDFs, pedidos ou mensagens reais.
- Layout em 320/390/768/1440 px sem overflow horizontal; capturas desktop/celular em `.data/library-check` revisadas visualmente e fora do Git. Nenhuma exceção JavaScript não tratada. As respostas negativas injetadas e aborts de navegação/download do navegador são esperados.
- Lint, TypeScript e build de produção aprovados. Smoke HTTP verificou áreas privadas, negação de cookies legados, validação/origem e biblioteca/download bloqueados mesmo com flags true em Production. O callback seguro preserva o destino interno existente; a assertion antiga do teste foi atualizada, sem mudar a autenticação.
- `scripts/check-commerce.mjs` passou contra a API real após a migração: RPC de biblioteca e contratos/permissões reais somente leitura, sem retornar dados pessoais nem criar pedidos/URLs.

## Pendências e próxima etapa

Auth real, upload/capa/publicação do material real e entrega pelo Storage/CDN reais continuam pendentes. A fixture de Storage reproduz o contrato de assinatura/expiração e permite testar a aplicação, mas não comprova o serviço/CDN remoto. Há zero pedidos/liberações/arquivos comerciais remotos no último levantamento. Não criar vendas ou liberações de produção só para simular homologação.

Advisor mantém o aviso conhecido de proteção contra senhas vazadas desabilitada e o informativo de RLS sem policy no diário privado de carrinho (nega clientes por projeto). Não houve contratação ou alteração de Auth.

Próxima etapa: **9 — homologação ponta a ponta e segurança**, somente por comando do responsável. Publicação comercial depende do aceite e da etapa 10.
