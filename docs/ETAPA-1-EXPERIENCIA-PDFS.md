# Etapa 1 — regras, experiência e contrato das telas

Data: 04/10/2026. Referência: PLANO-VENDA-PDFS.md, versão 2.
Estado: CONCLUÍDA. Regras comerciais confirmadas; especificação, experiência e wireframes aprovados pelo responsável em 04/10/2026.

Esta entrega contém documentação e um protótipo navegável, com exemplos fictícios. Não altera aplicação, banco, Storage, dados de clientes ou Vercel.

## Fluxo definido

1. O visitante consulta a vitrine pública e escolhe PDFs.
2. A seleção vai para o carrinho; cada PDF aparece uma única vez.
3. Ao continuar, o visitante entra ou cria sua conta. A seleção deve sobreviver à autenticação e à confirmação de e-mail.
4. O cliente autenticado revisa disponibilidade, preços e total.
5. O servidor registra um pedido e seus itens antes de disponibilizar a mensagem de WhatsApp.
6. O cliente abre o WhatsApp, revisa e envia a mensagem para a equipe.
7. O administrador localiza o pedido pelo código e confere o pagamento no atendimento.
8. O administrador confirma a compra e libera os materiais conforme a regra aprovada.
9. O cliente acompanha o pedido e encontra os PDFs autorizados em Meus materiais.

Enviar a mensagem depende do cliente. A página de pedido oferece reabrir o WhatsApp e copiar o texto. Nunca exige criar outro pedido para recuperar o atendimento.

## Decisões confirmadas e escolhas técnicas

| ID | Decisão | Origem |
| --- | --- | --- |
| R01 | Venda atendida no WhatsApp +5548935011911 | Solicitação do usuário |
| R02 | Pedido salvo no site com os materiais escolhidos | Solicitação do usuário |
| R03 | Admin cadastra PDFs e controla disponibilidade e acessos | Solicitação do usuário |
| R04 | Identidade Teorema premium, com prioridade ao celular | Solicitação do usuário |
| R05 | Catálogo público; conta com e-mail confirmado para registrar pedido | Continuidade da autenticação existente e vínculo confiável da compra |
| R06 | Uma unidade de cada PDF por conta; mesclagem sem duplicatas | Regra técnica da primeira versão; licenças múltiplas fora do fluxo definido |
| R07 | Preços e total validados no servidor; pedido conserva títulos e valores daquele momento | Integridade do pedido |
| R08 | Despublicar bloqueia novas vendas, preservando acessos de compradores | Separação entre catálogo e autorização |
| R09 | PDFs privados, acesso validado por cliente; capas e descrições públicas | Proteção da entrega |
| R10 | Revogação exige motivo e histórico; não apagar a compra | Rastreabilidade administrativa |
| R11 | Pedido e liberação idempotentes; falha/repetição não duplica compra ou acesso | Integridade do fluxo |
| R12 | Mensagem não inclui CPF, senha nem link privado do PDF | Minimização dos dados compartilhados |
| R13 | Limite técnico inicial de 20 MB por PDF, a conferir com arquivos reais na etapa 3 | Base de dimensionamento; ainda não medido com catálogo real |
| R14 | Protótipo usa arquivos locais; primeira homologação será local, com dados sintéticos | Sem custo/provisionamento nesta etapa |

R06 pode ser revisada se forem vendidos combos ou licenças para terceiros; essa expansão altera o contrato de compra.

## Decisões comerciais confirmadas em 04/10/2026

**D01 — Forma de acesso e versões.** Confirmado pelo responsável: download liberado, sem prazo automático, com atualizações do mesmo material incluídas. Substituir o PDF cria uma versão e preserva a autorização dos compradores. Uma edição comercial distinta, caso futuramente vendida separadamente, precisa ser claramente cadastrada como outro produto; não cobrar novamente por atualização do material comprado. Não transformar “sem prazo automático” em promessa de acesso vitalício. Arquivos já baixados não podem ser recolhidos pelo site; não há promessa de DRM.

**D02 — Liberação integral.** Confirmado pelo responsável: uma ação confirma a compra e libera todos os PDFs do pedido juntos. Confirmação e permissões devem ser atômicas e idempotentes. Não haverá confirmação ou pagamento parcial por item na primeira versão.

Política de reembolso, motivos comerciais de suspensão e termos de venda devem ser fornecidos pelo responsável antes da publicação. A implementação prevê cancelamento de pedidos pendentes e revogação registrada, sem inventar condições comerciais.

## Rotas e navegação propostas

| Área | Rota/estrutura proposta | Conteúdo principal |
| --- | --- | --- |
| Vitrine | /materiais | Produtos publicados, capa, descrição, preço e seleção |
| Carrinho | /carrinho | Seleção, remover, total e continuidade de compra |
| Conta | /login e /cadastro | Entrar/criar conta, confirmar e-mail e retornar à seleção |
| Pedidos | /pedidos | Histórico próprio e status |
| Detalhe do pedido | /pedidos/[id] | Código, itens, total, situação e WhatsApp |
| Biblioteca | /meus-materiais | Materiais autorizados e ação de acesso |
| Perfil | /perfil | Dados da conta e atalhos para pedidos/biblioteca |
| Administração | /admin, com abas | Produtos, Pedidos, Clientes e acessos, Histórico |

Rotas novas são propostas de interface, não foram criadas. Ajustar a lista de retornos permitidos do login quando elas forem implementadas; nunca aceitar destino externo arbitrário.

## Estados do cliente

### Produto

- **Disponível:** “Adicionar ao carrinho”.
- **Selecionado:** “Adicionado” e “Ver carrinho”. Não permitir nova unidade do mesmo PDF.
- **Já autorizado:** “Ver em Meus materiais”.
- **Indisponível:** não aparece na vitrine normal; se houver seleção antiga, informar e permitir remover.
- **Preço alterado:** mostrar preço atual e exigir nova revisão antes do pedido.

### Carrinho

- **Vazio:** “Seu próximo material começa aqui.” / “Explore os PDFs disponíveis e escolha os que acompanham seus estudos.” / “Conhecer materiais”.
- **Com itens:** lista de capa pequena, título, formato PDF, preço e “Remover”; total e resumo da seleção.
- **Visitante:** “Entre na sua conta para continuar.” / “Sua seleção será mantida.” / “Entrar e continuar”.
- **E-mail pendente:** “Confirme seu e-mail para registrar o pedido.” / “Sua seleção continua guardada.” / “Já confirmei, continuar”. Reenvio de confirmação com feedback, sem loop automático.
- **Autenticado:** “Registrar pedido e falar no WhatsApp”. Texto de apoio: “Após a confirmação da compra, seus materiais serão liberados na sua conta.”
- **Preço/estoque alterado:** “Atualizamos sua seleção. Confira os valores antes de continuar.” Não registrar pedido silenciosamente com total diferente.
- **Falha/timeout:** “Não foi possível concluir agora. Vamos conferir se seu pedido já foi registrado.” Resolver pelo identificador idempotente antes de oferecer novo envio.

O carrinho é seleção editável. Ao registrar, o pedido ganha sua cópia própria e o carrinho de origem fica associado/congelado para evitar duas compras causadas por repetição. Novas seleções podem iniciar um carrinho aberto separado, sem apagar o pedido anterior.

### Pedido

| Estado técnico | Rótulo no site | Ações do cliente |
| --- | --- | --- |
| AGUARDANDO_CONFIRMACAO | Aguardando confirmação | Ver detalhes, abrir WhatsApp, copiar mensagem |
| CONFIRMADO | Compra confirmada | Ver detalhes e ir aos materiais liberados |
| CANCELADO | Pedido cancelado | Ver histórico e voltar ao catálogo |

Regra confirmada D02: confirmação e liberação ocorrem na mesma transação, sem estado parcial de pagamento.
Cancelamento pelo cliente não será exposto na primeira versão; atendimento/admin cancela pedidos pendentes. Depois de confirmado, uma revogação de acesso não reescreve o preço ou apaga o pedido.

### Biblioteca

- **Sem compras:** “Sua biblioteca começa com uma escolha.” / “Conhecer materiais”.
- **Pedido pendente:** card de acompanhamento separado: “Sua compra aguarda confirmação.” Sem botão de arquivo.
- **Acesso ativo:** capa, título, versão disponível, data de liberação e “Baixar PDF”; atualizações do mesmo material incluídas, conforme D01.
- **Acesso revogado:** “Acesso suspenso. Fale com nossa equipe.” Sem gerar novo link privado. Não mostrar justificativas internas sensíveis.
- **Arquivo temporariamente indisponível:** “Não conseguimos abrir este material agora. Tente novamente ou fale com a equipe.” A permissão não é apagada por uma falha de Storage.

## Administração

### Produtos

- Lista com título, preço, arquivo/versão, status e ações de editar.
- Editor: título, descrição, preço, capa, arquivo PDF, versão e disponibilidade.
- **Rascunho:** produto em edição, ainda não publicado.
- **Publicado:** apto para novas vendas, com arquivo validado.
- **Fora da vitrine:** venda suspensa; compradores autorizados mantêm seus materiais.
- **Arquivado:** sai da operação cotidiana, conserva pedidos, arquivos e direitos existentes.
- Upload: aguardando arquivo → enviando/progresso → validando → arquivo pronto ou erro recuperável.
- Botão “Publicar material” somente com os campos e arquivo prontos. Salvar rascunho não publica automaticamente.
- Substituir PDF cria nova versão; capa pública não oferece acesso ao arquivo privado.

### Pedidos

- Busca por código ou e-mail, filtros por estado/data e lista paginada.
- Detalhe: cliente (e-mail), código, data, itens e total registrados, estado, histórico e ação principal.
- Ação: “Confirmar compra e liberar materiais”. Modal: “Você conferiu o pagamento deste pedido?”; repetir código, e-mail e total; botão “Confirmar e liberar”.
- Operação em andamento: “Confirmando compra…”; bloqueio de novo clique; conclusão: “Compra confirmada. Materiais liberados para esta conta.”
- Pedidos cancelados e já confirmados não recebem nova confirmação.
- A mensagem de WhatsApp é editável; a referência comercial é o pedido salvo. O admin confere o pagamento no canal de atendimento, sem confiar apenas em comprovante/mensagem do cliente.

### Clientes e acessos

- Buscar conta por e-mail; distinguir identidade da conta do contato do WhatsApp.
- Mostrar acessos por material com pedido de origem, data, estado e responsável.
- Revogar: identificar cliente/material, exigir motivo e confirmação; preservar histórico.
- Reliberar: registrar nova decisão e motivo, sem simular outra compra.
- Acesso efetivo depende de ao menos uma autorização válida; revogar uma origem não remove outra autorização legítima.
- Liberações avulsas não vinculadas a pedido ficam fora desta primeira versão, salvo expansão solicitada.
- Perfil do cliente: CPF/telefone não entram na listagem principal de pedidos; exibir somente onde houver necessidade operacional.

### Histórico

- Registro cronológico de produto publicado/despublicado, arquivo substituído, compra confirmada, acesso revogado/reliberado e cancelamento.
- Dados mínimos: ação, entidade, administrador, data/hora e motivo quando aplicável.
- Sem apagar histórico pela interface; sem senhas, conteúdo integral de mensagens ou URLs privadas em logs.

## Mensagem proposta de WhatsApp

Exemplo fictício — o texto real será montado com o pedido registrado:

```text
Olá, equipe do Teorema da Educação!
Gostaria de concluir o pedido TE-EXEMPLO-001.

Materiais escolhidos:
• Caderno de práticas inclusivas — R$ 39,90
• Planejamento com propósito — R$ 29,90

Total: R$ 69,80

Após a confirmação da compra, aguardo a liberação
dos materiais na minha conta no site.
```

O admin localiza a conta pelo pedido. Não incluir CPF nem expor e-mail automaticamente ao WhatsApp. Poderá haver link de acompanhamento protegido por login, usando o domínio real na implementação. Em listas longas, resumo + código e link; o pedido completo permanece salvo.

## Identidade e wireframes

Arquivo navegável: prototipos/etapa-1-pdfs.html. Abrir no navegador para alternar entre os wireframes e comparar largura de celular/desktop. Dados e preços são exemplos explícitos; botões somente navegam no protótipo.

- Azul institucional #0d334e para superfícies e navegação; azul de conta #0f2840 nos fluxos privados; bege #f7f5f0 e dourado #93846c.
- Títulos serifados de alto contraste, usando Playfair Display no projeto; texto e controles DM Sans. Protótipo offline usa Georgia e sans-serif do sistema como aproximação, sem baixar fontes.
- Hierarquia: título → explicação curta → conteúdo → ação principal. Um CTA dominante por tela.
- Celular: catálogo em coluna; carrinho com resumo após os itens; controles de no mínimo 44 px; abas administrativas roláveis, sem tabelas que escondam ações.
- Desktop: catálogo em três colunas; carrinho/pedido com resumo lateral; admin com navegação lateral e detalhes centralizados.
- Estados exibem texto, não apenas cor; foco visível, sem depender de hover; confirmação modal com foco e fechamento por teclado quando implementada.
- Transições discretas e opção de reduzir movimento; evitar animações que atrasem compra ou escondam feedback.

O protótipo cobre catálogo, carrinho, identificação, pedido registrado, biblioteca, produtos, detalhe de pedido, clientes/acessos e histórico. Notas de revisão ficam fora da superfície de produto.

## Ambiente, validação e passagem para a etapa 2

- Desenvolvimento e testes iniciais locais; dados sintéticos e PDFs de teste sem informações pessoais.
- Não usar produção como ambiente para simular compras ou testar autorização.
- Definir ambiente separado do Supabase antes de integração. Se branching/recursos pagos forem necessários, apresentar o custo antes de provisionar. Preview Vercel nunca deve acessar produção por engano.
- Homologação: admin + dois clientes distintos, catálogo real de teste e confirmação manual. Nenhuma mensagem real será enviada automaticamente.
- Etapa 1 pronta para execução técnica quando D01/D02 estiverem registradas, o fluxo e os wireframes revisados e a especificação consistente com o plano.
- As etapas técnicas terão testes proporcionais em cada entrega; etapa 9 valida o percurso completo.

## Checklist da etapa 1

- [x] Fluxo de cliente e admin documentado.
- [x] Separação entre carrinho, pedido e liberação definida.
- [x] Telas, rotas propostas, textos e estados especificados.
- [x] Wireframes navegáveis preparados para celular e desktop.
- [x] Estratégia de ambiente e aceite documentada.
- [x] D01: download sem prazo automático, com atualizações do mesmo material incluídas.
- [x] D02: confirmar compra e liberar todos os PDFs do pedido juntos.
- [x] Revisão final do responsável sobre a experiência proposta, aprovada em 04/10/2026.

Registro de decisões: D01 e D02 confirmadas pelo responsável em respostas diretas nesta conversa, em 04/10/2026. Experiência e wireframes aprovados explicitamente com a mensagem “aprovo” na mesma data. Etapa 2 permanece pendente e será executada somente por comando próprio.

## Evidências de validação local

- JavaScript do HTML validado com Node; nove telas únicas e todos os destinos de navegação existentes.
- Navegação das nove telas verificada em navegador; sem erros/avisos de console observados.
- Revisão visual de catálogo/carrinho desktop e mobile e do painel; corrigidos itens apertados e overflow do grid administrativo.
- Nove telas sem overflow horizontal da página em viewport de 320 px e sem overflow do frame na largura mobile de 390 px. Abas administrativas têm rolagem interna deliberada.
- Captura: prototipos/etapa-1-carrinho.jpg. Fontes locais aproximam as fontes reais; revisão final com fontes/assets oficiais ocorrerá na implementação das interfaces.
- Protótipo sem dependências externas, requisições ao banco, persistência, download real ou envio de WhatsApp. Não constitui homologação do sistema de compra/autenticação.
