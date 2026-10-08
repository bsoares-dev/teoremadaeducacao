# Pendências operacionais — Teorema da Educação

Verificação: 08/10/2026 (São Paulo). Etapa 9 ainda EM VALIDAÇÃO.
Este checklist não autoriza a etapa 10 nem a publicação comercial.

## Estado verificado

| Controle | Evidência | Estado |
| --- | --- | --- |
| Identidade administrativa | Login real e verificação do UUID privado passaram | Verificado no pré-check, não em todo o fluxo |
| Confirmação por e-mail | `/auth/v1/settings`: e-mail ativo, `mailer_autoconfirm=false` | Preservada; entrega não comprovada |
| Ensaio de upload real | Uma reserva de PDF foi criada, mas nenhum objeto chegou ao Storage; ensaio interrompido | Pendente |
| Encerramento dos ensaios | 3 rascunhos identificados, todos arquivados; 0 contas sintéticas, pedidos, acessos e objetos | Verificado por consulta remota |
| Contratos/leitura anônima | HEAD real: contratos aprovados; perfis/cadastros/carrinhos/itens bloqueados HTTP 401, catálogo HTTP 200 | Verificado em 08/10 |
| Negociação CORS de TUS | OPTIONS real respondeu 200 e permite `x-signature` e origem | Não prova a transferência/autorização do arquivo |
| Vercel | Integração retorna 403 também após reconexão; CLI solicitou autenticação adicional ao responsável | Acesso/deploy ainda não comprovados |
| PostgreSQL | Projeto saudável, plano Free, versão 17.6 | Manutenção pendente |
| MFA do administrador da aplicação | 0 fatores verificados em Supabase Auth | Pendente; não confundir com MFA da conta da plataforma |
| Advisor de senhas vazadas | WARN; recurso disponível no Pro ou superior | Não resolvido; nenhum upgrade contratado |
| Backup | Snapshots anteriores não incluem recuperação integral de Auth/Storage | Insuficiente para autorizar manutenção |

O log do Storage registrou `AccessDenied / Invalid Compact JWS` no período analisado. Não há correlação completa por identificador entre esse registro e a requisição do navegador. Não concluir que basta mudar uma chave ou abrir RLS. Nas tentativas de diagnóstico houve interferência de alertas genéricos e uma interrupção do próprio teste, corrigidas no instrumento de ensaio; a última tentativa parou no pré-check Auth sem código específico. A causa final do envio ainda precisa de comprovação.

Todos os manifestos ficam em `.data/etapa9-live`, ignorados pelo Git, com IDs e resultados sanitizados. A recuperação do ensaio interrompido validou o prefixo exclusivo antes de arquivar seu produto. Nenhum registro ou objeto validado foi apagado. A reserva pendente foi preservada; não reenviar nem limpar sem consultar seu estado.

Revalidação local desta revisão: lint e `node --check` aprovados; 68 testes aprovados, zero falhas. Isso não substitui o ensaio remoto, a entrega SMTP ou o aceite do deployment.

## Ordem de resolução

1. **Vercel:** concluir o login oficial da CLI autorizado pelo responsável; confirmar equipe/projeto; consultar o deploy do commit atual e os logs limitados ao problema. Não vincular outro projeto, fazer redeploy automático nem desativar proteção. Interromper se o acesso continuar recusado.
2. **Upload real:** separar erros do instrumento de teste dos erros da aplicação; observar reserva → assinatura → TUS → validação, registrando somente fronteira, método, status e categoria. Nunca gravar tokens, URLs assinadas, corpo de Auth ou credenciais. Consultar a reserva antes de qualquer retentativa. Só prosseguir para pedido/download quando essa fronteira passar.
3. **SMTP:** decisão do responsável em 08/10/2026: **aguardar o domínio do Teorema**. Resend foi proposto como opção com plano gratuito, mas nenhuma conta, chave, remetente ou DNS foi configurado. Após definir o domínio: verificar propriedade, configurar SPF/DKIM e DMARC sem substituir registros existentes indevidamente; configurar SMTP TLS no Supabase; preservar confirmação de e-mail; conferir Site URL/allowlist e testar confirmação e recuperação com destinatário de teste autorizado. Confirmação via Admin API não substitui entrega real.
4. **Backup recuperável:** preparar dump privado de schema/roles/dados, incluindo Auth, e exportação separada dos bytes e metadados de Storage. Preservar chaves históricas de dados cifrados, fora do Git e dos relatórios. Conferir hashes, contagens, criptografia e recuperação em ambiente isolado aprovado. Credenciais de banco/Management ainda não estão disponíveis localmente; não pedir valores no chat nem redefinir senha de banco. O plano Free requer exportação própria; banco não inclui os bytes de Storage.
5. **PostgreSQL:** somente após backup e ensaio de recuperação, consultar elegibilidade/versão oferecida e aprovar janela de indisponibilidade. Pausar/restaurar ou atualizar não está autorizado pela rotina de migrações SQL. No Free, restaurar um projeto pausado pode atualizá-lo para a versão menor mais recente; não fazer isso como diagnóstico. Após manutenção: saúde, versão, histórico de migrações, RLS/grants, trigger, Auth, Storage e fluxo real completos.
6. **Segurança de contas:** revisar política de senha no Supabase, reautenticação e MFA com o responsável. MFA da conta Supabase/Vercel é diferente do administrador do site. Apenas cadastrar TOTP no Auth, sem exigir `aal2` nas operações sensíveis, não encerra o controle; eventual integração/enforcement deve ser uma alteração de código explicitamente tratada e testada. Não registrar segredos/QR ou cadastrar fatores em nome do responsável.
7. **Proteção contra abuso:** revisar limites da plataforma, volume esperado e CAPTCHA. Não ligar CAPTCHA no Auth sem integrar/testar o cliente, pois isso pode bloquear cadastros. Proteção nativa de senhas vazadas exige escolha de plano: não contratar nem tratar uma alternativa como equivalente sem avaliação.
8. **Aceite:** repetir o ensaio inteiro com dados identificados, verificar encerramento e registrar limites ainda aceitos explicitamente. Não declarar etapa 9 concluída, venda aberta ou deploy aprovado apenas por commit/push.

## Acessos e decisões ainda necessários

- Login Vercel na equipe correta; consentimento do responsável já recebido, conclusão a verificar.
- Domínio do Teorema e conta SMTP: adiados por escolha explícita.
- Método/credenciais de backup e ambiente de recuperação, configurados em canal local seguro.
- Janela de manutenção, somente depois de backup verificado.
- Decisão sobre proteção de senhas vazadas/plano e implementação completa de MFA/CAPTCHA, sem contratação automática.

Não foram alterados planos, segredos, DNS, configuração SMTP, MFA, CAPTCHA, versão do banco ou travas comerciais nesta revisão. Sem nova migração necessária: histórico remoto permanece com nove migrações.

## Referências oficiais

- [SMTP do Supabase](https://supabase.com/docs/guides/auth/auth-smtp).
- [SMTP Resend](https://resend.com/docs/send-with-smtp), [domínio verificado](https://resend.com/docs/add-a-domain), [limites do plano](https://resend.com/pricing).
- [Backup e limites de Storage](https://supabase.com/docs/guides/platform/backups).
- [Atualização do PostgreSQL](https://supabase.com/docs/guides/platform/upgrading).
- [Proteção de senhas e planos](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- [Uploads TUS assinados](https://supabase.com/docs/guides/storage/uploads/resumable-uploads#presigned-uploads).
