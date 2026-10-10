# Parte 3 — download privado e personalizado

## Escopo

O botão e o visual da biblioteca foram mantidos. `POST /api/library/download`
agora devolve exclusivamente o PDF personalizado, em vez de um ticket com URL
assinada do original. A documentação antiga da etapa 8 descreve o comportamento
anterior; para entrega de PDFs, este relatório passa a ser a referência.

Autenticação, pagamentos manuais pelo WhatsApp, status `CONFIRMADO`, decisões de
acesso `ATIVO/REVOGADO`, catálogo, uploads administrativos e travas comerciais
continuam iguais. Não foi criada infraestrutura paga nem um novo banco.

## Fluxo

1. O cliente envia somente `productId`, em JSON estrito e da mesma origem.
2. O servidor valida a sessão com `auth.getUser()`, confirmação de e-mail e
   elegibilidade da conta; aplica o orçamento persistente `PDF_DOWNLOAD` existente.
3. Uma nova RPC exclusiva do servidor seleciona uma compra `CONFIRMADO` com
   acesso `ATIVO`, resolve a versão validada atual em bucket privado e reutiliza
   a licença atômica da Parte 1. Uma licença revogada nunca é recriada.
4. O nome vem de `profiles.full_name`; o e-mail, do usuário verificado no Auth.
   Contas antigas sem nome são orientadas a completar o perfil, quando a
   identificação por nome estiver habilitada.
5. O servidor lê o original com credenciais server-side, em stream limitado a
   20 MiB. Confere tamanho, MIME, cache e SHA-256 contra a versão validada.
6. O serviço da Parte 2 valida o PDF e gera as três camadas de identificação.
7. Antes de entregar, a RPC verifica novamente **a mesma licença/compra**, a
   autorização, a versão e o nome. Atualizações durante o preparo exigem retry.
8. Somente os bytes personalizados são enviados em chunks de 64 KiB. O browser
   recebe um Blob local, inicia o download e revoga o object URL; não persiste
   bytes, caminhos do original ou tokens em localStorage/sessionStorage.

Não são salvas cópias personalizadas no Storage ou no disco do servidor. O único
cache do serviço de PDF continua sendo a fonte pública incorporada, sem dados
do comprador. Há limite defensivo de 40 MiB para a cópia gerada/recebida.

## Banco e segurança

A migração `teorema_personalized_pdf_download` adiciona somente a função
`public.teorema_prepare_pdf_download(uuid,uuid,text,uuid)`, `SECURITY INVOKER`
com `search_path=''`. EXECUTE é revogado de PUBLIC, anon e authenticated e
concedido apenas a service_role. Não altera tabelas, dados, triggers ou RLS
preexistentes.

Aplicada e conferida no projeto `urgzsaftoiebsjkgyhsg` em 10/10/2026:
`20261010162631_teorema_personalized_pdf_download.sql`. O histórico anterior
foi preservado. Conferência remota: anon/authenticated sem EXECUTE,
service_role com EXECUTE, RLS de licenças ativo, buckets privados mantidos e
nenhuma licença ou compra real criada por esta entrega.

A seleção inicial usa a origem válida mais antiga, com desempate por UUID,
para manter o vínculo consistente. Outra compra realmente válida pode manter
acesso se uma origem antiga foi revogada; a revalidação de uma geração já
iniciada não troca de origem. Os constraints da Parte 1 e o advisory lock
transacional por conta impedem licenças duplicadas.

Verificado no Supabase: `teorema-pdfs` e `teorema-uploads` privados;
`teorema-covers` público somente para capas. O caminho do PDF permanece
`products/<productId>/<fileId>.pdf`. Políticas restritivas já existentes impedem
clientes de consultar/listar/assinar/alterar originais. `getPublicUrl` das capas
e URLs administrativas usadas somente no servidor não foram modificados.

Nenhum `createSignedUrl` ou `getPublicUrl` é usado pelo novo download protegido.
O cliente administrativo continua exclusivamente server-side.

## HTTP e experiência do aluno

- 401: sessão ausente/encerrada, com retorno ao login.
- 403: conta não elegível, compra/acesso inválido ou licença revogada.
- 404: produto/PDF ausente; também é preservado o bloqueio comercial existente.
- 409: versão/nome alterado durante preparo ou nome ainda não preenchido.
- 429: orçamento de requisições existente, com Retry-After.
- 500: Storage, integridade, geração, PDF inválido/corrompido/encriptado ou falha
  interna do download. Mensagens sanitizadas, sem stack trace ou detalhes do banco.

Resposta de sucesso:

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="material-seguro.pdf"
Cache-Control: private, no-store
Vercel-CDN-Cache-Control: no-store
CDN-Cache-Control: no-store
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

O nome do arquivo usa o título do material sanitizado, removendo também e-mails
e UUIDs que eventualmente estejam no título. Não usa nome, e-mail ou IDs do
comprador. `X-Material-Version` contém somente o número da versão.

O botão mostra “Preparando material…”. Há timeout de leitura do Storage de
30 segundos, orçamento de preparo/configuração da função de 120 segundos e
timeout no browser de 130 segundos. A interrupção da geração é cooperativa;
o limite de execução da plataforma continua sendo a fronteira final.

Streaming Node.js evita a resposta bufferizada sujeita ao limite da plataforma,
sem trocar runtime ou expor um link do original. [Limites da Vercel](https://vercel.com/docs/functions/limitations),
[orientação oficial para respostas acima de 4,5 MB](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions),
[streaming](https://vercel.com/docs/functions/streaming-functions),
[Storage privado Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Arquivos

Criados:

- `lib/pdf-download/types.ts`: contratos internos e erros públicos.
- `lib/pdf-download/repository.ts`: contexto autorizado e leitura privada limitada.
- `lib/pdf-download/prepare.ts`: integridade, personalização e revalidação.
- `lib/pdf-download/service.ts`: adaptação server-only e identidade verificada.
- `lib/pdf-download/response.ts`: resposta streaming privada.
- Migração `teorema_personalized_pdf_download`.
- `tests/pdf-download.test.ts`.
- Este relatório.

Modificados:

- `app/api/library/download/route.ts` e `lib/library.ts`.
- `lib/library-contract.ts` e `app/meus-materiais/library.tsx`.
- `next.config.mjs`: rastreamento da fonte, worker e dependências desta rota.
- `lib/file-validation.ts` e `lib/pdf-validation-worker.cjs`: envelope explícito
  `{ bytes }` no worker. O Turbopack adiciona metadados ao objeto workerData;
  enviar diretamente Uint8Array perdia sua estrutura no build. Mantidos a
  política de PDFs estáticos, os limites de recursos e o timeout existente.
- `tests/library.test.ts` e `tests/uploads.test.ts`, incluindo regressão do envelope.
- `scripts/check-cart-browser.mjs` e fixtures tipadas de banco.
- `scripts/check-commerce-live.mjs`: ensaio opt-in atualizado para o novo contrato;
  não executado contra produção nesta parte.

Nenhuma dependência adicionada; nenhuma variável secreta criada/alterada.
Configurações de identidade da Parte 2 continuam opcionais e server-side.
A exclusão preexistente de `.env.example` pelo usuário foi preservada fora do commit.

## Validação e limites do escopo

Resultados finais em 10/10/2026:

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado, sem avisos; diagnóstico temporário removido.
- `npm test`: **108/108 aprovados**, sem falhas, cancelamentos ou skips.
- `npm run build`: aprovado com a configuração normal do projeto, depois do
  ensaio isolado com credenciais fictícias.
- `scripts/check-cart-browser.mjs` com `TEOREMA_BROWSER_PRODUCTION=true`:
  aprovado no Next de produção. Inclui o download efetivo pelo botão, comprador
  válido, compra pendente/ausente, usuário anônimo, licença/acesso revogado,
  outra conta, versão atualizada com a mesma licença, original inacessível,
  Storage indisponível, arquivo ausente/corrompido e cache inseguro.
- Ensaio também preservou cadastro, nome do perfil, carrinho, pedidos,
  confirmação administrativa, logout e layout em 320/390/768/1440 px; nenhum
  erro de execução JavaScript no navegador.
- PDF realmente recebido pelo endpoint: renderizado e inspecionado nas duas
  páginas (retrato/paisagem). Extração confirmou as três identificações,
  `Débora França`, e-mail mascarado, licença consistente e conteúdo original.
- Trace da rota inclui fonte Noto Sans, worker, pdf-lib e fontkit.
- `node scripts/check-build-secrets.mjs`: 27 assets do cliente conferidos;
  nenhum valor de credencial server-side configurada foi encontrado.
- Migração e permissões conferidas no Supabase após aplicação.

Para repetir o ensaio de navegador, fornecer `PLAYWRIGHT_MODULE`, um certificado
HTTPS local válido em `TEOREMA_FIXTURE_TLS_CERT` e sua chave em
`TEOREMA_FIXTURE_TLS_KEY`, além de `TEOREMA_BROWSER_PRODUCTION=true`. O script
usa banco PGlite e credenciais fictícias; o certificado fica somente em `.data`
ignorado pelo Git. Não desabilitar a validação TLS do Node. Depois do ensaio,
executar novamente `npm run build` para restaurar o build com configuração normal.

O Supabase não apontou novo alerta de segurança após a migração. Permanecem
avisos **anteriores**: [proteção contra senhas vazadas desativada no Auth](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
(WARN), [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
na tabela privada cart_operations (INFO; bloqueio de clientes intencional) e
[23 índices ainda sem uso observado](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
(INFO; não foram removidos). Configuração do Auth não foi alterada nesta parte.

Os transportes Auth/REST/Storage do navegador são simulados localmente; SQL,
RLS, constraints, RPCs, Next, personalização e download do browser são reais.
Nenhum cliente, pedido ou PDF real é criado nos testes desta parte. As travas
comerciais não são removidas para demonstrar o download no domínio público.

Revogação bloqueia novas gerações; não torna inutilizáveis arquivos já salvos.
Existe uma fronteira inevitável entre a última verificação e a entrega em rede;
não se promete revogar bytes já enviados. Fontes e política de PDF da Parte 2
mantêm suas limitações documentadas, inclusive revisão de materiais sem margens.

Logs de download, limite opcional por licença, ações administrativas de licenças
e criptografia permanecem para as Partes 4 e 5, não iniciadas automaticamente.
