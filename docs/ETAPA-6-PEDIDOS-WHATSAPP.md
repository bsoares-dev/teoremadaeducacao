# Etapa 6 — pedido persistido e atendimento pelo WhatsApp

07/10/2026 (São Paulo). Implementação em desenvolvimento/Preview; EM VALIDAÇÃO integrada. A homologação com material e contas reais permanece pendente. Esta etapa não altera as flags de produção nem confirma pagamento.

## Fluxo entregue

1. No carrinho, “Revisar pedido” abre um diálogo com todos os itens e seus valores.
2. “Registrar pedido e falar no WhatsApp” envia o resumo revisado ao backend autenticado.
3. O banco verifica a conta, a seleção, os preços, a disponibilidade e os arquivos privados. Mudança em qualquer preço exige nova revisão, mesmo que o total seja igual.
4. Pedido e snapshots dos itens são gravados na mesma transação. Uma chave por tentativa e a unicidade por carrinho impedem duplicação.
5. O navegador abre o WhatsApp oficial com código, títulos, preços e total. O cliente ainda precisa enviar a mensagem.
6. `/pedidos/[id]` mostra o resumo salvo, status e ações para retomar ou copiar a mensagem. `/pedidos` lista apenas os pedidos da própria conta.

Mensagem para `+5548935011911`. A composição usa o snapshot do pedido, não os valores atuais da vitrine. Títulos têm caracteres de controle/formatação removidos na mensagem. Nenhum CPF, telefone pessoal, senha, caminho privado ou token é enviado. Para links acima do orçamento conservador de 1.800 caracteres, a mensagem informa código, quantidade e total, explicando que os itens completos estão salvos. Não é uma afirmação sobre limite oficial do WhatsApp.

## Recuperação e proteção

- `POST /api/orders`: identidade validada com `auth.getUser()`, conta confirmada e não anônima, mesma origem, corpo JSON limitado, schema estrito e resposta privada/no-store. Campos de identidade, status ou liberação fornecidos pelo cliente são rejeitados.
- O resumo inclui o UUID da tentativa, o carrinho e os preços em centavos aceitos visualmente; são expectativas para comparação, nunca autoridade de preço.
- RPC `teorema_create_order`: acesso exclusivo do servidor, locks e constraints existentes. Só marca o carrinho após concluir a transação. O estado legado `SENT_TO_WHATSAPP` significa preparação do pedido; não comprova envio de mensagem.
- Diário por conta em `sessionStorage` gravado antes da requisição. Resposta perdida preserva a mesma tentativa; reload/retry resolve o pedido antes de tentar mesclar seleção em outro carrinho.
- Conflito transacional confirmado pelo servidor descarta a tentativa e exige atualização/revisão. Erro ambíguo preserva o diário. Sem armazenamento, não inicia a operação.
- Popup bloqueado ou falha de abertura mantém a página do pedido como alternativa. Cópia sem permissão de clipboard mostra campo selecionável.
- Leitura pelo cliente usa sua sessão e RLS, além de filtro de titularidade. Pedido alheio retorna 404. Código não concede autorização. Rotas privadas têm noindex e refresh de sessão; login preserva destinos internos permitidos.
- `GET /api/admin/orders`: contrato de listagem paginada, filtro por código, email administrativo validado no servidor e UUID administrativo privado conferido por RPC. Dados retornados limitados ao resumo e identificador da conta. A interface de gestão/detalhes e ações administrativas ficam para a etapa 7.
- Registrar pedido mantém `AGUARDANDO_CONFIRMACAO`; não cria acesso a arquivos.

## Banco remoto

A estrutura da migração `20261005004458_teorema_pdf_orders_access.sql` já fornece pedidos, snapshots, políticas e criação transacional; a migração de carrinho `20261006155743` usa locks compatíveis. O histórico e a existência/permissões da RPC foram inspecionados remotamente nesta etapa. Nenhuma nova migração necessária; não reaplicar versões antigas. Não foram criados pedidos ou contas de teste no Supabase de produção.

## Verificação

`npm test`: 56 testes aprovados, cobrindo contratos, sanitização/resumo da mensagem, input adulterado, snapshots imutáveis, idempotência, alterações compensadas de preço, isolamento e ausência de liberação antes da confirmação. `scripts/check-cart-browser.mjs` aprovado com carrinho → revisão → API → SQL real das migrações em PGlite isolado, com Auth/REST simulados: conflito de preço, resposta perdida após commit, recuperação do mesmo pedido, popup bloqueado, link correspondente ao snapshot, histórico próprio, pedido alheio e listagem administrativa. Responsividade verificada em 320/390/768/1440 px, sem overflow nem exceção JavaScript não tratada. Os HTTP 409/503 são falhas injetadas deliberadamente e o 404 valida o isolamento. Capturas em `.data/order-check`, fora do Git.

Ensaios reais de Supabase Auth, concorrência entre conexões, abertura do aplicativo no dispositivo, upload/publicação e homologação completa permanecem nas etapas correspondentes e 9. O ensaio local não envia mensagem nem realiza pagamento. Produção continua protegida até integração e aceite comercial.

Consulta remota final: RPC de criação presente, execução permitida à service role e negada a authenticated; zero pedidos reais, preservados. Nenhuma alteração remota foi necessária.

Lint, TypeScript e build de produção aprovados; capturas desktop/celular inspecionadas. Para repetir o ensaio no Windows, o script encerra a árvore de processos do seu próprio servidor Next. O cache local antigo do OneDrive precisou ser regenerado; nenhum arquivo de aplicação ou dado remoto foi removido.

Próxima etapa: **7 — painel de pedidos, confirmação de compra e controle de acessos**, mediante comando do responsável.
