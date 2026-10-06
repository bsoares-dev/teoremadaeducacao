# Etapa 5 — carrinho funcional e continuidade de autenticação

06/10/2026 (São Paulo). Implementação validada localmente; migração **aplicada e verificada no Supabase remoto** após autorização do responsável. EM VALIDAÇÃO integrada: o ensaio real de upload/publicação da etapa 3 permanece adiado. Nenhuma mensagem, compra ou liberação real executada. Commit/push autorizados para entrega; o deploy automático não equivale à homologação comercial.

## Entrega

- `/carrinho`: lista responsiva, remover PDF, total, continuar escolhendo, estados vazio/carregando/erro, perfil e logout. Identidade azul/bege do Teorema.
- Carrinho OPEN por conta, uma unidade por PDF, no máximo 50 itens. Recarregar ou sair não apaga os itens persistidos.
- A seleção do visitante atravessa login/cadastro/retorno de confirmação. Destino interno passa pela allowlist `safeNext`; confirmação não é simulada no aplicativo.
- Mesclagem por união: não substitui carrinho existente. Só retira da seleção local IDs aceitos pelo servidor. Excedentes, indisponíveis e já adquiridos são apresentados com opção explícita de descarte.
- Preço atual, disponibilidade e aquisição são revalidados no servidor. Mudanças de preço mostram valor anterior/atual. Itens indisponíveis ou já adquiridos ficam visíveis para remoção e não entram no total.
- Vitrine mostra a união da seleção local com os itens salvos; item persistido leva a “Gerenciar no carrinho”.
- “Continuar para o pedido” permanece desabilitado com aviso de prévia. A etapa 6 é que integrará pedido persistido e WhatsApp. Carrinho não concede acesso a PDF.

## Backend e proteção

`GET /api/cart` e `POST /api/cart` usam sessão validada por `auth.getUser()`, exigem e-mail confirmado e rejeitam Auth anônimo. A identidade não vem do payload. Respostas privadas/no-store; POST exige mesma origem, JSON limitado e schema estrito.

Cliente envia apenas `operationId`, `cartId`, `revision`, `addIds`, `removeIds`. Preço, quantidade e userId são rejeitados. RPCs exclusivas de service role, chamada somente no servidor; o navegador não recebe credenciais nem caminhos de arquivos privados. URLs de capas passam pela allowlist do bucket público do próprio projeto.

Migração `20261006155743_teorema_cart_sync.sql` (nome alinhado à versão registrada remotamente):

- Acrescenta revisão e unicidade de um carrinho OPEN por usuário, constraint de uma unidade e diário privado de operações.
- `teorema_read_cart`: snapshot de leitura; não cria carrinho nem altera preços. Total em centavos calculado por SQL com preços atuais e apenas itens disponíveis. `cart_items.unit_price` conserva referência anterior; `carts.total_amount` continua soma dessa referência e **não** é preço de checkout. Etapa 6 deve usar RPC transacional de pedido, que revalida preços.
- `teorema_sync_cart`: lock por usuário compatível com checkout/confirmação, revisão otimista, bloqueio de produtos em ordem determinística e merge transacional.
- Mesmo UUID + mesmo payload retorna resultado recuperável e o carrinho atual, sem reaplicar mutações nem ressuscitar itens removidos. Reutilização com outro payload é negada; revisão antiga retorna conflito.
- Diário privado guarda somente IDs/metadados da operação; não guarda CPF, telefone, tokens ou links assinados. Não há limpeza automática nesta etapa: definir retenção operacional antes da publicação sem quebrar a janela de retry.
- Escritores antigos `teorema_set_cart_item`/`teorema_prepare_cart` deixam de ser executáveis pela service role, evitando quantidades múltiplas ou status comercial sem pedido.
- Aborta sem mudar dados se encontrar carrinhos OPEN duplicados, quantidade diferente de 1 ou mais de 50 itens. Corrigir dados legados exige análise e autorização própria; não apagar carrinhos para contornar o pré-check.

## Retomada e abas

Antes do POST, o navegador persiste operação em `sessionStorage`, chave `teorema:cart-pending:v1:<userId>`. Uma resposta perdida pode significar gravação concluída: a mesma operação é reenviada, nunca um novo UUID para uma tentativa ambígua. Falha preserva seleção e diário; recarregar a aba permite retomar. Fechar a aba encerra seu sessionStorage, mas a união posterior continua sem duplicar PDFs no banco.

Após confirmação de sucesso, limpa apenas IDs aceitos da seleção versionada da etapa 4. Web Locks serializa essa limpeza onde suportado. Mudanças de seleção entre abas e foco atualizam o carrinho. Revisão no banco impede sobrescrita concorrente; conflito pede atualização/retry. Não usa Realtime/polling. Sem Web Locks, localStorage mantém a limitação de última gravação já documentada na etapa 4. Sem armazenamento, não envia uma mutação que não consiga registrar para recuperação.

## Ativação e rollout

1. Revisar migração e precondições; preservar backup. Não colar sobre SQL antigo nem reaplicar migrações já registradas.
2. No projeto atual, a migração já foi aplicada: não reaplicar. Em outro ambiente aprovado, aplicar somente pendências e conferir histórico, grants e invariantes.
3. Configurar URL/chave pública e service role somente no servidor do ambiente escolhido.
4. Em desenvolvimento ou Vercel Preview, habilitar ambas: `TEOREMA_CATALOG_SELECTION_ENABLED=true` e `TEOREMA_CART_ENABLED=true`.
5. Testar com dois clientes e um material realmente publicado; retomar upload/capa da etapa 3 antes de alegar integração remota completa.

As flags não habilitam seleção/carrinho em Production. Não afrouxar essa trava até pedido/WhatsApp, homologação e aceite. Reversão conservadora: desligar flags; manter restrições seguras do banco. Não restaurar permissões de escrita direta do cliente.

## Evidências e limites

- `npm test`: 54 testes passaram, incluindo contratos, SQL das migrações, RLS, preço alterado, isolamento, limite de 50, retry sem ressurreição e rollback de legado incompatível.
- `scripts/check-cart-browser.mjs`: Next real + SQL das migrações/RPCs reais em PGlite isolado. Somente transporte Auth/REST é simulado, com identidades fictícias. Nunca usa `.env.local` para acesso ao banco real nos testes.
- Ensaio de navegador aprovado: seleção → links de login/cadastro → login → merge → recarga → resposta perdida após commit → retry → preço atualizado → indisponibilidade/remoção → logout/login → segunda conta isolada → sessão encerrada → callback de confirmação. Payload adulterado negado. Nenhum erro JavaScript não tratado; 503 é injetado deliberadamente para testar recuperação. A criação/envio real de e-mail não está coberta por esse ensaio.
- Responsivo sem overflow em 320/390/768/1440 px; capturas de celular/desktop inspecionadas. O teste aguarda hidratação dos formulários e a conclusão da leitura do carrinho, não apenas HTML inicial.
- Build de produção, TypeScript e lint passaram.
- Playwright/Edge disponíveis no runtime local; `PLAYWRIGHT_MODULE` pode indicar instalação existente. Capturas em `.data/cart-check`, fora do Git.
- PGlite não substitui concorrência entre conexões PostgreSQL reais, emissão/entrega de e-mail real, Supabase Auth hospedado ou configuração de Vercel. Esses ensaios continuam pendentes; nenhuma conta real foi criada.

## Aplicação remota — 06/10/2026

- Autorização: ao terminar cada etapa, validar, aplicar suas novas migrações, conferir e fazer commit/push. Não autoriza avançar etapas, excluir dados ou habilitar fluxo comercial incompleto.
- Pré-check: zero carrinhos/itens; zero duplicidades, quantidades incompatíveis ou excesso; histórico anterior com seis migrações conferido. Alteração estrutural transacional, sem reescrever dados pessoais; não foi necessário exportar registros de carrinhos vazios.
- Nova versão registrada: `20261006155743`, `teorema_cart_sync`. Arquivo local renomeado para evitar reaplicação duplicada; conteúdo funcional mantido.
- Pós-check: contagens preservadas; índice de carrinho OPEN único presente; diário privado com RLS; anon/authenticated sem SELECT no diário nem EXECUTE da mutação; service role com leitura/mutação novas e sem escritor legado.
- Advisor: nenhuma falha nova de acesso. INFO de RLS sem políticas no diário privado é intencional (somente service role; não criar política pública). Permanece aviso já conhecido de proteção contra senhas vazadas desabilitada, sem mudança de plano/configuração: [orientação do Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Flags de produção e variáveis da Vercel não foram alteradas. Homologação com contas e material reais continua pendente.

Próxima etapa de desenvolvimento: **6 — pedido e encaminhamento ao WhatsApp**, por comando do responsável.
