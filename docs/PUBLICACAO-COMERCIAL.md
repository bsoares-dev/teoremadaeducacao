# Liberação comercial — Teorema da Educação

## Autorização e escopo — 11/10/2026

O responsável solicitou explicitamente deixar o backup/recuperação de lado e
liberar as travas para o site funcionar em Production. Essa decisão substitui a
dependência operacional anterior; não declara recuperação de backup concluída.
Nenhuma instalação, configuração Windows/WSL/Docker ou restauração foi realizada
nesta liberação. O backup e seus arquivos existentes foram preservados.

O fluxo existente continua: catálogo → seleção → login/cadastro → carrinho →
pedido salvo → WhatsApp → confirmação administrativa → biblioteca → PDF
personalizado. Não foi instalado gateway de pagamento nem outro sistema de Auth.

## O que mudou

`lib/commerce-policy.ts` centraliza disponibilidade, não autorização. Production
passa a habilitar catálogo, carrinho/pedidos/biblioteca/downloads e gestão de PDFs
quando suas variáveis não estão definidas ou são exatamente `true`. Não é preciso
copiar segredos ou sobrescrever `.env.local` para essa liberação.

Os nomes históricos `selectionPreviewEnabled` e `cartPreviewEnabled` foram
preservados para não reescrever as páginas e APIs existentes: ambos seguem a nova
política, inclusive `/admin`, `/pedidos` e `/meus-materiais`. As mensagens antigas
de "somente na prévia" foram substituídas por mensagens de desligamento temporário.

| Configuração server-side | Efeito de `false` |
| --- | --- |
| `TEOREMA_CATALOG_SELECTION_ENABLED` | Desliga seleção e a cadeia comercial dependente |
| `TEOREMA_CART_ENABLED` | Desliga carrinho, pedidos, biblioteca/downloads e gestão comercial |
| `TEOREMA_PRODUCT_UPLOADS_ENABLED` | Desliga gestão/envio de PDFs, sem apagar arquivos |

Preview/desenvolvimento continuam exigindo `true` explicitamente. Ambiente
desconhecido e valores malformados (`TRUE`, `1`, espaços etc.) falham fechados.
Uma variável existente com `false` continua desligando a funcionalidade; o código
não ignora uma decisão explícita do operador. Alteração em variáveis da Vercel
precisa do deployment correspondente; não enviar credenciais no chat.

## O que não foi removido

- Sessão verificada, elegibilidade da conta e confirmação de e-mail existentes.
- Permissão administrativa por UUID privado, validada no servidor e nas RPCs.
- Validação de preços, produtos disponíveis, compra confirmada e origem do acesso.
- RLS, grants, isolamento entre clientes e bloqueio de acesso direto ao PDF original.
- PDF original privado, personalização, licença consistente, logs, revogação e limites.
- Conferência da sessão antes da entrega, proteção de origem, rate limit e cache privado.
- PDF/capa válidos como requisito de publicação. Materiais `[HOMOLOGACAO]` continuam
  excluídos da vitrine de Production; arquivos e histórico não foram apagados.

Não houve nova migration, alteração em dados/roles/buckets, segredo, configuração
Auth/SMTP, dependência ou design. `.env.example` permanece excluído conforme a
decisão anterior do responsável.

## Operação do administrador

1. Entrar em `/admin` com uma conta administrativa elegível.
2. Em **Produtos**, criar ou gerenciar um material definitivo: conferir nome,
   descrição e preço; enviar PDF (até 20 MiB) e capa (até 5 MiB).
3. Aguardar a validação dos arquivos e clicar em **Publicar**. Salvar metadados
   não publica nem torna o original público. Não publicar os ensaios arquivados.
4. O cliente escolhe os materiais, revisa o pedido e registra o atendimento pelo
   WhatsApp. Registrar pedido/abrir WhatsApp não comprova pagamento.
5. Em **Pedidos e acessos**, localizar o pedido pelo código, conferir o pagamento
   externamente e usar **Confirmar compra e liberar materiais** somente após essa
   conferência. A liberação ocorre para todos os itens confirmados do pedido.
6. O cliente encontra os materiais em `/meus-materiais` e recebe apenas a cópia
   personalizada. Em **Licenças de PDFs**, consultar histórico ou revogar/reativar
   com motivo. Revogação bloqueia novos downloads, não recolhe cópias já baixadas.

## Evidências e limites

- 177 testes da suíte aprovados, incluindo Production habilitado, desligamento
  explícito, ambientes inválidos e preservação dos controles de autorização.
- TypeScript e lint aprovados. Cache local gerado em `.data` passou a ser ignorado
  pelo lint, assim como `.next`; isso não relaxa regras para código versionado.
- Build final aprovado com a configuração local real após encerrar o ensaio,
  geração 39/39 concluída; 37 assets do cliente conferidos sem valores das
  credenciais privadas configuradas. Nenhum segredo foi impresso ou versionado.
- Conferência real somente leitura no Supabase: contratos de tabelas/RPCs,
  administrador existente e negação de acesso anônimo aprovados. Não foram criados
  usuários, pedidos, acessos, uploads ou materiais nesta conferência.
- Ensaio de navegador reutiliza SQL real das migrations em PGlite isolado, com
  Auth/REST/Storage sintéticos. Build/start usam `VERCEL_ENV=production`, não apenas
  um build de Production com permissões de Preview. Não usa Supabase remoto ou
  envia WhatsApp; não comprova pagamento real, SMTP ou upload remoto de um PDF definitivo.
- Ensaio completo aprovado: seleção/login, carrinho, recuperação de respostas
  perdidas sem duplicação, pedido/WhatsApp, confirmação administrativa, biblioteca,
  download personalizado em duas páginas, licença estável, atualização de versão,
  revogação/reativação, sessão encerrada durante geração, cliente tentando acessar
  outro cliente/admin, rate limit e quatro larguras (320/390/768/1440).
- Nenhum erro de execução do navegador. Respostas 4xx/5xx provocadas pelo ensaio
  validam negações/falhas e retentativas; não são falhas de Production remoto.
- Conferir deployment do commit exato e smoke HTTP no domínio após o push.

### Conferência no domínio real

Deployment do commit da aplicação `1f333891abc4cf6d924d75ca50026b279459da9f`
confirmado pela integração Vercel. Smoke no domínio canônico aprovado: seleção
anônima vazia responde 200; APIs de compras/download/admin exigem login (401);
biblioteca/pedidos redirecionam visitantes; cookie administrativo legado, origem
externa e cadastro inválido continuam negados. O teste de pedidos usa IDs
sintéticos sem cookie: a autenticação nega antes de qualquer escrita. Corrigida a
expectativa do smoke, pois corpo malformado recebe 400 antes da verificação Auth.

Uma sessão nova foi aberta com a credencial de teste já fornecida pelo operador,
somente para consultar produtos, pedidos, acessos, licenças e biblioteca. As cinco
APIs responderam 200 com cache `private, no-store`, comprovando também a remoção
da trava de gestão de PDFs após a autorização administrativa real. Apenas essa
sessão temporária foi encerrada; sessões de outros dispositivos não foram tocadas.
Nenhuma conta foi criada, senha/role alterada, produto publicado, compra registrada
ou acesso liberado. Login gera os registros normais de sessão/auditoria do Auth.

Essa conferência não substitui uma compra real nem o envio/download de um material
definitivo: ainda não há PDFs no Storage. Logs internos do deployment não foram
consultados por falta de acesso do conector à equipe; não afirmar ausência geral
de erros de execução apenas pelo status da Vercel ou pelo smoke.

Estado do catálogo antes da entrega: quatro produtos, nenhum publicado, nenhum
PDF validado e nenhum objeto no Storage; duas contas administrativas ainda
aguardam primeiro acesso. Liberar o sistema não cria o conteúdo comercial nem
confirma essas identidades. O responsável/admin deve cadastrar os materiais finais.

"Travas removidas" não significa que todas as pendências operacionais históricas
foram concluídas. Resultados do ensaio e do deploy devem ser conferidos nesta
entrega; não usar um teste simulado como certificado de operação real completa.
