# PDF protegido - Parte 5: hardening e relatório final

Data: 10/10/2026. Escopo: consolidar as Partes 1 a 4, corrigir lacunas de segurança e validar o fluxo completo. Login, pagamentos pelo WhatsApp, identidade visual e travas comerciais foram preservados.

## 1. Arquitetura implementada

Next.js 16.3.8 App Router, React 18, TypeScript estrito e Supabase Auth/Database/Storage. Sem ORM novo. Route Handlers pequenos delegam a services e repositories server-side. Zod valida as entradas e os DTOs. `getUser()` fornece o usuário confirmado pelo Auth; metadados editáveis não concedem administração.

As operações sensíveis de PDF também usam `getClaims()` para verificar o token e vincular `sub`, `session_id` e expiração ao usuário autenticado. Uma função SQL restrita ao servidor verifica se a sessão correspondente ainda existe em `auth.sessions`. A sessão é novamente conferida após a geração, antes da conclusão do download. Não foi criada outra autenticação.

## 2. Fluxo completo

Biblioteca do aluno -> POST `/api/library/download` com apenas `productId` -> autenticação e sessão ativa -> orçamento persistente de requisições -> compra `CONFIRMADO` e acesso `ATIVO` -> licença da compra -> reserva atômica de quota -> original privado com tamanho/hash/MIME/cache conferidos -> validação e personalização -> reconferência da licença, arquivo, nome e sessão -> confirmação do log -> resposta PDF privada e sem cache.

Falhas não retornam o original nem uma URL alternativa. A cópia existe somente em memória no servidor e no download do comprador; não é armazenada automaticamente no Storage. A biblioteca continua usando o endpoint existente, sem um segundo sistema de downloads.

## 3. Arquivos criados nesta etapa

- `lib/pdf-download/encryption.ts`: bloqueio explícito de criptografia não suportada.
- `lib/pdf-download/session-contract.ts`: contrato de identidade/expiração e erros seguros.
- `lib/pdf-download/session.ts`: verificação server-side de sessão ativa.
- `tests/pdf-hardening.test.ts`: regressões de configuração, erros, filenames, identidade e SQL de sessões.
- `supabase/migrations/20261010233417_teorema_pdf_active_session.sql`: ponte de sessão somente leitura.
- Este relatório.

Os arquivos criados nas Partes 1 a 4 estão inventariados em `PDF-PROTEGIDO-PARTE-1.md`, `PDF-PROTEGIDO-PARTE-2.md`, `PDF-PROTEGIDO-PARTE-3.md` e `PDF-PROTEGIDO-PARTE-4.md`, nesta mesma pasta.

## 4. Arquivos modificados nesta etapa

- `app/api/library/download/route.ts`: exige sessão ativa e passa a reconferência ao serviço.
- `app/api/admin/pdf-licenses/route.ts` e `app/api/admin/pdf-licenses/[id]/route.ts`: exigem sessão ativa além da autorização administrativa já existente.
- `lib/library.ts` e `lib/admin-commerce.ts`: disponibilizam o cliente SSR somente no servidor e tratam erros de sessão sem detalhes internos.
- `lib/pdf-download/service.ts`: valida a configuração de criptografia e a sessão antes de confirmar a resposta; registra falhas sem consumir um download válido.
- `lib/pdf-download/repository.ts` e `types.ts`: arquivo ausente no Storage gera 404; indisponibilidade gera erro seguro; leitura respeita cancelamento.
- `lib/pdf-watermark/service.ts`: comentário atualizado, sem alteração do desenho.
- `scripts/check-build-secrets.mjs`: inclui segredo reservado de licença e marcadores de RPCs privilegiadas na inspeção do bundle.
- `scripts/check-cart-browser.mjs`: ensaio HTTP de concorrência, limite, rate limit, Storage e sessão revogada; somente dados sintéticos locais.
- `scripts/fixtures/cart-database.mjs`: representação local da tabela de sessões para testes.

Nenhum TSX/CSS, imagem, fluxo de pagamento, senha ou `.env.local` foi modificado nesta etapa. A exclusão preexistente de `.env.example` foi mantida por solicitação expressa e não está incluída no commit desta etapa.

## 5. Migrations

Migrations anteriores do sistema protegido:

- `20261009225322_teorema_pdf_licenses.sql`
- `20261009225705_teorema_pdf_licenses_origin_index.sql`
- `20261009233158_teorema_profile_full_name.sql`
- `20261010162631_teorema_personalized_pdf_download.sql`
- `20261010203434_teorema_pdf_download_controls.sql`

A única nova migration da Parte 5, `20261010233417_teorema_pdf_active_session.sql`, foi aplicada e verificada no Supabase. Cria `teorema_pdf_session_active(uuid,uuid)`. Não altera tabelas de negócio, não remove dados e não modifica sessões de clientes. A função é `SECURITY DEFINER` com `search_path=''`, parâmetros tipados, verificação interna de `service_role` e EXECUTE negado a `public`, `anon` e `authenticated`. Esse privilégio restrito permite somente verificar a existência da sessão do proprietário, sem conceder SELECT da tabela `auth.sessions` às aplicações.

## 6. Tabelas

- `profiles.full_name`: nome canônico do aluno, sem duplicação em cada licença.
- `pdf_licenses`: vínculo imutável ao usuário/produto/item/pedido, código único e estado.
- `pdf_download_logs`: reserva e resultado por tentativa, versão/hash do arquivo e timestamps.
- `pdf_license_events`: eventos append-only e decisões administrativas com motivo/operação.
- `orders`, `order_items`, `access_grants`, `product_files`: fonte existente de pagamento manual, origem e autorização.
- `teorema_private.request_limits`: orçamento persistente, sem IP e sem infraestrutura nova.
- `auth.sessions`: tabela já existente do Supabase, consultada pela ponte somente leitura.

Licenças e os dois ledgers têm RLS habilitada/forçada, isolamento de proprietário e escritas negadas aos clientes. Colunas internas do arquivo e detalhes administrativos não são expostos pelo SELECT do aluno.

## 7. Dependências

Nenhuma dependência nova na Parte 5. Personalização mantém `pdf-lib` e `@pdf-lib/fontkit`, com fonte Noto Sans privada/OFL. Testes usam o framework `node:test`/tsx e PGlite já instalado; navegador usa Playwright do runtime disponível, sem adicionar outro framework.

Auditoria de dependências de produção: `npm audit --omit=dev --json`, zero vulnerabilidades conhecidas informadas pelo registro na consulta desta etapa. Isso não substitui atualização e acompanhamento contínuos.

## 8. Variáveis de ambiente

Configuração documental, sem valores reais; não recriar `.env.example` contra a escolha do responsável:

```ini
PDF_LICENSE_SECRET=
PDF_MAX_DOWNLOADS=0
PDF_SHOW_CUSTOMER_NAME=true
PDF_SHOW_CUSTOMER_EMAIL=true
PDF_MASK_CUSTOMER_EMAIL=true
PDF_ENCRYPTION_ENABLED=false
```

`PDF_LICENSE_SECRET` está reservado, não é necessário nem utilizado: o código da licença usa `crypto.randomBytes(16)`, não HMAC. Não criar/alterar um segredo sem necessidade. As demais variáveis não usam `NEXT_PUBLIC_` e são lidas no servidor. Valores inválidos falham de forma segura, sem assumir opções por serem strings truthy.

`SUPABASE_SERVICE_ROLE_KEY` continua exclusivamente server-side, nos ambientes autorizados existentes. Nunca usar `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. URL e publishable key públicas não dão acesso ao original.

## 9. Storage e original privado

Configuração verificada no projeto Supabase `urgzsaftoiebsjkgyhsg`:

| Bucket | Público | Limite | Uso |
| --- | --- | --- | --- |
| `teorema-pdfs` | Não | 20 MiB | PDFs originais validados |
| `teorema-uploads` | Não | 20 MiB | Staging restrito ao administrador |
| `teorema-covers` | Sim | 5 MiB | Capas WebP, nunca originais PDF |

Original: `products/<produto>/<arquivo>.pdf`; IDs e caminhos internos não são usados no filename de download. Guardas restritivas do Storage negam operações dos clientes nos buckets gerenciados, mesmo que surja outra policy permissiva.

A pesquisa de `getPublicUrl` encontrou somente capas condicionadas a `kind === "COVER"`. O `createSignedUrl` remanescente pertence à validação administrativa server-side: o servidor consome a URL de 60 segundos e não a retorna ao navegador. O download do aluno não assina nem publica o original.

## 10. Licenças

Formato `LIC-` seguido de 32 caracteres hexadecimais aleatórios (128 bits). Código opaco, público, não derivado de UUIDs internos. Constraints únicas por item e por pedido/produto impedem duplicação; origem e proprietário não mudam. Downloads repetidos reutilizam a licença. Outro pedido legítimo pode ter outra licença do mesmo produto.

Geração exige pagamento manual confirmado e grant ativo, não uma alegação do frontend. Revogar uma compra/licença não invalida automaticamente outra compra legítima. Novas versões do mesmo produto usam a licença existente.

## 11. Revogar ou reativar

No painel já existente, na prévia autorizada: aba **Licenças de PDFs** -> localizar cliente/licença -> Revogar ou Reativar -> informar motivo -> confirmar.

Servidor verifica usuário, sessão ativa e autorização administrativa real; SQL verifica novamente o administrador. Operação UUID e versão esperada evitam duplicação, conflito e reaplicação de uma decisão antiga após resposta perdida. Reativar mantém código e contagem; não restaura um grant revogado nem confirma um pedido pendente.

Revogação bloqueia novas cópias. Não consegue apagar ou inutilizar um arquivo já entregue. Consultas e decisões com JWT ainda válido, mas sem sessão ativa, retornam 401.

## 12. Alterar limite e controlar abuso

`PDF_MAX_DOWNLOADS=0` significa ilimitado. Um inteiro positivo até 1.000.000 limita as gerações válidas da licença ao longo de toda a sua vida. Reservas PREPARING não expiradas também ocupam quota; decisões são serializadas no banco. Falha de geração libera a reserva; resultado desconhecido nunca libera PDF. Reservas abandonadas expiram após 150 segundos e são reconciliadas na próxima tentativa.

Ao atingir quota: 403, `DOWNLOAD_LIMIT_REACHED`. Reativação não zera a contagem. Separadamente, a infraestrutura existente limita `PDF_DOWNLOAD` a 20 solicitações por usuário/minuto, com resposta privada 429 e `Retry-After`. Indisponibilidade desse orçamento impede geração. Não foi contratado Redis, fila ou serviço novo.

Alterações de variáveis na Vercel exigem novo deploy. Não aplicar o valor 6 usado no ensaio local em produção por inferência.

## 13. Nome e e-mail

`PDF_SHOW_CUSTOMER_NAME` e `PDF_SHOW_CUSTOMER_EMAIL` ativam/desativam esses campos; `PDF_MASK_CUSTOMER_EMAIL=true` limita a exposição do e-mail. Nome vem de `profiles.full_name`, e-mail vem do usuário confirmado pelo Auth. O cliente não pode enviar outra identidade.

Nome com acento é preservado pela fonte incorporada; não há remoção de acentos como fallback. Perfis legados sem nome devem completar o cadastro antes do download quando a identificação por nome está ativa. A licença permanece nas três marcas mesmo com nome/e-mail desativados.

## 14. Logs

Eventos: LICENSE_CREATED, PDF_GENERATION_STARTED, PDF_GENERATION_SUCCESS, PDF_GENERATION_FAILED, PDF_DOWNLOAD_DENIED, LICENSE_REVOKED e LICENSE_REACTIVATED. Histórico disponível no painel, por licença, com contagem/última geração e motivos administrativos.

Não são registrados tokens, senhas, secrets, conteúdo do PDF, IP puro ou user-agent. IP/UA opcionais foram dispensados. Erros persistidos são códigos de domínio, nunca mensagens internas do Storage/Postgres.

Sucesso significa uma cópia autorizada, gerada e contabilizada para entrega. Não prova que o comprador a salvou em disco. Desconexão após confirmação pode consumir quota; comportamento conservador evita entrega não contabilizada. Logout detectado após geração registra tentativa FAILED sem sucesso.

Consulta somente leitura, para o administrador no SQL Editor:

```sql
select license_id, state, success, error_code, started_at, downloaded_at, finished_at
from public.pdf_download_logs
order by started_at desc
limit 100;
```

## 15. qpdf e criptografia

qpdf/AES-256 **não foi implementado nem ativado**, pois não há binário disponível no ambiente local e não existe provisionamento verificável desse executável no deploy atual. Não foi instalado Docker ou alterado o runtime para isso. Conforme o requisito condicional, o licenciamento/watermark funciona independentemente de criptografia.

`PDF_ENCRYPTION_ENABLED` ausente/`false` mantém o fluxo normal. `true` ou valor inválido bloqueia a geração e registra falha, em vez de entregar um arquivo alegando estar criptografado. Para ativar futuramente será necessário provisionar o binário, implementar/testar o adapter AES-256, definir explicitamente eventual senha de abertura e validar seu empacotamento no deploy. Não há senha aleatória desconhecida do comprador.

Permissões de copiar/imprimir não são DRM inviolável: ferramentas especializadas podem ignorá-las; screenshots e fotos continuam possíveis. A marca serve como rastreabilidade e desincentivo ao vazamento. Referência primária: [qpdf - opções de criptografia](https://qpdf.readthedocs.io/en/stable/cli.html#encryption-options).

## 16. Limitações e pendências operacionais

- Publicação comercial permanece bloqueada por ambiente/flags. A etapa não autoriza remover essas travas.
- Domínio/remetente SMTP aguardam definição anterior do responsável; não foram contratados serviços nem alterado DNS.
- Supabase informa proteção contra senhas vazadas desativada. Esse recurso exige plano Pro ou superior; nenhum upgrade pago foi realizado. [Documentação](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- INFO de RLS sem policies em `teorema_private.cart_operations` é intencional: clientes não possuem acesso a esse journal. [Explicação do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- O advisor de performance mantém 36 índices ainda não usados, sem novo problema de FK/indexação. São índices de integridade/consulta de fluxos ainda sem volume; não foram removidos por inferência. [Explicação do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- Conferência de sessão ativa é específica das operações sensíveis de PDF. Outras telas mantêm o Auth existente. [Supabase explica a validade residual do JWT após logout](https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out).
- Revogação/logout ocorridos após a autorização final não recolhem bytes já autorizados/entregues. Não há promessa de cancelamento retroativo.
- Testes SQL usam PGlite de conexão única; requisições simultâneas HTTP são reais, mas o transporte de banco/Auth/Storage é local simulado. Não é um teste de carga multiconexão contra produção.
- Original limitado a 20 MiB, cópia a 40 MiB; PDFs criptografados, inválidos ou com conteúdo ativo são recusados. Fonte, worker e dependências devem continuar incluídos no trace do deploy.
- Sem evidência de varredura dos logs runtime da Vercel nesta etapa se a integração continuar sem acesso ao projeto. Não confundir deploy READY com ensaio comercial real.

## 17. Testes e matriz de segurança

`npm test`: **126 testes passaram**, zero falhas, zero ignorados. O ensaio completo `check-cart-browser.mjs` passou com Next em build de produção, banco SQL local e seis requisições simultâneas concorrendo por uma única vaga: uma resposta PDF e cinco 403. Passaram também download no navegador, painel/revogação/reativação, 429/503, sessão encerrada e sessão removida durante a geração. Os erros HTTP provocados são intencionais; não houve erro de execução de JavaScript no navegador.

PDF sintético de duas páginas renderizado e inspecionado com Poppler: retrato A4 e paisagem, três marcas em ambas, nome Débora França com acento, e-mail mascarado, código consistente e conteúdo preservado. Metadados não contêm nome/e-mail, JavaScript ou criptografia declarada. Artefatos sintéticos locais permanecem ignorados pelo Git.

| Caso obrigatório | Evidência |
| --- | --- |
| Código seguro da licença | `pdf-licenses.test.ts` |
| E-mail mascarado e flags | `pdf-watermark.test.ts` |
| Filename sem PII/header injection | `pdf-hardening.test.ts` e `library.test.ts` |
| Posição determinística | `pdf-watermark.test.ts` |
| João/José/André/Débora e Unicode | `pdf-watermark.test.ts` |
| Anônimo e usuário sem compra | SQL de licenças e ensaio HTTP |
| Compra válida e original não exposto | `pdf-download.test.ts` e download real no navegador local |
| Revogar/reativar e isolamento | `pdf-controls.test.ts`, SQL/RLS e painel no navegador |
| Limite e requisições simultâneas | SQL atômico e seis POST HTTP com uma única vaga |
| Várias páginas/paisagem/rotação | `pdf-watermark.test.ts` e PDF sintético no navegador |
| Storage indisponível/arquivo ausente | Orquestração, mapper e HTTP 500/404 |
| PDF inválido/corrompido/protegido | `pdf-watermark.test.ts` e worker/HTTP |
| Sessão encerrada com JWT válido | `pdf-hardening.test.ts` e remoção da sessão no transporte local |
| Logout durante geração | HTTP 401, sem corpo PDF e log FAILED |
| Rate limit/orçamento indisponível | HTTP 429/503 antes de ler o original |
| Segredos fora do frontend | Inspeção dos assets após build |

Somente PDFs e contas sintéticos foram usados. Dados reais não foram personalizados, baixados nem alterados para os testes.

## 18. Lint

`npm run lint`: passou na revisão final, sem erros.

## 19. TypeScript

`npm run typecheck`: passou, com `strict: true`; sem `any` novo ou `@ts-ignore`.

## 20. Build, banco e deploy

`npm run build`: passou com a configuração normal do projeto, após encerrar o fixture. Fonte Noto Sans e worker de validação foram conferidos no trace da rota. A inspeção de 28 assets do frontend passou: nenhum valor de segredo configurado ou marcador de RPC privilegiada de PDF encontrado. `git diff --check` passou.

Banco real: histórico com 15 migrations, incluindo somente a nova migration desta etapa. Confirmados privilégios da ponte de sessão e ausência de SELECT direto de `auth.sessions` para anon/authenticated/service_role. Contagens preservadas: 2 perfis, 4 produtos, 0 pedidos, 0 licenças, 0 logs, 0 eventos de licença. PDF/staging continuam privados e capas públicas. Advisors não introduziram alerta novo.

O commit/push e o resultado do deploy do commit exato são conferidos na entrega pelo status da integração Vercel no GitHub. A checagem HTTP pública também deve manter os endpoints de PDF bloqueados em produção com cache privado. Isso não equivale a testar compras reais nem autoriza publicação comercial; as travas existentes permanecem.

Reprodução local (PowerShell, certificado sintético existente e Playwright do runtime):

```powershell
npm run typecheck
npm run lint
npm test
$env:PLAYWRIGHT_MODULE='C:/Users/bezin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
$env:TEOREMA_BROWSER_PRODUCTION='true'
$env:TEOREMA_FIXTURE_TLS_CERT=(Resolve-Path '.data/pdf-part3-tls/cert.pem').Path
$env:TEOREMA_FIXTURE_TLS_KEY=(Resolve-Path '.data/pdf-part3-tls/key.pem').Path
$env:TEOREMA_FIXTURE_PDF_MAX_DOWNLOADS='6'
node scripts/check-cart-browser.mjs
npm run build
node scripts/check-build-secrets.mjs
```

O certificado é local/ignorado, precisa estar válido e não deve ser enviado ao repositório. O script de navegador encerra somente seus próprios processos. Build do fixture usa credenciais falsas; o build final normal restaura o contexto normal do projeto sem sobrescrever arquivos de ambiente.
