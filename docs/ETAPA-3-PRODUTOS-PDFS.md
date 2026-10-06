# Etapa 3 — produtos e uploads privados

Status: implementação local verificada e banco/Storage aplicados; **EM VALIDAÇÃO** até ensaio real de PDF/capa/publicação. Atualizado em 05/10/2026. Após configuração manual da Vercel, o responsável mostrou um rascunho salvo com sucesso no painel. A integração Vercel segue sem acesso (403). O responsável adiou o restante do teste real e autorizou iniciar a etapa 4.

## Entrega

- Aba Produtos no painel: criação de rascunhos, edição de título/descrição/preço, capa enviada pelo admin, publicação, despublicação e arquivamento.
- Publicação exige capa e PDF atual validado, com objeto definitivo em bucket privado. O cadastro antigo que publicava sem PDF foi desativado (HTTP 410).
- Revisão otimista evita sobrescrever edição concorrente; operações administrativas e uploads têm histórico no banco.
- Upload retomável TUS, direto do navegador para `teorema-uploads`, usando autorização assinada para um caminho específico, sem upsert. Chunks de 6 MiB, retries e progresso. Não persiste tokens no navegador; retomada automática cobre a tentativa em curso, não promete retomada após fechar a página.
- Finalização autenticada no servidor: identidade administrativa confirmada por UUID privado, tamanho real limitado, assinatura e conteúdo verificados. O navegador não escolhe caminhos definitivos nem informa hash confiável.
- PDF: até 20 MiB; parser em worker com limite de memória e 15 segundos; rejeita senha, scripts, anexos, formulários, ações e links externos. Até 5.000 páginas, com limites de complexidade. Política conservadora: PDF exportado como documento estático. **Não é antivírus, sanitização completa ou garantia contra toda vulnerabilidade de leitores PDF.**
- Capa: JPEG/PNG/WebP estático de até 5 MiB e 24 megapixels; decodificada, metadados removidos, redimensionada e convertida para WebP antes de publicação.
- PDFs definitivos imutáveis, com SHA-256 calculado pelo servidor. Novas versões preservam a anterior e os snapshots de compras. Finalizar envio antigo não rebaixa uma versão mais recente.
- Despublicar/arquivar não revoga acesso existente; arquivado não aceita novas edições/envios.
- Envios incompletos podem ser validados novamente ou cancelados. Limpeza administrativa explícita em lotes de 20, somente após 48 horas (TUS pode durar 24 horas). Remove temporários e arquivos rejeitados; não apaga PDF/capa validado nem histórico. Sem cron ou limpeza recorrente criada.

## Aplicação autorizada e ativação pendente

Responsável autorizou aplicar migração/criar buckets e fazer commit/push em 05/10/2026. Migração aplicada no projeto atual, sem outro projeto, upgrade ou Docker:

`supabase/migrations/20261005235705_teorema_admin_product_uploads.sql`

Versão local alinhada ao histórico remoto. Snapshot de dados/estrutura afetados em `.data/backups/2026-10-05-pre-stage3.json`, fora do Git. Não é backup completo de Auth/Storage. Zero produtos, arquivos e pedidos antes/depois; perfil existente preservado por comparação de digest.

Antes da aplicação: revisar backup/recuperação, histórico de migrações e produtos existentes. A migração transforma produto legado sem PDF validado em rascunho; não apagar dados. Não reaplicar migrações anteriores.

Buckets criados e verificados pelo SDK/API do Storage, sem INSERT manual em `storage.buckets`. Script `node scripts/provision-pdf-storage.mjs` verifica sem escrita; `--apply` cria somente buckets ausentes, exige autorização e nunca altera bucket existente automaticamente:

| Bucket | Público | Limite | MIME permitido |
| --- | --- | --- | --- |
| teorema-uploads | Não | 20 MiB | application/pdf, image/jpeg, image/png, image/webp |
| teorema-pdfs | Não | 20 MiB | application/pdf |
| teorema-covers | Sim | 5 MiB | image/webp |

O terceiro bucket é a área de processamento: impede que uma capa não validada fique pública. As políticas restritivas bloqueiam leitura/listagem/escrita com credenciais de visitante/aluno nos três buckets; autorização temporária de upload é emitida exclusivamente pelo backend administrativo.

Somente após migração e configuração verificadas, definir no ambiente servidor:

```ini
TEOREMA_PRODUCT_UPLOADS_ENABLED=true
```

Não prefixar com NEXT_PUBLIC_. O padrão é desativado. Variável documentada em `.env.example`; nenhuma variável da Vercel foi alterada. A conexão Vercel retornou HTTP 403 para o escopo `bsoares-devs-projects`; configurar esta variável em Production no dashboard e fazer redeploy, ou reconectar a integração ao time correto. O push pode disparar build automaticamente, mas não ativa uma variável ausente.

Verificação remota: tabela de uploads com RLS; seis RPCs novas SECURITY INVOKER e sem EXECUTE para anon/authenticated; identidade administrativa do servidor e contrato de dados verificados por API somente leitura. Advisor de segurança mantém apenas o aviso preexistente de proteção contra senhas vazadas desativada, sem upgrade contratado. Performance: apenas índices ainda não usados, sem FKs sem índice.

## Evidências locais

- `npm test`: 36 testes passaram, incluindo seis subtestes novos de banco e cinco testes novos de validação de arquivos.
- Lint e TypeScript sem erros; build de produção verificado nesta continuação.
- Banco descartável PGlite: aplicação real da migração sobre a base, rascunho, retries, objeto ausente, capa obrigatória, conflito de revisão, preservação de versão comprada, atualização do resolver, despublicação/arquivamento sem revogar e bloqueio de aluno/RLS/Storage.
- PDFs e imagens sintéticos gerados em memória; nenhuma conta, pedido, arquivo ou liberação criada em produção.

## Aceite ainda pendente

Teste real autenticado: admin envia PDF/capa e publica material de teste; aluno não envia/substitui; objeto publicado permanece privado. Verificar transporte TUS, worker no ambiente de deploy, layout mobile e comportamento de retry com Storage real. Testes locais não substituem esse ensaio.

Etapas 4–10 não foram executadas. Ainda não há checkout, confirmação de compras na interface ou biblioteca de downloads entregue ao cliente.
