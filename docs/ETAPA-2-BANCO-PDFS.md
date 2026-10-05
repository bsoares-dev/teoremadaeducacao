# Etapa 2 — pedidos, arquivos privados e acessos

## Estado e escopo

Atualizado em 04/10/2026. Estado: EM VALIDAÇÃO. Modelagem, migração e testes locais entregues; homologação isolada autorizada pelo responsável, ainda pendente de definição do ambiente. Criação de novo projeto não confirmada: responsável solicitou explicar alternativas sem recurso remoto novo. Nenhuma alteração remota, bucket, endpoint ou tela foi realizada nesta etapa. Commit/push da preparação local também autorizados; não representam aplicação da migração nem homologação concluída.

Inspeção somente leitura do projeto `urgzsaftoiebsjkgyhsg`: um perfil, nenhum produto/carrinho/item, nenhum bucket e nenhuma tabela `orders`. A conta administrativa canônica existe e está confirmada. Isso descreve a inspeção, não garante que o estado remoto continuará igual.

Foram recuperadas as três versões do histórico remoto e seus SQLs, sem reaplicá-los:

1. `20261004005128_teorema_accounts_catalog_security.sql`.
2. `20261004005139_teorema_carts_security.sql`.
3. `20261004005326_teorema_catalog_policy_cleanup.sql`.

Os dois arquivos manuais anteriores foram preservados em `supabase/legacy/`, fora da pasta executável de migrações. Eles não são novas migrações e não devem ser aplicados por cima da base atual.

Nova migração local: [20261004235755_teorema_pdf_orders_access.sql](../supabase/migrations/20261004235755_teorema_pdf_orders_access.sql), gerada com `supabase migration new` (CLI 2.119.0). Uma transação, timeout de trava de 5 s e de execução de 120 s. Não é um script de reaplicação manual: executar uma vez, controlado pelo histórico.

## Modelo

| Relação | Responsabilidade | Acesso do cliente |
| --- | --- | --- |
| `profiles`, `products`, `carts`, `cart_items` | Base existente preservada | Regras anteriores mantidas |
| `orders` | Código, cliente, carrinho de origem, total BRL e decisão administrativa | Leitura de colunas seguras dos próprios pedidos |
| `order_items` | Nome/preço no momento do pedido, uma unidade, versão histórica | Leitura dos próprios itens, sem identificação do arquivo privado |
| `product_files` | Versões imutáveis, tamanho, hash, validação e versão atual | Nenhum acesso direto |
| `access_grants` | Acesso por cliente/material/item de origem; ativo ou revogado | Leitura dos próprios estados, sem justificativas internas |
| `admin_audit_events` | Eventos administrativos imutáveis e idempotência | Nenhum acesso direto |
| `teorema_private.commerce_admins` | UUIDs administrativos autorizados | Nenhum acesso; servidor somente lê |

Os vínculos compostos impedem ligar um acesso ao cliente/produto errado. Uma versão atual por produto; uma origem de acesso por item; um pedido por carrinho e por chave de idempotência do cliente. Índices cobrem proprietários, status/data, FKs e busca por material/versão.

As exclusões são restritas para preservar compras e auditoria. Apagar uma conta com histórico poderá ser bloqueado; anonimização/retenção e atendimento à exclusão precisam de procedimento próprio antes da publicação, não de `ON DELETE CASCADE` que apague compras silenciosamente.

## Estados e invariantes

- Pedido: `AGUARDANDO_CONFIRMACAO` → `CONFIRMADO` ou `CANCELADO`. Não reabrir nem editar snapshots históricos.
- Acesso: `ATIVO` ↔ `REVOGADO`, com motivo, operador e evento. Sem prazo automático.
- Valores: `numeric(12,2)`, BRL; servidor busca preços no catálogo. Preços esperados enviados pela interface servem apenas para detectar mudanças, nunca para gravar o preço.
- Limites técnicos: 1–50 PDFs por pedido, quantidade exatamente 1, preço por item positivo e até R$ 1.000.000. Não são uma política comercial de preços.
- Confirmar libera todos os itens em uma transação. Verificação diferida impede commit de pedido vazio, total divergente ou confirmação parcial.
- Repetir criação/confirmar não duplica pedidos, acessos ou auditoria. Nova chave com o mesmo carrinho retorna o pedido original; mesma chave com outro carrinho é rejeitada.
- Operações de revogação/restauração têm UUID próprio: repetir uma ação antiga não desfaz uma decisão posterior.
- Outra origem legítima de acesso ao mesmo material continua válida quando uma origem é revogada.
- Produto despublicado não remove autorização já concedida. Downloads resolvem a versão atual validada, preservando a referência histórica da compra.
- Carrinho marcado `SENT_TO_WHATSAPP` significa preparado para atendimento, não mensagem enviada ou pagamento. Registrar pedido não concede nenhum acesso.

## Contratos do servidor

Todas as RPCs públicas novas são `SECURITY INVOKER`, `search_path=''`, executáveis apenas por `service_role`. O cliente não grava pedidos, arquivos, acessos ou decisões diretamente.

| RPC | Entradas | Resultado |
| --- | --- | --- |
| `teorema_create_order` | `p_user_id`, `p_cart_id`, `p_idempotency_key` UUID; `p_expected_total` numeric; `p_expected_prices` JSON `{product_uuid: preço}` | UUID do pedido com snapshot e carrinho fechado |
| `teorema_confirm_order` | `p_actor_id`, `p_order_id` UUID | UUID confirmado; todos os acessos e um evento |
| `teorema_cancel_order` | `p_actor_id`, `p_order_id` UUID; `p_reason` texto | UUID cancelado e evento, sem acesso |
| `teorema_set_access_state` | `p_actor_id`, `p_grant_id` UUID; `p_state`; `p_reason`; `p_operation_id` UUID | UUID do acesso, alteração e evento idempotentes |
| `teorema_resolve_pdf` | `p_user_id`, `p_product_id` UUID | Metadados privados da versão atual, somente para o servidor autorizado |

`p_user_id` e `p_actor_id` devem vir exclusivamente de `auth.getUser()` validado no servidor. Não aceitar UUID de cliente/operador no corpo da requisição. Separar o cliente SSR de sessão do cliente service role sem cookies de usuário; validar origem, corpo e limites contra abuso nos futuros endpoints. Nunca transmitir a chave privada ao navegador.

`resolve_pdf` não gera link nem faz download. Na etapa 8, o backend validará a sessão e emitirá URL assinada curta, com resposta privada/sem cache. Não devolver seu resultado bruto à interface, não guardar caminhos/URLs assinadas em logs.

### Validação de Auth sem abrir `auth.users`

A inspeção real confirmou que `service_role` não tem `SELECT` em `auth.users`. Não foi concedida essa permissão ampla.

A única exceção `SECURITY DEFINER` é `teorema_private.commerce_assert_user(uuid)`: proprietário `postgres`, caminho de busca vazio, execução negada a `PUBLIC`, `anon` e `authenticated`, e conferência de que o papel invocador é `service_role`. Apenas aceita ou rejeita uma conta com perfil, e-mail confirmado, não excluída, não anônima e não banida; não retorna campos de Auth nem altera dados.

Não incluir `teorema_private` nos schemas expostos da Data API. O servidor chama a RPC pública, que usa esse helper internamente. A administração usa UUID autorizado na tabela privada, nunca `user_metadata`, e-mail editável do perfil ou decisão do navegador. A migração fixa apenas a conta canônica existente e elegível; se ausente, falha fechada sem administrador genérico. Provisionar outro UUID administrativo exige operação privilegiada revisada, não um formulário público.

RLS, grants de coluna e políticas restritivas isolam clientes mesmo diante de políticas permissivas antigas. A credencial service role é uma fronteira de confiança e ignora RLS: operações manuais privilegiadas fora dos contratos ainda são responsabilidade do operador.

## Storage planejado — ainda não provisionado

| Bucket | Visibilidade | Limites iniciais | Caminho |
| --- | --- | --- | --- |
| `teorema-pdfs` | Privado | 20 MiB (20.971.520 bytes), `application/pdf` | `products/{product_uuid}/{file_uuid}.pdf` |
| `teorema-covers` | Público, somente imagens de vitrine | 5 MiB, JPEG/PNG/WebP | Chaves geradas pelo servidor na etapa 3 |

Criar/configurar por Dashboard ou Storage API após autorização e revisão de custos, não inserindo manualmente em `storage.buckets`/`storage.objects` em produção. As inserções nas fixtures são apenas simulações locais.

A política restritiva bloqueia leitura/listagem/upload/alteração/exclusão pelos papéis de cliente nos dois buckets, sem afetar outros buckets. GET de capa pelo URL público funciona pela visibilidade do bucket. PDF só será servido por acesso temporário autorizado do backend.

A migração aborta se o bucket de PDFs já for público; criação de pedidos/confirmação/resolução falham sem bucket privado e objeto da versão validada. `VALIDATED`/hash na tabela não são antivírus nem inspeção de conteúdo. Validação real de bytes, extensão, assinatura, MIME, arquivo suspeito e integridade é responsabilidade da etapa 3. Arquivos antigos não são sobrescritos ou excluídos automaticamente.

Publicação/despublicação/troca de versão na etapa 3 deve bloquear o produto em transação antes dos arquivos, na mesma ordem de UUID usada pelo checkout, e auditar a decisão. Não publicar um upload incompleto. As travas de checkout/decisões usam a mesma chave por cliente e bloqueios de linhas; ainda será necessário testar concorrência real em múltiplas conexões.

As funções genéricas de carrinho anteriores aceitam 1–1000 unidades; ficam preservadas para compatibilidade. O novo checkout rejeita qualquer quantidade diferente de 1. Na etapa 5, adaptar a seleção/UI e essas funções por uma nova migração. Não usar `teorema_prepare_cart` antes de `teorema_create_order`, pois a primeira fecha o carrinho sem criar pedido.

## Evidências locais

`tests/commerce-database.test.ts` executa as migrações reais em PostgreSQL PGlite descartável, com fixtures sintéticas de Auth/Storage e dois clientes. Não cria contas reais, não envia mensagens e não consulta dados pessoais.

- Testes cobrem snapshots, total exato e alterações individuais de preço, conta pendente/banida, cliente errado, acesso direto negado, permissões privadas, bucket público, arquivos ausentes/maiores/inválidos, versões, confirmação integral, cancelamento, revogação e retries antigos.
- Auth é reproduzido sem grant de leitura para service role; metadados de administrador falsificados não autorizam.
- `supabase/verify-commerce.sql` contém 14 verificações agregadas de segurança, integridade, operação e configuração. Executar como auditor `postgres` no SQL Editor, somente após a nova migração. Controles técnicos devem retornar zero; configuração do bucket/admin é identificada separadamente.
- Execuções: `npm test` (24 testes), `npm run lint`, `npm run typecheck` e `npm run build`.

PGlite não reproduz REST/PostgREST, Storage HTTP, URLs assinadas, Auth real ou concorrência entre várias conexões. Estes testes não representam aprovação de produção. Homologar também o caminho `service_role` → RPC → helper privado em um Supabase real isolado, sem conceder leitura ampla a Auth para contornar falhas.

Advisor remoto conhecido: proteção contra senhas vazadas desativada. Não foi alterado plano, cobrança ou configuração Auth. Resolver/reavaliar conforme disponibilidade do plano antes da publicação; não é corrigido por este SQL.

## Homologação, aplicação e recuperação

1. Obter autorização e identificar ambiente isolado/custos. Conferir que os comandos apontam para ele, não para produção. Não executar `db reset`/fixtures contra projeto remoto.
2. Exportar backup privado de dados e estrutura (incluindo histórico de migrações, grants, políticas, funções e triggers). Guardar fora do Git, com acesso restrito. Banco não é backup dos bytes de Storage: exportar também arquivos quando existirem. Ensaiar restauração isolada. O snapshot estrutural antigo não substitui esse backup.
3. Conferir a base e o histórico com `supabase migration list`. No projeto atual, as três primeiras já estão aplicadas: não reenviar nem reparar versões à cegas. Em ambiente novo, preparar Auth/Storage do Supabase e reproduzir a base na ordem documentada.
4. Revisar a nova migração completa. Aplicar somente `20261004235755` por mecanismo de migrações autorizado. Nenhuma substituição do SQL antigo ou exclusão de tabelas é necessária.
5. Provisionar/configurar os dois buckets pela API/Dashboard autorizados. Revisar visibilidade, tamanho e MIME. Não adicionar políticas permissivas de PDF para clientes.
6. Executar `verify.sql` (base) e `verify-commerce.sql` (nova estrutura) no ambiente escolhido. Usar apenas agregados para compartilhar resultados. Ensaiar clientes/admin sintéticos e API real; testar concorrência, falhas/retries, upload e download nas etapas correspondentes.
7. Registrar evidências, aprovação da homologação e configuração pendente. Produção continua sem essas mudanças até autorização própria e etapa 10.

Falha antes do commit: a transação desfaz esta migração; se a sessão permanecer abortada, `ROLLBACK` e investigar. Timeout não justifica remover constraints ou grants. Se o histórico remoto indicar aplicada, não reaplicar manualmente.

Depois de aplicada: interromper o fluxo novo, preservar tabelas/arquivos/auditoria e corrigir por migração adiante. Rollback do aplicativo não deve remover proteções. Não há `down` automático com `DROP TABLE`: pedidos novos podem existir. Restauração completa só com aprovação, backup conferido e ensaio de recuperação, pois pode perder alterações posteriores. Nunca voltar às políticas permissivas antigas para fazer a interface funcionar.

## Próximo marco

Homologação real autorizada fecha a etapa 2. A etapa 3 acrescentará painel/upload e validação real de arquivos; etapas 5–8 ligarão estas funções ao fluxo comercial. Não há venda, pedido pelo WhatsApp ou biblioteca novos funcionando no site nesta entrega.

### Continuação autorizada

O responsável autorizou homologação separada e commit/push. A descoberta pelo conector encontrou apenas `teoremadaeducacao` (produção) e nenhuma branch de desenvolvimento. Há uma organização disponível: `code.commerce.contato@gmail.com's Org`. O responsável escolheu essa organização e o conector informou US$ 0/mês para um projeto no plano Free. Ao solicitar confirmação de criação, o responsável pediu explicação e alternativa sem novo banco remoto; nenhum projeto foi criado. É possível usar stack Supabase local isolada (Docker), sem recurso na organização, ou manter o aceite de modelagem/testes locais separado da homologação integrada. Não afirmar que Auth/PostgREST/Storage reais foram homologados apenas por passar em PGlite. A autorização de homologação não autoriza migração em produção ou contratação paga automática.

Revalidação antes do commit: 24 testes, lint, tipos e build aprovados. Não foram encontradas alterações de código da aplicação nesta preparação. Push pode acionar automações já existentes no repositório; não configurar nova automação de migrações nem deploy manual neste escopo.

Referências: [funções e privilégios](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [buckets privados](https://supabase.com/docs/guides/storage/buckets/fundamentals) e [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
