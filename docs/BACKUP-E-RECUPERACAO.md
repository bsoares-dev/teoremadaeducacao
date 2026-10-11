# Backup e recuperação

## Estado da etapa — 11/10/2026

INICIADA, com inventário e procedimento preparados. **Backup completo e recuperação
real ainda não executados.** Este documento e um preflight aprovado não substituem
um backup. A publicação comercial foi solicitada para depois desta etapa; permanece
bloqueada até sua validação e o aceite integrado de vendas/download.

O responsável escolheu uma pasta privada fora do OneDrive e recuperação em ambiente
local isolado. Destino proposto: `%LOCALAPPDATA%\CodeCommerce\TeoremaBackups`.
Antes de exportar: conferir caminho real, ausência de links para pastas sincronizadas
e permissões restritas ao operador/SYSTEM. Nunca colocar backups no repositório,
`public`, anexos do chat, relatórios ou artefatos de deploy.

## O que precisa ser recuperável

| Componente | Cobertura necessária |
| --- | --- |
| Banco | Schema, linhas, funções, triggers, índices, constraints, RLS e grants |
| Identidade | Auth, identidades vinculadas, perfis e UUIDs administrativos privados |
| Comércio | Produtos, versões, carrinhos, pedidos/itens, autorizações, licenças e auditoria |
| Histórico | `supabase_migrations`, sem reparar/reaplicar versões às cegas |
| Storage | Configuração dos três buckets, metadados e os bytes de cada objeto |
| Configurações externas | Auth/redirects, SMTP, Vercel, domínio e variáveis, com valores secretos guardados separadamente |
| Criptografia anterior | Chaves históricas necessárias para dados cifrados, em cofre separado do backup |

O plano Free exige exportação própria. Backups de banco não contêm os bytes de
Storage. Um dump de `public` sozinho também não recupera contas, papéis privados
ou histórico de migrations. [Documentação oficial de backups](https://supabase.com/docs/guides/platform/backups).

Não exportar hashes de senhas, tokens ou dados pessoais pelos resultados visíveis
do conector SQL. Usar a conexão PostgreSQL e ferramentas de backup no computador,
criptografando os arquivos antes de qualquer cópia externa. Não imprimir `.env.local`.

## Inventário confirmado

Conferência somente leitura no projeto existente:

- PostgreSQL 17.6; 17 migrations remotas, preservadas.
- Quatro contas/perfis, quatro produtos; zero publicados.
- Zero pedidos, acessos, licenças e registros legados de cadastro.
- Uma reserva de upload `UPLOADING`, sem PDF validado. Preservar esse histórico;
  não confundir com perda de arquivo comprado nem removê-lo automaticamente.
- Três buckets: PDFs e uploads privados; capas públicas; zero objetos nos três.
- Dois administradores convidados ainda aguardam primeiro acesso. Não desativar
  confirmação de e-mail global antes de resolver a segurança desses convites.
- Os snapshots antigos não incluem recuperação integral de Auth e Storage.

Estas contagens descrevem este instante, não prometem que o banco continuará vazio.
Repetir o inventário antes de exportar e no ambiente restaurado.

## Acesso local necessário

No projeto Supabase, abrir **Connect → Session pooler** e configurar apenas no
`.env.local` ignorado pelo Git:

```dotenv
TEOREMA_BACKUP_DB_URL="postgresql://postgres.PROJECT_REF:SENHA_CODIFICADA@HOST_DO_SESSION_POOLER:5432/postgres?sslmode=require"
```

Substituir localmente usando os valores da tela **deste projeto** e a senha atual
do banco. Não é a senha do login no site, nem a service role. Codificar caracteres
reservados da senha na URL; `@next/env` expande `$`, portanto não inserir senha com
`$` cru. Não enviar a conexão no chat, passá-la como argumento de comando, redefinir
a senha nem alterar credenciais da aplicação para contornar acesso ausente.

Faltam ferramentas PostgreSQL locais nesta máquina. Para o caminho nativo, precisam
estar disponíveis `pg_dump`, `pg_restore` e `psql` da versão 17 ou 18. O preflight
aceita caminhos locais explícitos em `TEOREMA_PG_DUMP_BIN`,
`TEOREMA_PG_RESTORE_BIN` e `TEOREMA_PSQL_BIN`, sem mudar o PATH global.

O caminho recomendado pelo Supabase CLI usa Docker para executar ferramentas de
dump; **não instala Docker nem cria outro banco na organização automaticamente**.
O caminho nativo evita essa dependência, mas o dump completo inclui objetos
gerenciados que exigem compatibilidade e tratamento durante a recuperação.
Não prometer restauração só porque `pg_dump` terminou.
[Guia oficial](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[limites do dump nativo](https://supabase.com/docs/guides/self-hosting/restore-from-platform).

## Conferência reproduzível — somente leitura

```powershell
node scripts/check-backup-readiness.mjs
```

Saída agregada, sem PII/caminhos privados/credenciais. Código 0: pré-requisitos
nativos presentes; código 2: pendência; código 1: inspeção incompleta. O script
não autentica o login no PostgreSQL, não verifica ACL/links do destino e **não
exporta, criptografa, restaura ou habilita vendas**. Ele confere bucket/contagens
via servidor e distingue reserva incompleta de PDF validado sem objeto.

`supabase/backup-inventory.sql`, executado como dono do banco, complementa o
inventário com Auth/tabelas privadas/RLS/extensões, sem exportar linhas sensíveis.
Conferir o histórico com a integração SQL ou CLI separadamente.

## Execução do backup — próxima ação após configurar o acesso

1. Revalidar o projeto, versão, histórico e diretório real com acesso restrito.
2. Confirmar ferramenta/método e chave de criptografia recuperável. Guardar a chave
   em local separado; DPAPI do usuário Windows sozinho não protege contra perda
   deste computador/perfil. Nenhuma chave existente será substituída.
3. Exportar banco e roles sem senhas de papéis, incluindo Auth, schemas privados,
   customizações de Auth/Storage e histórico. Um método que os exclua precisa de
   exportação complementar; conferir tabelas/objetos efetivamente presentes.
4. Exportar bytes e metadados de **todos** os buckets com paginação/recursão e
   SHA-256 por objeto. A existência de metadados não comprova a integridade do PDF.
5. Registrar início/fim, commit, migrations, versões das ferramentas, tamanho,
   hashes e contagens em manifesto privado. Não registrar tokens/URLs assinadas.
6. Criptografar e verificar a decifragem/integridade. Nunca deixar dump aberto no
   Git/OneDrive. Não declarar recuperação por apenas conferir hashes do pacote.
7. Banco e Storage não têm snapshot atômico conjunto: para um conjunto consistente,
   planejar janela sem uploads/escritas ou reconciliar inventários antes/depois e
   reexecutar se houver mudanças. Não interromper produção sem avisar o responsável.

## Ensaio local isolado

Restaurar exclusivamente em destino novo, vazio, identificado como teste e com
versões compatíveis de PostgreSQL/Auth/Storage/extensões. Conferir a conexão real;
nome `test` não é prova de isolamento. **Nunca usar restore/reset sobre produção.**

- Desativar egress de e-mail, WhatsApp, webhooks e integrações no destino.
- Recuperar papéis/schema/dados e customizações preservando ownership/grants/RLS.
  O destino Supabase já contém objetos gerenciados; evitar importação cega.
- Evitar triggers de cadastro/criptografia dispararem novamente na importação;
  qualquer supressão é limitada à transação de restore no destino isolado.
- Restaurar objetos via API Storage no destino, sem `upsert` sobre arquivos
  existentes; confirmar visibilidade privada e hashes.
- Comparar contagens, vínculos, migrations, funções, políticas e grants. Conferir
  contas administrativas por UUID; nunca elevar por e-mail/user_metadata.
- Testar Auth real com **contas sintéticas próprias do ensaio**, pedidos/licenças,
  autorização cruzada, cópia personalizada, revogação e limite. Não impersonar
  clientes nem consumir convites reais durante o ensaio.
- Guardar resultado e duração. PGlite cobre SQL/testes sintéticos locais, mas não
  substitui recuperação da plataforma inteira nem Auth/Storage reais.

## Verificação desta preparação

- Pasta proposta criada vazia fora do OneDrive. ACL conferida: herança bloqueada,
  apenas usuário atual e SYSTEM, sem permissões adicionais nem reparse point no destino.
- Inventário SQL agregado executado no banco: zero tabelas da aplicação sem RLS e
  zero arquivos validados sem objetos. Nenhuma linha foi alterada.
- Preflight real: código 2, como esperado para conexão/ferramentas ausentes.
- Quatro testes específicos aprovados, incluindo SQL em PostgreSQL PGlite sintético.
- Suíte completa: 152 testes aprovados, zero falhas. Não equivale a restauração de
  um dump real nem ao ensaio integrado dos serviços em produção.
- TypeScript, lint e build aprovados; 30 assets do cliente conferidos sem valores
  das credenciais privadas configuradas. O scanner também cobre a conexão de backup.
- Nenhuma migration, dependência, configuração Auth/SMTP, segredo, produto ou trava
  comercial alterada. `.env.example` permanece excluído por decisão anterior.

O diretório ainda não contém arquivos de backup. Esta verificação não atesta
criptografia, exportação nem recuperação de dados reais.

## Operação e incidente

RPO efetivo é a idade do último backup bem-sucedido e consistente, não a data de
criação deste procedimento. RTO só será informado depois do ensaio medido.
Não foi configurada rotina agendada, retenção automática ou serviço pago.
Uma segunda cópia criptografada em dispositivo/local independente deve ser
definida para resistir à perda do computador; chave separada e acesso restrito.

Em incidente: preservar evidências, bloquear novas operações comerciais de forma
controlada, escolher ponto de recuperação, calcular perda possível, obter aprovação
da janela e restaurar primeiro isoladamente. Corrigir por migração adiante quando
possível. Rollback da Vercel não desfaz dados, não recupera PDFs e não pode reabrir
políticas antigas. Restore de produção, upgrade/pause do Supabase ou exclusão de
dados exige decisão específica; não faz parte da rotina de commit/push.

## Critério de conclusão e publicação subsequente

Backup criptografado real + manifesto + bytes Storage + chave recuperável +
recuperação isolada funcional + evidências de integridade e permissões.

Depois: ensaio comercial completo no domínio, configuração/flags de produção,
políticas comerciais fornecidas pelo responsável, admin operante e smoke do deploy
exato. O site institucional estar publicado não equivale a vendas habilitadas.
