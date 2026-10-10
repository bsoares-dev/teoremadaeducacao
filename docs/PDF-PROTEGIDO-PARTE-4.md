# Parte 4 — auditoria, limites e administração de licenças

## Escopo e preservação

Implementação da quarta parte do sistema de PDFs protegidos. Mantidos Supabase
Auth, `profiles.full_name`, pagamentos manuais pelo WhatsApp, pedidos
`CONFIRMADO`, acessos `ATIVO/REVOGADO`, catálogo, uploads, área do aluno,
watermarks, arquivos originais privados e travas comerciais existentes.

A nova aba **Licenças de PDFs** está no painel existente `/admin` e segue a
mesma habilitação de prévia autorizada de **Pedidos e acessos**. Não habilita
carrinho/download comercial em produção. Não cria outro painel ou serviço pago.

## Fluxo e concorrência

1. `POST /api/library/download` continua aceitando somente `productId`.
2. A rota verifica a sessão e aplica o orçamento persistente `PDF_DOWNLOAD`.
3. O serviço cria um UUID de tentativa exclusivamente no servidor. Uma RPC
   resolve a compra/acesso e a mesma licença da Parte 1, registra o início e
   reserva uma vaga no limite, se configurado.
4. O original privado é lido e personalizado como na Parte 3, sem URL do original
   enviada ao cliente ou cópia personalizada persistida no Storage.
5. Antes de devolver bytes, a conclusão verifica novamente a mesma licença,
   compra, acesso, arquivo e nome, dentro de uma transação. Uma revogação durante
   o preparo impede a entrega. Falha na confirmação do banco também impede a
   resposta com PDF.
6. A conclusão registra sucesso ou código sanitizado de falha e um evento.
   Sucessos são contabilizados antes de iniciar a resposta privada em stream.

Reservas, conclusões e decisões administrativas usam o advisory lock
transacional por conta `commerce:<userId>`, já utilizado pelos pedidos/acessos.
Sucessos mais reservas não expiradas ocupam o limite. Não há contador em memória
de uma instância da Vercel nem contador confiado ao navegador.

Cada reserva dura 150 segundos, acima do orçamento de preparo de 120 segundos.
Falhas liberam a vaga; processos interrompidos deixam uma reserva que expira.
A próxima reserva registra as expirações pendentes. Uma tentativa expirada
nunca consegue concluir com sucesso, mesmo depois de outra ocupar sua vaga.
Não foram criados Cron ou filas. Conclusão repetida não incrementa novamente;
reutilizar o UUID de uma tentativa não autoriza uma segunda geração.

Os locks são transacionais e liberados pelo PostgreSQL ao encerrar a transação.
Referências: [locking do PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html),
[funções e permissões no Supabase](https://supabase.com/docs/guides/database/functions).

## Tabelas e segurança

- `pdf_download_logs`: uma tentativa por UUID, origem imutável de licença,
  usuário, produto e pedido; versão/hash do arquivo somente no servidor;
  `PREPARING/SUCCESS/FAILED`, `success`, código de erro e timestamps.
- `pdf_license_events`: histórico append-only com
  `LICENSE_CREATED`, `LICENSE_REVOKED`, `LICENSE_REACTIVATED`,
  `PDF_GENERATION_STARTED`, `PDF_GENERATION_SUCCESS`, `PDF_GENERATION_FAILED`
  e `PDF_DOWNLOAD_DENIED`. Decisões incluem administrador, operação idempotente,
  estado esperado e motivo. Nome/e-mail são consultados por relacionamento,
  não duplicados nos logs.
- `pdf_licenses`: somente uma chave de origem composta adicional para validar
  os relacionamentos dos logs. Identidade, código, compra e titular permanecem
  protegidos pelos constraints/triggers da Parte 1.

RLS habilitado e forçado nas duas tabelas. Alunos podem consultar apenas colunas
seguras de seus próprios registros; não podem gravar, alterar, apagar ou ler
dados de terceiros. Motivos/atores administrativos e detalhes da versão não são
concedidos ao cliente. Policies restritivas também bloqueiam futuras policies
permissivas acidentais. Eventos e tentativas finalizadas são imutáveis.

Todas as novas RPCs são `SECURITY INVOKER`, `search_path=''`, com EXECUTE
somente para `service_role`. A administração é conferida tanto na API quanto
na função SQL com a elegibilidade administrativa privada existente. O ator
vem da sessão verificada, nunca do JSON. O cliente administrativo permanece
`server-only` e nenhuma chave foi criada, copiada ou alterada.

Não são coletados IP ou User-Agent: são opcionais e desnecessários nesta versão.
Não são registrados tokens, senhas, secrets, stack traces ou conteúdo do PDF.
Pedidos negados por compra/licença/limite geram eventos com identidade validada;
requisições rejeitadas antes disso (sessão ausente, origem inválida, orçamento de
requisições) não inventam um titular de licença para criar eventos de download.

## Usar a administração

Na prévia autorizada, acessar `/admin` → **Licenças de PDFs**:

1. Buscar por e-mail completo, código completo da licença ou estado.
2. Conferir material, cliente/e-mail, pedido, código, estado, criação,
   quantidade de PDFs autorizados e último download.
3. **Ver histórico** exibe eventos, falhas e decisões, com paginação de 20.
4. **Revogar licença** → informar motivo → **Confirmar decisão**.
5. **Reativar licença** → informar motivo → **Confirmar decisão**.

Reativação exige conta, compra confirmada e acesso válidos. Preserva código,
titular e contador acumulado; não libera um pedido pendente nem restaura um
acesso revogado. Uma licença revogada bloqueia novos downloads dessa origem,
não inutiliza arquivos já salvos. Outra compra realmente válida segue as regras
de autorização existentes. Despublicar um material não revoga a compra.

Decisões usam UUID de operação e timestamp esperado. O painel registra a
tentativa em um journal de sessão antes do POST. Em perda de resposta, usar
**Recuperar decisão da licença**: a mesma operação é consultada/confirmada,
sem aplicar novamente uma revogação antiga após reativação posterior. Estado
desatualizado exige atualizar antes de uma nova decisão. Journal ilegível
bloqueia novas decisões; não deve ser descartado sem conferir o histórico.

As alterações de estado pela aplicação devem passar pelo painel/RPC, não por
UPDATE manual: o histórico atribuído ao administrador é parte dessa transação.

## Alterar limite

Configuração opcional **server-side**, sem `NEXT_PUBLIC_`:

```ini
PDF_MAX_DOWNLOADS=0
```

Ausente/zero: ilimitado, preservando a política aprovada. Um inteiro positivo
(ex.: `3`) limita os sucessos acumulados por licença; falhas não consomem.
Reservas em andamento ocupam vagas temporárias. Ao atingir o limite, a API
devolve 403 e `DOWNLOAD_LIMIT_REACHED`, com mensagem amigável. Valores inválidos
falham fechados. Faixa defensiva: 0 a 1.000.000.

Para mudar, configurar a variável no ambiente desejado e fazer novo deploy;
localmente, reiniciar o servidor. Reduzir abaixo da contagem atual bloqueia novos
downloads; aumentar ou usar zero permite novos. Reativar não zera o contador.
Não houve alteração do `.env.local` nem das variáveis reais da Vercel.
Preservada fora do commit a exclusão preexistente de `.env.example` pelo usuário.

**Semântica do contador:** sucesso significa que a cópia foi gerada e autorizada
para resposta, não prova que o navegador concluiu a transferência ou salvou no
disco. Uma desconexão/perda de resposta depois do COMMIT pode consumir uma vaga;
contagem conservadora evita entrega sem limite. O padrão continua ilimitado.

## Consultar logs no SQL Editor

Consultas somente leitura, executadas pelo administrador:

```sql
select l.license_code,d.state,d.success,d.error_code,
       d.started_at,d.downloaded_at,d.finished_at
from public.pdf_download_logs d
join public.pdf_licenses l on l.id=d.license_id
order by d.started_at desc limit 100;

select l.license_code,e.event,e.error_code,e.created_at
from public.pdf_license_events e
left join public.pdf_licenses l on l.id=e.license_id
order by e.created_at desc limit 100;
```

Eventos de negação sem compra/licença existente ficam sem `license_id` e
continuam disponíveis no SQL Editor. O painel de histórico é por licença.

## Arquivos

Criados:

- Migração `teorema_pdf_download_controls`.
- `lib/pdf-download/limits.ts`, `tracked.ts`, `ledger-repository.ts`.
- `lib/admin-pdf-contract.ts`, `lib/pdf-licenses/admin-repository.ts`.
- `app/api/admin/pdf-licenses/route.ts` e `[id]/route.ts`.
- `app/admin/pdf-license-manager.tsx`.
- `tests/pdf-controls.test.ts` e este relatório.

Modificados:

- `lib/pdf-download/service.ts` e `types.ts`.
- `app/admin/dashboard.tsx`: aba carregada sob demanda, reutilizando o CSS atual.
- `scripts/check-cart-browser.mjs`: transporte das novas RPCs e ensaio integrado.

Nenhuma dependência adicionada. Nenhuma página existente redesenhada.

## Validação

Em 10/10/2026:

- TypeScript e lint: aprovados.
- Suíte completa: **120/120**, sem falhas, cancelamentos ou skips.
- Build com configuração normal: aprovado. Houve um bloqueio temporário do
  OneDrive em `.next`; a repetição passou sem alterar arquivos/configuração.
- Scanner de 28 assets frontend: nenhuma credencial configurada do servidor.
- Trace do download inclui fonte incorporada e worker de validação.
- Navegador, Next de produção com credenciais fictícias: aprovado. Download
  efetivo, contagem, histórico, revogação, reativação, recuperação após perda de
  resposta/reload com um único evento, journal corrompido bloqueado, endpoints
  administrativos negados ao aluno/anônimo e JSON/origem falsificados rejeitados.
- Layout conferido em 320/390/768/1440 px, sem overflow ou erros de execução.
- SQL inclui 12 solicitações concorrentes na fixture, quota de 2, falhas,
  expiração, conclusão tardia, estado/nome alterado, licença revogada, reativação
  sem zerar contagem, retry antigo, RLS, constraints e EXECUTE restrito.

Os ensaios usam migrations reais em PGlite isolado; Auth/REST/Storage são
transportes simulados. PGlite serializa transações em uma conexão. Não é um
benchmark de carga com várias conexões de produção. Nenhuma conta, compra,
licença ou PDF de cliente foi criado/alterado para esses ensaios remotos.

## Conferência remota

Migração aplicada e conferida em `urgzsaftoiebsjkgyhsg`, sem executar migrations
históricas novamente:
`20261010203434_teorema_pdf_download_controls.sql`.

- As cinco novas RPCs: INVOKER, search_path vazio, somente service_role com EXECUTE.
- Ambas as tabelas: RLS habilitado e forçado, sem leitura anônima.
- Colunas de arquivo/motivos administrativos: não concedidas ao aluno.
- Buckets `teorema-pdfs` e `teorema-uploads` continuam privados.
- Preservados 2 perfis e 4 produtos; pedidos/licenças/logs/eventos continuam
  vazios em produção. Não foi criado dado comercial ou fixture nesse banco.
- Security Advisor: sem novo alerta de segurança. Continua o WARN anterior de
  [proteção contra senhas vazadas desabilitada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
  Nenhuma configuração de Auth foi alterada nesta parte.
- INFO anterior da tabela interna `cart_operations` sem policies permanece:
  acesso pelo cliente é intencionalmente negado.
- Performance Advisor: somente 36 INFO de índices ainda não utilizados,
  incluindo os recém-criados em tabelas vazias. Nenhuma FK nova sem índice.
  Não remover índices de integridade/paginação apenas por falta de uso inicial.

Commit/push seguem o fluxo de entrega autorizado. O resultado do deploy do
commit exato é informado na entrega final, sem presumir sucesso por um push.
As travas de publicação comercial permanecem. A Parte 5 aguarda comando;
criptografia opcional não foi implementada nesta parte.
