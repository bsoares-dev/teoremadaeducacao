# Etapa 9 — Homologação e segurança

Data: 07/10/2026 (São Paulo). Status: EM VALIDAÇÃO — entrega parcial de hardening/validações concluída; ensaio real e infraestrutura pendentes, sem aceite comercial. Etapa 10 ADIADA até definição do domínio; não dispensada.

## Autorizações e limites

Responsável autorizou ensaio no Supabase atual `urgzsaftoiebsjkgyhsg`, com registros sintéticos identificados e exibição temporária de dois materiais `[HOMOLOGACAO] — não comprar`. Arquivar produtos, revogar acessos e bloquear apenas novas contas de teste ao final, preservando histórico. Não alterar produto/perfil existente. Não enviar mensagem no WhatsApp nem confirmar pagamento real. Não abrir travas de Production, criar outro projeto, contratar recursos, trocar segredos ou atualizar infraestrutura por inferência.

## Correções desta etapa

- `/admin` e API administrativa de usuários exigem UUID elegível privado além do e-mail confirmado. Corrigida divergência entre leitura de PII e decisões comerciais. Metadados `role=admin` não elevam privilégios.
- Next 16.3.8/source-map-js 1.2.2: corrigidas vulnerabilidades reportadas pelo npm audit. Auditoria sem achados nas dependências instaladas em 07/10/2026.
- Schemas de cadastro estritos; origem exata, JSON com media type exato e corpo limitado. Identidade sempre do servidor.
- Headers de segurança, noindex privado e global em Preview. CSP estática restrita, mas com inline para Next: não equivale a nonce estrito. Sem domínio/canonical/HSTS inventado.
- Migração `20261008024344_teorema_request_limits` aplicada/verificada: limites por conta e ação atômicos no Postgres, RPC privada ao servidor; `429`/Retry-After/no-store; retries preservam a tentativa. Não é defesa completa contra DDoS/contas em massa.
- Prefixo reservado de homologação oculto no catálogo de Production após deploy desta revisão. Antes do deploy, a versão anterior pode exibir os materiais de teste, como autorizado.
- Documentação de segurança atualizada para rascunhos, pedidos, acessos e entrega privada; retiradas afirmações legadas de publicação imediata/download futuro.

## Evidências

| Camada | Resultado e limite |
| --- | --- |
| Tipos e lint | Aprovados após hardening/limites e no build de produção |
| Testes de regras/SQL | 68 testes aprovados, zero falhas; inclui três testes de orçamento persistente |
| Navegador integrado isolado | Revalidação com limites aprovada; SQL/RLS real em PGlite, Auth/REST/Storage simulados; não prova Auth/Storage remotos |
| Build local de produção | Next 16.3.8 compilado; smoke HTTP aprovado com flags true e fluxo comercial ainda bloqueado |
| Navegador público de produção | Home/catálogo/login/cadastro em 320/390/768/1440; títulos, heading principal, descrição, noindex privado; sem overflow/erros de execução ou CSP observados |
| Credenciais no cliente | 26 assets de produção inspecionados: nenhum valor de credencial privada configurada encontrado. Não substitui toda a auditoria de exposição |
| Banco real | 8 migrações anteriores preservadas; nona de limites aplicada. Sete controles novos com zero violações |
| Dados antes/depois da migração | 1 perfil, 1 produto, 0 arquivos, 0 pedidos, 0 acessos e 0 contadores; preservados |
| Dependências | npm audit: zero vulnerabilidades instaladas nessa data |
| Ensaio real | Pré-check Auth recusou a credencial anterior (`invalid_credentials`). Nenhum produto/conta/pedido criado; sem alteração de senha |
| API Supabase real | Smokes somente leitura de contratos/grants/elegibilidade/biblioteca aprovados; nenhum registro criado |
| Advisors | Aviso de senhas vazadas desabilitadas; RLS sem política de cart_operations é bloqueio intencional servidor-only. 20 índices sem uso são informativos com tráfego mínimo; preservados |
| Vercel | Integração 403. Build/deploy/smoke remoto não comprovados |

O ensaio local cobre preço alterado, material indisponível, resposta perdida após commit, retentativa, cancelamento, confirmação repetida, revogação/reliberação, outra origem de compra válida, objeto ausente, cache inseguro, isolamento de contas, logout, atualização e expiração de URL. Larguras 320/390/768/1440, sem erros de execução/overflow também após o limitador.

O smoke em `127.0.0.1` encontrou divergência com a origem canônica de loopback normalizada pelo Next (`localhost`). Reexecutado em `localhost` e aprovado, mantendo comparação estrita de origem. Não ampliar allowlist de CSRF nem confiar cegamente em forwarded-host para contornar isso; callback real ainda precisa de teste na Vercel/domínio.

## Ensaio real reproduzível (opt-in; altera somente dados de teste)

`scripts/check-commerce-live.mjs` não roda em CI nem em `npm test`. Requer:

- Credencial atual do admin já existente, por stdin sem eco ou variável temporária `TEOREMA_TEST_ADMIN_PASSWORD` em `.env.local` ignorado pelo Git. Nunca inserir em código/comando/relatório/manifesto, nem enviar no chat. Remover a variável local temporária após uso.
- `TEOREMA_LIVE_TEST_APPROVED=urgzsaftoiebsjkgyhsg` e `TEOREMA_LIVE_PUBLICATION_APPROVED=true`, somente no processo de ensaio.
- Playwright + Edge; `PLAYWRIGHT_MODULE` pode apontar para a instalação existente.
- Porta local 3108 livre, ambiente configurado e nova migração aplicada. Usar `http://localhost:3108` (origem canônica de loopback do Next), não misturar aliases com `127.0.0.1` nos requests. Servidor escuta somente no loopback. Não executar em paralelo com outro Next dev/build deste checkout.

Fluxo: admin real → dois rascunhos → upload TUS/PDF e capas reais → publicação temporária → duas contas sintéticas → login → seleção/carrinho → pedido idempotente com requisições concorrentes → resumo WhatsApp sem envio → confirmação concorrente → dois acessos → download real → versão 2 → despublicação → revogação → limite persistente → expiração de token → logout.

Contas sintéticas começam sem confirmação; o teste verifica login recusado e confirma somente essas contas via Admin API. Isso **não testa SMTP** e não pode ser usado para confirmar clientes automaticamente. Os CPFs são sintéticos com dígitos válidos, não dados coletados de alunos.

Manifesto privado `.data/etapa9-live/<run>/manifest.json`: somente IDs, verificações e encerramento; sem senha/CPF/telefone/token/URLs assinadas. Em falha, reconcilia somente o prefixo exclusivo desse run para recuperar respostas perdidas. Arquiva/revoga/bloqueia; não apaga registros/objetos validados. `PENDING` exige revisão antes de outro ensaio.

## Pendências antes do aceite final

1. Credencial atual e execução real completa: autorização já recebida; aguardando variável local do responsável. Não redefinir senha para contornar a recusa.
2. Confirmação/recuperação por e-mail real, SMTP e callbacks. Contas sintéticas confirmadas pelo Admin API não provam entrega de e-mail.
3. Reautorizar escopo Vercel para consultar deployment e testar Preview real/CSP/TUS. Push não é evidência de deploy bem-sucedido.
4. PostgreSQL real 17.6; Supabase anunciou 17.11 com correções. Pre-check não encontrou colunas ltree, extensão btree_gist, operadores próprios da aplicação ou funções com cifras legadas. Não é garantia de upgrade sem risco. Preparar backup, confirmar janela e executar atualização separadamente: [changelog](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes), [guia](https://supabase.com/docs/guides/platform/upgrading).
5. Advisor de senhas vazadas desabilitadas; revisar política/MFA com o responsável sem contratar upgrade: [remediação](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
6. Backup completo/recuperação de Auth e Storage, limites/CAPTCHA e configurações finais de publicação. Snapshot DPAPI da etapa 2 não cobre tudo.

Não marcar a etapa 9 CONCLUÍDA enquanto integrações essenciais/risco de infraestrutura não forem resolvidos ou houver decisão explícita documentada. Não iniciar a etapa 10 automaticamente.
