# Plano de execução — venda de PDFs com atendimento por WhatsApp

## Documento de referência

Versão 6, atualizada em 05/10/2026 (São Paulo). Status: etapas 1 e 2 CONCLUÍDAS quanto a experiência/modelagem/estrutura do banco; etapa 3 EM VALIDAÇÃO, com implementação testada e banco/Storage aplicados após autorização; etapas 4–10 PENDENTES. Ativação da variável na Vercel e ensaio real autenticado ainda pendentes: conexão Vercel retornou 403 no escopo do projeto. Não houve homologação isolada completa nem publicação do fluxo comercial.
Este documento é a referência para comandos como “faça a etapa 4”. Manter a numeração estável; registrar mudanças de escopo e decisões aqui.
O comando “faça a etapa 1” autorizou sua documentação e seus wireframes locais. Não altera aplicação, banco, Storage, Vercel ou autoriza publicação de recursos.

## Objetivo confirmado pelo cliente

Visitante consulta PDFs disponíveis → seleciona os materiais → revisa o carrinho → identifica-se por login/cadastro → o site registra o pedido → abre o WhatsApp oficial com o resumo → a equipe confirma a compra fora do site → administrador confirma e libera os PDFs no painel → cliente acessa seus materiais no site.

WhatsApp: +55 48 9350-1191. O sistema prepara a mensagem; o cliente ainda precisa enviá-la no WhatsApp. Abrir o aplicativo não comprova envio, recebimento nem pagamento.
Não haverá gateway de pagamento, webhook de pagamento ou WhatsApp Business API nesta primeira versão.

## Base existente a aproveitar

- Next.js App Router e TypeScript; identidade visual e CSS existentes. Não instalar Tailwind nem trocar o design system só por causa deste fluxo.
- Supabase Auth e profiles, catálogo products, tabelas carts/cart_items, permissões e funções de carrinho já protegidas.
- Painel atual lista usuários e cadastra metadados de produtos, mas ainda não gerencia arquivos nem liberações.
- /materiais consulta produtos, mas ainda encaminha compras diretamente ao WhatsApp.
- /carrinho é uma tela protegida de estado vazio: sua interface funcional ainda será construída.
- As funções de carrinho atuais não substituem pedidos nem direitos de acesso. Evoluí-las por novas migrações, preservando dados e histórico.
- Integrações Supabase e Vercel disponíveis. Instalação/conexão não autoriza alterações fora da etapa solicitada.

## Separações essenciais da arquitetura

1. **Produto:** título, descrição, capa, preço e disponibilidade para novas vendas.
2. **Arquivo privado:** PDF e suas versões; nunca um link público no registro público do produto.
3. **Carrinho:** seleção editável; preço sempre revalidado pelo servidor.
4. **Pedido:** registro persistente com código, cliente e cópias dos títulos/preços dos itens no momento da confirmação. Alterações futuras no catálogo não mudam o pedido.
5. **Liberação de acesso:** autorização explícita, vinculada ao cliente, produto e origem (item do pedido), com administrador, data e eventual revogação.
6. **Histórico administrativo:** registro de confirmação, liberação, revogação e mudanças relevantes, sem gravar senhas, URLs assinadas ou CPF em logs.

Modelo conceitual a detalhar na etapa 2: aproveitar profiles/products/carts/cart_items e acrescentar orders, order_items, product_files, access_grants e admin_audit_events (nomes técnicos podem ser refinados sem mudar as responsabilidades).
Não sobrecarregar carts.status com o significado de pagamento ou acesso.

## Regras da primeira versão — especificadas na etapa 1

- Vitrine pública. Visitante pode selecionar antes do login; seleção local contém somente IDs, nunca preços confiáveis nem dados pessoais. Após autenticação, mesclar com carrinho persistido, revalidando os produtos.
- Conta identificada e e-mail confirmado antes de registrar o pedido, para associar a liberação ao cliente correto. Preservar a seleção durante login, cadastro e confirmação de e-mail.
- Uma unidade de cada PDF por conta. Não vender múltiplas unidades/licenças na primeira versão. Mostrar “Já disponível na sua biblioteca” quando apropriado.
- Cada pedido recebe código de atendimento e UUID interno. Código não funciona como autorização de acesso.
- Pedido: AGUARDANDO_CONFIRMACAO → CONFIRMADO ou CANCELADO. Acesso tem estado próprio: ATIVO ou REVOGADO. Não usar “WhatsApp enviado” como pagamento confirmado.
- Ao confirmar a compra, ação administrativa explícita “Confirmar compra e liberar materiais”, com resumo e confirmação. Confirmação e criação das permissões serão atômicas e idempotentes. Responsável confirmou que todos os PDFs do pedido serão liberados juntos; liberação parcial fica fora do MVP.
- Revogação exige motivo e histórico; não apagar pedido. Não invalidar outra autorização legítima do mesmo material inadvertidamente.
- Despublicar um produto bloqueia novas compras, sem remover automaticamente o acesso de quem já comprou.
- Download liberado, sem prazo automático e com atualizações do mesmo material incluídas, conforme resposta do responsável em 04/10/2026. Não prometer acesso vitalício. Política comercial de devoluções e suspensão deve ser fornecida antes da publicação.
- Versões: manter arquivos anteriores e apontar a versão atual para compradores autorizados; não sobrescrever arquivos silenciosamente nem cobrar novamente por atualização do material comprado. Edição comercial distinta só poderá ser outro produto claramente identificado.
- Proposta inicial de limite: PDF de até 20 MB, a validar com os arquivos reais e limites do ambiente. Não contratar armazenamento/serviços pagos sem aprovação.
- Não incluir CPF, senha, links privados ou tokens na mensagem de WhatsApp. Enviar código do pedido, nomes dos PDFs, valores, total e link público de login/acompanhamento. Qualquer dado pessoal adicional precisa de justificativa.

## Etapa 1 — Fechar regras e desenhar a experiência

Status: CONCLUÍDA. Dependências: nenhuma. Regras D01/D02 confirmadas; experiência e wireframes aprovados pelo responsável em 04/10/2026, com a mensagem “aprovo”.

Entregues em 04/10/2026:
- [Especificação de regras, estados e telas](ETAPA-1-EXPERIENCIA-PDFS.md).
- [Wireframes navegáveis: nove telas, desktop e celular](prototipos/etapa-1-pdfs.html).
- [Prévia verificada do carrinho](prototipos/etapa-1-carrinho.jpg).

Validação local: JavaScript válido, nove destinos sem referências quebradas, navegação verificada nas nove telas, sem overflow horizontal da página a 320 px e do frame a 390 px; avisos/erros de console não observados. Cards mobile substituem tabelas administrativas. Protótipo offline, sem APIs ou efeitos reais. Isso não é teste do fluxo integrado, que ainda será implementado nas próximas etapas.

Entregas:
- Confirmar as regras propostas acima, política de versões, acesso, cancelamento e limite dos arquivos.
- Definir textos, estados e telas do catálogo, carrinho, confirmação, pedidos e biblioteca.
- Definir abas administrativas: Produtos, Pedidos, Clientes/Acessos e Histórico.
- Preparar wireframes mobile-first sem modificar a aplicação em produção.
- Definir o que significa “etapa aprovada” e ambiente de testes; verificar custos antes de provisionar ambientes.

Aceite: fluxo completo compreensível, decisões registradas e identidade premium preservada.

## Etapa 2 — Estruturar pedidos, arquivos e permissões no banco

Status: CONCLUÍDA para estrutura do banco. Dependências: 1 concluída. Preparação autorizada com “pode fazer etapa 2”; aplicação no Supabase atual autorizada posteriormente com “pode aplicar”. Sem criação de projeto adicional ou uso de Docker.

Entrega local: [modelagem, contratos, limites e aplicação/recuperação](ETAPA-2-BANCO-PDFS.md), `supabase/migrations/20261005004458_teorema_pdf_orders_access.sql`, `supabase/verify-commerce.sql` e testes de banco. Histórico-base reconciliado com as três versões remotas, preservando os scripts manuais em `supabase/legacy/`.

Evidências: 24 testes automatizados, lint, tipos e build locais; testes com dois clientes sintéticos, mutações indevidas, isolamento, snapshots, retries, grants integrais, revogações, versões e Storage simulado. Migrações `20261005004458` e `20261005004940` aplicadas e verificadas no projeto atual. RLS/permissões/estado administrativo sem pendências; perfil existente preservado. Smoke test de API real somente leitura passou, inclusive helper privado de Auth. Bucket privado ainda não provisionado (etapa 3). Não confundir isso com homologação completa de upload/download, concorrência ou duas sessões reais: essa validação fica nas etapas correspondentes e 9. Nenhuma conta/pedido/arquivo de teste foi criado em produção.

Entregas:
- Inspecionar novamente o schema real e o histórico de migrações; alinhar arquivos locais com versões remotas antes de acrescentar novas migrações.
- Modelar pedidos e itens com snapshots de títulos/preços e valores monetários exatos, sem cálculo confiado ao navegador.
- Modelar arquivos/versionamento, permissões de acesso e histórico administrativo.
- Definir constraints, chaves estrangeiras, índices e unicidade para evitar pedidos/liberações duplicadas.
- Definir transações e idempotência para criação do pedido e confirmação administrativa.
- RLS e grants mínimos: aluno lê apenas seus dados; visitante não lê pedidos nem caminhos privados; administração validada no servidor.
- Planejar bucket privado para PDFs e separação de capas públicas. Bloquear listagem/leitura/upload indevidos de Storage.
- Testar migrações em ambiente isolado, com dados sintéticos; preparar backup e reversão antes de produção.

Aceite: dois clientes de teste não acessam dados entre si, não alteram preço/status/liberação e não acessam PDFs sem autorização.

## Etapa 3 — Painel administrativo de produtos e upload de PDFs

Status: EM VALIDAÇÃO. Dependências: 1, 2. Implementação local autorizada com “pode iniciar a etapa 3” e retomada com pedido para concluir os testes. [Entrega, evidências e ativação pendente](ETAPA-3-PRODUTOS-PDFS.md).

Implementado: rascunho/edição/publicação/despublicação/arquivamento, revisão concorrente, uploads TUS para staging privado, validação no servidor, capas WebP, histórico imutável e limpeza explícita de temporários expirados. 36 testes passaram; lint/tipos/build verificados. Migração `20261005235705` e três buckets aplicados após autorização em 05/10/2026, sem upgrade. Perfil preservado, RLS/RPCs e configuração Storage verificados. Ativação na Vercel impedida por 403 da integração; variável Production ainda pendente. Aceite real de admin/aluno e upload permanece pendente; não tratar como etapa concluída integralmente.

Entregas:
- Criar/editar título, descrição, preço, capa e arquivo PDF.
- Rascunho, publicar, despublicar e arquivar; não apagar histórico de vendas.
- Upload autenticado e exclusivo do admin, com validação de tamanho, extensão, MIME e assinatura/conteúdo do arquivo no servidor. Definir tratamento seguro de PDFs suspeitos sem presumir que extensão .pdf comprova segurança.
- Upload direto autorizado ao Storage quando adequado, evitando transportar PDFs grandes pelo corpo de funções da Vercel; finalizar somente após verificação do objeto recebido.
- Exibir progresso, erros, versão, data e tamanho. Não publicar produto cujo upload está incompleto.
- Substituir arquivo por nova versão, preservando a anterior e auditando a operação.
- Tratar falhas entre upload e gravação de metadados e arquivos órfãos; limpeza não pode apagar arquivos vinculados a pedidos/acessos.

Aceite: admin publica um material real de teste; aluno não consegue enviar/substituir arquivos; PDF permanece privado mesmo com produto publicado.

## Etapa 4 — Vitrine e seleção dos PDFs

Status: PENDENTE. Dependências: 1, 2, 3.

Entregas:
- Atualizar /materiais com produtos publicados e respectivos títulos, capas, descrições e preços.
- Ação “Adicionar ao carrinho”, feedback, contador e acesso ao carrinho; estados “Adicionado”, “Indisponível” e “Já adquirido”.
- Seleção temporária para visitantes, sem duplicar PDFs, com armazenamento local mínimo.
- Criar contrato de seleção/mesclagem para a etapa 5. Enquanto o carrinho não estiver funcional, manter em preview, sem publicar um botão que leve a um fluxo incompleto.
- Responsividade, teclado, foco, carregamento, erros, catálogo vazio, imagens otimizadas e metadados de SEO.

Aceite: materiais exibidos refletem o admin; visitante seleciona mais de um PDF sem perder a seleção e sem ter acesso ao arquivo.

## Etapa 5 — Carrinho funcional e continuidade de autenticação

Status: PENDENTE. Dependências: 2, 4.

Entregas:
- Substituir a tela vazia por lista de PDFs, valores, remover item, total e continuar comprando.
- Persistir carrinho por usuário através do backend; adaptar as funções existentes à regra de uma unidade digital, se aprovada.
- Validar sessão/identidade no servidor, origem da requisição e dados de entrada.
- Mesclar seleção do visitante depois de login/cadastro sem sobrescrever indevidamente a seleção existente; retomada também após confirmação por e-mail.
- Revalidar disponibilidade/preço e informar alterações antes de prosseguir. Tratar sessões expiradas, múltiplas abas e cliques repetidos.
- Sem produtos inativos, preço adulterado, duplicatas ou acesso ao carrinho de outro cliente.

Aceite: carrinho resiste a refresh/logout/login conforme o contrato, e totais são calculados no servidor.

## Etapa 6 — Registrar pedido e abrir WhatsApp

Status: PENDENTE. Dependências: 2, 5.

Entregas:
- Botão “Registrar pedido e falar no WhatsApp”.
- Revalidar preços/disponibilidade; exigir nova confirmação visual se o total mudou.
- Criar pedido e itens em transação antes de abrir o WhatsApp; preservar o snapshot e ligar ao carrinho/cliente.
- Usar idempotência para evitar duplicação por clique duplo, reenvio ou falha de rede. Pedido já criado pode reabrir a mesma mensagem.
- Preparar mensagem para +5548935011911 com código, PDFs, valores e total. Se o texto exceder limites práticos, usar resumo e código com pedido completo salvo, nunca truncar silenciosamente os itens.
- Exibir página de confirmação/acompanhar pedido e botões para abrir novamente ou copiar a mensagem se o aplicativo/popup falhar.
- Guardar estado AGUARDANDO_CONFIRMACAO. Nenhum arquivo é liberado neste momento.

Aceite: pedido aparece no banco e no contrato de listagem do admin mesmo se WhatsApp não abrir; mensagem corresponde ao snapshot; operação repetida não gera nova compra.

## Etapa 7 — Admin: confirmar compras e controlar acessos

Status: PENDENTE. Dependências: 2, 3, 6.

Entregas:
- Listar/buscar pedidos por código, cliente, data e status, com paginação e detalhes dos itens/valores.
- Confirmar compra conferida no WhatsApp e liberar os PDFs do pedido para a conta correta em uma única transação.
- Não confiar na mensagem enviada pelo cliente como prova: ela é editável. Admin compara com o pedido salvo e verifica pagamento fora do site.
- Tornar a ação idempotente e proteger contra confirmação simultânea por dois admins.
- Cancelar pedidos pendentes; consultar acessos, revogar/reliberar com justificativa e histórico. Não remover acessos de outras compras válidas.
- Mostrar usuário, material, origem, quem liberou e quando. Admin deve ver que despublicar um produto não revoga compras anteriores.
- Validar autorização administrativa em toda operação e impedir autoelevação pelo aluno. Manter o admin existente e prever alteração segura por identificador de conta, não por metadados editáveis.

Aceite: comprador correto recebe acesso; demais clientes não; repetição não duplica permissões; toda ação relevante tem rastreabilidade.

## Etapa 8 — Biblioteca e entrega privada dos PDFs

Status: PENDENTE. Dependências: 2, 3, 7.

Entregas:
- Área “Meus materiais” e histórico de pedidos integrados ao perfil, com estados pendente/liberado/revogado.
- Backend valida sessão, titularidade e autorização ativa a cada solicitação de acesso; somente então gera acesso temporário ao arquivo.
- Links assinados de curta duração, nunca persistidos como URL pública nem em logs; regras de cache privadas para informações do cliente.
- Download e, se aprovado na etapa 1, visualização no navegador. PDFs não ficam na pasta public do Next.js.
- Bloquear usuário errado, acesso revogado e URL expirada. Tratar arquivo ausente, nova versão e sessão encerrada.
- Informar limite real: revogação impede novos links, mas um link já emitido pode funcionar até expirar. Arquivo já baixado não pode ser recolhido nem ter seu compartilhamento totalmente impedido. Não prometer DRM.

Aceite: fluxo funciona em celular e desktop; cliente vê só materiais autorizados; copiar a URL da página não concede acesso a terceiros.

## Etapa 9 — Homologação ponta a ponta e segurança

Status: PENDENTE. Dependências: 3–8.

Entregas:
- Testes automatizados de banco, autenticação, RLS/Storage, uploads, pedidos, idempotência e permissões.
- Ensaio completo com admin e dois clientes de teste: publicar → selecionar → autenticar → registrar → WhatsApp → confirmar → liberar → baixar → revogar.
- Testar preço alterado, produto despublicado, arquivo substituído, tentativa de acesso cruzado, sessão expirada, duplo clique, timeout, pedidos cancelados e falha de Storage.
- Conferir proteção de dados pessoais, limites contra abuso, validação de arquivos, logs sem segredos e endpoints sem cache público indevido.
- Revisar acessibilidade, mobile-first, desempenho, SEO da vitrine e noindex nas áreas privadas.
- Rodar lint, tipos, testes, build e advisors. Registrar limitações de plano/infraestrutura sem contratar upgrades automaticamente.
- Preparar configuração Auth, domínios de retorno, variáveis por ambiente, backup e procedimento de reversão. Testes locais não substituem testes com serviços reais em homologação.

Aceite: checklist aprovado, nenhuma falha crítica aberta e evidências dos testes registradas.

## Etapa 10 — Publicação controlada e operação

Status: PENDENTE. Dependências: 9 aprovada e autorização explícita para publicar.

Entregas:
- Conferir backup, variáveis de produção, domínio, callbacks de autenticação e permissões de Storage.
- Aplicar apenas novas migrações aprovadas, na ordem correta, sem recriar a estrutura já existente. Executar verificação após cada mudança.
- Fazer commit/push e deploy apenas quando autorizados; verificar status na Vercel e executar smoke test sem compras/envios reais não autorizados.
- Treinar admin: upload/publicação, busca por código, confirmação, liberação, revogação e atendimento a falhas.
- Entregar manual curto e registrar limites conhecidos e procedimento de recuperação. Reversão do app não pode reabrir permissões inseguras do banco.
- Configurar observabilidade somente dentro do escopo aprovado; monitoramento recorrente exige solicitação própria.

Aceite: fluxo publicado e validado no domínio real, admin consegue operá-lo e há procedimento de suporte/reversão.

## Como executar por comando

- “Faça a etapa 4”: ler este documento, conferir se 1–3 estão concluídas e executar somente a etapa 4.
- Se faltar uma dependência, informar exatamente qual e pedir direção; não executar várias etapas silenciosamente.
- Cada etapa passa por PENDENTE → EM ANDAMENTO → EM VALIDAÇÃO → CONCLUÍDA, com evidências, arquivos alterados, testes e pendências.
- Não marcar concluída com placeholders, comportamento simulado ou integração essencial pendente. Separar status local/homologação/produção.
- Não renumerar etapas. Mudanças devem entrar em uma seção de decisões/revisões para manter comandos anteriores válidos.
- Segurança e testes acompanham todas as etapas; a etapa 9 é a homologação integrada, não o início da segurança.
- Executar uma etapa autoriza seu trabalho local e testes em ambiente seguro; alterações em produção, custos, migrações remotas, envio de mensagens, commit/push e deploy precisam de autorização explícita quando não estiverem incluídos no comando.
- Antes de iniciar uma etapa de Supabase/Next.js/Vercel, reler as skills aplicáveis e verificar documentação atual. O plano não substitui inspeção do estado real.

## Registro de decisões e execução

| Etapa | Estado | Evidência/observação |
| --- | --- | --- |
| 1 | CONCLUÍDA | D01/D02 confirmadas; especificação e nove wireframes verificados localmente e aprovados pelo responsável em 04/10/2026 |
| 2 | CONCLUÍDA (estrutura) | Migrações e índices aplicados no Supabase após autorização; 24 testes locais e smoke de API real; bucket/fluxo integrado nas etapas 3–9 |
| 3 | PENDENTE | Sem upload/admin de PDFs |
| 4 | PENDENTE | Vitrine atual ainda usa CTA direto de WhatsApp |
| 5 | PENDENTE | Carrinho atual é placeholder |
| 6 | PENDENTE | Sem pedido persistido integrado ao WhatsApp |
| 7 | PENDENTE | Sem liberação administrativa por pedido |
| 8 | PENDENTE | Sem biblioteca privada |
| 9 | PENDENTE | Aguardando fluxo integrado |
| 10 | PENDENTE | Nenhuma publicação deste escopo autorizada |

Referência: [Supabase Storage — buckets privados e links temporários](https://supabase.com/docs/guides/storage/buckets/fundamentals).

### Revisão de 04/10/2026 — etapa 1

- D01: responsável escolheu download sem prazo automático, com atualizações do mesmo material incluídas.
- D02: responsável escolheu confirmar a compra e liberar todos os PDFs juntos.
- Apenas documentos/protótipo e uma captura de revisão foram criados. Nenhuma migração, recurso remoto, alteração de aplicação, commit, push ou deploy executado nesta etapa.
- Aceite fechado: responsável aprovou a experiência e os wireframes com a mensagem “aprovo” em 04/10/2026. Essa aprovação conclui a etapa 1; não inicia a etapa 2 nem autoriza publicação, migração remota ou commit/push.
- As políticas comerciais finais devem ser entregues antes da etapa 10; limite de arquivo será medido com PDFs reais na etapa 3.

### Revisão de 04/10/2026 — etapa 2

- Inspeção remota somente leitura; nenhuma aplicação de migração/bucket nem alteração de configuração.
- Histórico local alinhado às versões remotas, com scripts manuais preservados fora da pasta de migrações.
- Nova estrutura de pedidos/itens, arquivos/versionamento, acessos, auditoria e UUID administrativo privado. Quantidade digital 1 e limite técnico de 50 materiais por pedido; arquivos iniciais até 20 MiB.
- Administração/cliente vêm de identidade validada no servidor. Helper privado de Auth evita abrir leitura ampla de `auth.users` para service role. Metadados editáveis não autorizam.
- Migração nova não é um script de reaplicação manual. Homologação isolada, backups e publicação são marcos separados, com autorização própria.
- A etapa 2 fica EM VALIDAÇÃO até homologação real; as próximas etapas não foram iniciadas.
- Continuação: responsável autorizou homologação separada e commit/push. Apenas produção está disponível. Organização confirmada; Supabase informou US$ 0/mês, mas criação não confirmada: responsável solicitou explicação/alternativa sem novo banco remoto. Avaliar stack local isolada com Docker; não usar produção como substituto do ambiente de testes. Nenhum projeto novo criado.

### Aplicação no Supabase atual — 04/10/2026

- Responsável autorizou expressamente “pode aplicar” após explicação de que Git push não aplica SQL e de que um ambiente separado/Docker servia para testes. Autorização limitada à estrutura atual, sem iniciar painel/upload ou publicar checkout.
- Snapshot privado de dados/definições da aplicação preservado em `.data`, cifrado por DPAPI CurrentUser e verificado. Não é backup completo de Auth/Storage; ver limites e recuperação no documento da etapa 2.
- Migrações `20261005004458_teorema_pdf_orders_access` e `20261005004940_teorema_commerce_fk_indexes` registradas remotamente. Arquivos locais renomeados para coincidir com o histórico; não manter/aplicar versões locais antigas duplicadas.
- Base anterior: 12 controles zerados. Nova estrutura: controles 01–12 e 14 zerados; 13 registra bucket privado ainda pendente da etapa 3. Seis tabelas novas com RLS; um UUID administrativo elegível. Dados existentes preservados.
- Teste de leitura na API real aprovado para contratos/grants e resolver privado de Auth/acesso. Não cria contas, pedidos, mensagens, uploads ou liberações em produção. Nenhuma homologação isolada foi executada.
- Advisor sem FKs sem índice; índices ainda não usados são informativos. Aviso conhecido de proteção contra senhas vazadas permanece, sem contratar upgrade.
- Etapa 2 concluída para modelagem/estrutura. Próximo comando possível: “faça a etapa 3”. Homologação integrada de vendas/entrega permanece na etapa 9; não antecipar alegações de checkout/download funcionando.
