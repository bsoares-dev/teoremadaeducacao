# Correção do banco — Teorema da Educação

## Estado da entrega

Correções aplicadas ao projeto remoto `urgzsaftoiebsjkgyhsg` em 04/10/2026 UTC (03/10 no horário de São Paulo), após inspeção direta pelo conector Supabase.
As 12 verificações de supabase/verify.sql retornaram zero pendências. O usuário e perfil existentes foram preservados; as demais tabelas estavam vazias.
Histórico remoto: `20261004005128_teorema_accounts_catalog_security`, `20261004005139_teorema_carts_security` e uma migração adicional `teorema_catalog_policy_cleanup` removendo a política antiga duplicada de produtos.
A limpeza adicional aplicada e registrada no histórico remoto foi:

```sql
drop policy if exists "Qualquer um pode ver produtos ativos" on public.products;
```

Auditoria real também confirmou ausência de carts.updated_at, corrigida pela migração, CPF já único e função de evento rls_auto_enable com permissões públicas excessivas, agora revogadas. O snapshot local prechange-structure.json guarda somente definições/permissões e está ignorado pelo Git; não é backup completo dos dados.

Aviso de Auth restante: proteção contra senhas vazadas desativada (recurso Pro ou superior). Não foi alterado plano/cobrança. Avisos informativos de índices ainda não utilizados foram mantidos: as tabelas estão vazias/quase vazias, e isso não justifica removê-los.
Referências dos avisos: [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) e [índices não utilizados](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
Esta correção cobre as cinco tabelas informadas, grants, RLS, o trigger de perfil conhecido e operações seguras de carrinho. Não substitui uma auditoria de funções/views desconhecidas, Storage, configurações Auth, backups ou pagamentos.

Não execute novamente o SQL antigo com CREATE TABLE users/products/carts/cart_items.
Não exclua tabelas, usuários ou dados para instalar estas migrações.

## Reaplicar ou instalar em outro ambiente

Não é necessário executar novamente no projeto atual. As instruções abaixo ficam para recuperação/reprodução.

1. Faça um backup/exportação privada do banco e guarde as definições de políticas/triggers de supabase/audit.sql. Não publique arquivos com dados pessoais.
2. Em SQL Editor → New query, cole o conteúdo COMPLETO de supabase/migrations/20261003_accounts_catalog.sql e clique Run.
3. Se terminar com sucesso, abra outra New query e execute o conteúdo COMPLETO de supabase/migrations/20261003_carts.sql.
4. Execute supabase/verify.sql em uma terceira consulta e envie os resultados agregados para validação.

Cada arquivo de migração tem sua própria transação e pode ser reaplicado. Se o segundo falhar, o primeiro permanece aplicado; não desfaça a proteção do primeiro. Uma falha aborta as alterações daquele arquivo. Se a sessão indicar transação abortada, execute ROLLBACK antes de tentar novamente.
Se ocorrer timeout de trava, aguarde um período de menor atividade e tente o arquivo completo novamente. Não remova verificações para contornar erros de estrutura ou duplicidade.
Se o painel advertir sobre operações destrutivas, revise: há revogações de permissões e substituições de políticas/triggers, mas não há DROP TABLE, TRUNCATE ou DELETE de registros na aplicação da migração. O DELETE dentro da função de carrinho só roda quando o backend solicita remover um item.

## O que muda

- Login continua no Supabase Auth; não existe senha local em profiles.
- Perfil continua ligado a auth.users. Carrinho continua ligado a profiles.
- Aluno lê apenas seu perfil, carrinhos e itens. Não altera preço, total, proprietário ou status diretamente pela API.
- Visitantes leem somente produtos ativos, sem acesso a perfis/carrinhos/cadastros antigos.
- Grants antigos de tabela E de coluna são revogados. Políticas restritivas impedem que permissões RLS antigas mais amplas liberem registros de outro usuário.
- Registros antigos de registrations são preservados e bloqueados para clientes públicos.
- A função existente handle_new_user é preservada com search_path fixo.
- Preços e quantidades novos recebem limites. CHECK NOT VALID preserva dados antigos inválidos, mas valida novas escritas.
- Novas funções SQL permitem ao servidor gerenciar carrinhos atomicamente, sem receber preço/total/status do cliente.

## Contrato das funções exclusivas do servidor

Após autenticar com getUser(), o backend usa a service role e o ID retornado pela sessão:

| Função | Parâmetros | Retorno |
| --- | --- | --- |
| teorema_get_or_create_cart | p_user_id UUID | UUID do carrinho aberto |
| teorema_set_cart_item | p_user_id UUID, p_cart_id UUID, p_product_id UUID, p_quantity inteiro | Total recalculado |
| teorema_prepare_cart | p_user_id UUID, p_cart_id UUID | Total revalidado para atendimento |

A quantidade é absoluta (não um incremento); 0 remove, 1–1000 define a quantidade. Preço vem de products e é atualizado quando o item é alterado. A preparação revalida todos os preços e bloqueia itens inativos antes de mudar para SENT_TO_WHATSAPP. Apresente o valor retornado ao cliente; ele pode mudar desde a adição ao carrinho.

Carrinhos fechados não aceitam mudanças por essas funções. Uma segunda preparação retorna erro de estado; após timeout, consulte o carrinho antes de tentar novamente. Nenhuma função marca como pago. Quando houver pagamento, será necessário um fluxo separado e idempotente, com confirmação confiável do provedor e validação do valor.

Não existe endpoint novo nem checkout/pagamento implementado nesta correção de banco. O site continua atendendo compras pelo WhatsApp. As funções ficam disponíveis para conectar o carrinho posteriormente, sem abrir escrita direta ao navegador.

## Interpretar a verificação

- Itens 01–05: devem ser zero. Qualquer valor indica falha de configuração.
- Itens 06–11: dados históricos a revisar, sem apagar ou sobrescrever automaticamente.
- Item 12: funções privilegiadas adicionais acessíveis por API; precisam de auditoria individual. Não revogue funções desconhecidas sem verificar seus consumidores.
- Constraints NOT VALID não significam que a tabela antiga foi saneada. Valide-as somente após revisão dos registros históricos.
- Não foi criada unicidade de CPF nem feita mesclagem de contas: isso exige verificar duplicidades e regras comerciais primeiro.

## Verificação funcional depois da aplicação

1. Testar cadastro com confirmação de e-mail, login e leitura do próprio perfil.
2. Confirmar que um aluno não lê dados de outro e não acessa o admin.
3. Administrador confirmado consegue listar perfis/criar produto; produto ativo aparece no catálogo.
4. Executar npm test, npm run typecheck e, opcionalmente, node scripts/check-supabase.mjs (verificação remota somente de leitura).
5. Não considerar o banco de produção corrigido até as migrações e a verificação remota concluírem.

Base técnica: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e [funções/permissões](https://supabase.com/docs/guides/database/functions), documentação oficial do Supabase.
