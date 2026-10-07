# Etapa 7 — administração de pedidos e acessos

07/10/2026 (São Paulo). Implementação em desenvolvimento/Preview; EM VALIDAÇÃO integrada. Autorizada com “inicie a etapa 7”. Não habilita vendas em produção nem implementa a biblioteca/download da etapa 8.

## Fluxo entregue

No `/admin`, a aba **Pedidos e acessos** aparece somente quando a prévia do carrinho está habilitada. Mantém as áreas existentes de usuários e produtos.

- Pedidos: busca por código completo, e-mail completo, status e intervalo de datas; páginas de 20 registros, com desempate por UUID.
- Detalhes: cliente, títulos/preços registrados no momento do pedido, total, estado, responsáveis e datas. O pedido salvo é a referência; a mensagem recebida pelo WhatsApp é editável e não comprova pagamento.
- “Confirmar compra e liberar materiais”: diálogo com todos os itens, cliente, total e confirmação obrigatória de que o pagamento e o pedido foram conferidos fora do site. A RPC confirma e libera todos os PDFs juntos, em uma transação.
- “Cancelar pedido”: disponível para pedido pendente, exige motivo de 5 a 1.000 caracteres e preserva o histórico. Não libera PDFs.
- Acessos: lista cliente, material, pedido de origem, estado, administrador e data da última liberação; filtros por cliente, estado e datas.
- “Revogar acesso” e “Reliberar acesso”: decisões por autorização de origem, sempre com motivo e auditoria. Outra compra válida do mesmo material mantém a autorização efetiva; a interface explica essa situação.
- Histórico paginado do pedido e de suas autorizações: confirmação, cancelamento, revogação e nova liberação, com ator, data, material e motivo quando aplicável. Despublicar produto não remove acesso já comprado.

Datas usam São Paulo; início inclusivo e fim exclusivo no dia seguinte. No filtro de acessos, a data corresponde à última liberação, não à revogação. Busca por cliente usa e-mail exato normalizado; não faz busca parcial por CPF ou nome.

## Segurança e recuperação

`GET /api/admin/orders`, `GET/POST /api/admin/orders/[id]` e `GET /api/admin/access` compartilham o controle de acesso: prévia autorizada, identidade verificada no servidor, e-mail administrativo permitido e UUID ativo na lista privada, conferido por `teorema_admin_check`. O navegador não fornece o ator da decisão nem recebe credenciais administrativas.

POST exige mesma origem, JSON limitado e schema estrito. Uma mudança de acesso deve pertencer ao cliente e ao item do pedido informado; autorizações de outro pedido são rejeitadas. As respostas são privadas/no-store; o painel tem noindex. Consultas usam projeções explícitas e não retornam caminhos privados, tokens, URLs assinadas ou CPF nas novas áreas de pedidos/acessos.

As RPCs existentes `teorema_confirm_order`, `teorema_cancel_order` e `teorema_set_access_state` validam a administração novamente no banco. Locks e constraints asseguram atomicidade e idempotência. Confirmar novamente não duplica autorizações nem reativa um acesso revogado posteriormente.

O navegador grava a decisão antes do POST em um diário de `sessionStorage`, isolado por administrador. Revogação/reliberação têm UUID próprio. Uma resposta ambígua preserva a mesma tentativa, bloqueia novas decisões e permite consultar o pedido ou recuperar o resultado após reload. Repetir um UUID antigo não reaplica a alteração depois de uma decisão mais recente. Diário ilegível bloqueia novas decisões; não é descartado silenciosamente.

Sem conseguir gravar o diário, o cliente não inicia o POST. Erros explícitos de entrada, vínculo ou conflito transacional descartam a tentativa; erro de conexão/503 ou sessão/permissão preserva-a. Troca de abas administrativas é bloqueada durante a requisição. Fechar a aba encerra o `sessionStorage`: depois disso, consultar estado e histórico antes de emitir outra decisão. O diário não é um backup persistente do histórico do banco.

## Banco remoto

Não há nova migração necessária. A migração `20261005004458_teorema_pdf_orders_access.sql`, já aplicada, contém tabelas, índices, autorizações privadas, auditoria e RPCs transacionais desta etapa. O histórico remoto foi conferido; não reaplicar migrações antigas nem executar reset.

Consulta somente leitura confirmou execução das quatro RPCs administrativas permitida à `service_role` e negada a `authenticated`/`anon`. Contagens finais: zero pedidos, zero autorizações e zero eventos administrativos comerciais em produção, preservados. Nenhuma confirmação, cancelamento, revogação, liberação, mensagem ou pagamento real foi executado nesta etapa.

Filtros de cliente/código, relações e autorização efetiva aproveitam índices existentes; enriquecimento de usuários é agrupado. A autorização efetiva consulta cada par cliente/produto com limite 1, evitando falsos negativos por truncamento de lotes no Data API. A paginação numerada usa offset; avaliar cursor e índices adicionais com volume real na etapa 9, sem prometer custo constante em páginas profundas.

## Verificação

- `npm test`: 58 testes aprovados, incluindo contratos estritos, confirmação explícita, motivos, ator adulterado, datas/filtros, transações, rollback integral, isolamento, retries, origens múltiplas e auditoria.
- `scripts/check-cart-browser.mjs`: navegador → API → SQL das migrações em PGlite isolado, Auth/REST simulados. Verifica confirmação com checkbox, resposta perdida após commit e recuperação após reload, duas requisições de confirmação sem duplicação, todos os PDFs para a conta correta, revogação/reliberação, acesso preservado após despublicação, filtros, página vazia, cancelamento pela interface com motivo obrigatório, ator/origem/vínculo indevidos, noindex e bloqueio por diário corrompido.
- Layout verificado em 320/390/768/1440 px, sem overflow de página nem exceções JavaScript não tratadas. Capturas desktop/celular em `.data/admin-commerce-check`, fora do Git, revisadas visualmente.
- Lint, TypeScript e build de produção aprovados. Nenhuma dependência nova foi instalada.

O banco local serializa transações: duas requisições HTTP em paralelo não substituem um ensaio com conexões concorrentes de PostgreSQL real. Auth real, upload/publicação de PDF, homologação integrada e medição com volume permanecem pendentes. HTTP 400/403/404/409/503 dos casos negativos e falhas injetadas são intencionais. O teste encerra somente a árvore do seu próprio servidor temporário e informa falha de limpeza, evitando deixá-lo silenciosamente ativo.

Próxima etapa: **8 — biblioteca e entrega privada dos PDFs**, por comando do responsável. Flags comerciais de produção permanecem restritas até integração e aceite.
