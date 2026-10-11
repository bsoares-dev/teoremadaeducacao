# Backup e recuperação

## Estado da etapa — 11/10/2026

EM VALIDAÇÃO. **Exportação criptografada real criada e integridade conferida;
recuperação funcional ainda não executada.** A leitura do arquivo PostgreSQL não
substitui uma restauração com Auth e Storage funcionando. Posteriormente, em
11/10/2026, o responsável solicitou deixar esta etapa de lado e liberar as travas
comerciais independentemente dela. [Decisão e escopo](PUBLICACAO-COMERCIAL.md).
Esta exceção não declara recuperação verificada; o pacote existente foi preservado.

O responsável escolheu uma pasta privada fora do OneDrive e recuperação em ambiente
local isolado e autorizou Docker para esse ensaio. Destino efetivo:
`%USERPROFILE%\CodeCommerce\TeoremaBackups`.
Antes de exportar: conferir caminho real, ausência de links para pastas sincronizadas
e permissões restritas ao operador/SYSTEM. Nunca colocar backups no repositório,
`public`, anexos do chat, relatórios ou artefatos de deploy.

O caminho inicialmente proposto em `%LOCALAPPDATA%` foi rejeitado: o processo do
aplicativo resolvia essa pasta para seu cache virtualizado. O destino efetivo tem
caminho físico conferido, fora do OneDrive e do cache do aplicativo, com herança de
ACL bloqueada e acesso somente ao usuário atual/SYSTEM. A antiga pasta vazia foi
preservada; nenhum backup foi movido ou apagado.

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

Conexão PostgreSQL autenticada e TLS cliente conferidos, sem divulgar a conexão.
Ferramentas portáteis oficiais PostgreSQL 17.11-4 foram preparadas; não foi instalado
um servidor, serviço Windows ou alterado o PATH. `pg_dump`, `pg_dumpall`,
`pg_restore` e `psql` ficam em
`%LOCALAPPDATA%\CodeCommerce\Tools\PostgreSQL-17.11-4\pgsql\bin`.
O ZIP foi conferido contra o SHA-256 publicado pelo fornecedor antes da execução:
`b9424ee7bc60b52450ff910a3630225df32e633f3cb29c1d126d9299d59aea28`.
[Checksum do fornecedor](https://github.com/EnterpriseDB/edb-installers/issues/706).

Para o caminho nativo, precisam estar disponíveis ferramentas da versão 17 ou 18.
O preflight
aceita caminhos locais explícitos em `TEOREMA_PG_DUMP_BIN`,
`TEOREMA_PG_DUMPALL_BIN`, `TEOREMA_PG_RESTORE_BIN` e `TEOREMA_PSQL_BIN`, sem mudar o PATH global.

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

## Execução do backup

O operador configurou uma senha exclusiva, diferente da senha do banco, somente
em `TEOREMA_BACKUP_PASSPHRASE` no `.env.local`. Guardar essa senha no gerenciador de
senhas, separado do pacote. Mínimo de 20 caracteres; não enviar no chat. Se contiver
`$`, escapar como `\$` no arquivo, evitando expansão por `@next/env`. O script recusa
essa ambiguidade e não modifica nenhuma variável ou senha.

```powershell
node scripts/create-encrypted-backup.mjs --create
```

Comando exclusivo do operador, não endpoint do site. Exige destino previamente
protegido e projeto/conexão esperados. Cria uma subpasta nova, sem sobrescrever
backups. Dump customizado e roles sem senhas ficam em memória; objetos são
enumerados com paginação/recursão, baixados e conferidos por hash. Só o pacote
criptografado é gravado. Inventários de Storage antes/depois precisam coincidir.

Formato `TEOBKP01`: cabeçalho versionado autenticado, AES-256-GCM, salt aleatório
de 32 bytes, IV de 12 bytes, tag de 16 bytes e chave de 32 bytes derivada por scrypt
(`N=131072`, `r=8`, `p=1`). Senha não é armazenada no cabeçalho nem no manifesto.
O leitor somente entrega bytes após autenticar o pacote inteiro. Usa primitivas
nativas do Node; nenhuma dependência nova foi adicionada.

O conteúdo cifrado inclui banco, roles, manifesto, migrations, configuração/metadados
dos buckets e bytes de objetos existentes. Inclui somente configurações locais
selecionadas da aplicação, nunca a senha do backup, conexão do banco ou senha de teste
administrativa. Não exporta configuração remota de SMTP/Auth, DNS, variáveis remotas
da Vercel nem chaves históricas externas; esses itens precisam de registro em cofre.

Limites: pacote em memória de até 128 MiB; não é uma estratégia escalável para
catálogo grande. Recusa excesso em vez de declarar exportação parcial como sucesso.
Assinaturas de replicação não são exportadas: o script recusa uma origem com elas;
consulta somente leitura confirmou zero nesta origem. Snapshot de banco e Storage
não é atômico; a conferência antes/depois reduz, mas não elimina, esse limite.
Antes de volume comercial, planejar janela consistente e solução de backup maior.

Protocolo aplicado:

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

## Exportação real e inspeção offline — 11/10/2026

- Pacote: `2026-10-11T21-26-10-850Z-08c29f1a/teorema.backup.enc`, sob o destino privado.
- Tamanho: 850.816 bytes; SHA-256:
  `f2ccc24caa3486d062798aed36f8ff2e052fe36bd65a8f3ed21171013e651ad5`.
- Quatro contas, quatro perfis, quatro produtos e 17 migrations presentes.
- Três buckets com **zero objetos**: configuração/metadados preservados. Não havia
  PDFs para copiar; isso não comprova restauração de bytes de um material real.
- Dump contém dados de Auth, Storage, perfis, produtos, permissões administrativas
  privadas e histórico; `pg_restore --list` conferido em memória.
- Pacote gravado, relido, autenticado, decifrado em memória e comparado com o
  conteúdo original, incluindo hashes internos. Nenhum dump aberto foi gravado.
- Commit da aplicação registrado no manifesto: `781f50611b54f11a0dbbac3c87ca955b8b7715d3`.

Para revalidar posteriormente sem conexão ao banco ou service role:

```powershell
node scripts/inspect-encrypted-backup.mjs --file "C:\Users\bezin\CodeCommerce\TeoremaBackups\2026-10-11T21-26-10-850Z-08c29f1a\teorema.backup.enc"
```

Precisa somente da senha local e do `pg_restore` compatível. Saída apenas agregada;
nenhuma linha pessoal, segredo, nome de objeto ou configuração é impressa. Não
extrai arquivos abertos, conecta a bancos nem restaura. Senha incorreta/corrupção
interrompem a inspeção. `isolatedRecoveryVerified` continua `false` até o ensaio.

## Ensaio local isolado

### Pré-requisito pendente neste computador

Windows 11 Pro, build 26200, 15,7 GiB de RAM. O WSL não está instalado e o operador
deste processo não tem privilégios administrativos. Instalador oficial do Docker
preparado em `C:\Users\bezin\CodeCommerce\Installers\Docker Desktop Installer.exe`,
versão 4.94.0.241994, assinatura Authenticode válida de Docker Inc. SHA-256 local:
`a9814e31049d66156477a86614e83365669677733014ec72f74229623ff3890a`.
O instalador **não foi executado** e nenhuma licença foi aceita pelo agente.

Próximas ações do responsável:

1. Salvar o trabalho e abrir PowerShell **como administrador**. Executar
   `wsl --install --no-distribution`; não instala Ubuntu adicional desnecessário.
   Reiniciar se o Windows solicitar, sem reinicialização automática pelo agente.
2. Conferir `wsl --version` (Docker exige WSL 2.1.5 ou posterior). Se necessário,
   seguir a atualização oficial; não alterar BIOS/UEFI ou política corporativa por tentativa.
3. Abrir o instalador preparado, escolher instalação para o usuário atual e
   backend WSL 2. Revisar/aceitar os termos pessoalmente, se aplicáveis ao uso da empresa.
4. Abrir Docker Desktop e aguardar o mecanismo ficar pronto. Avisar para retomar
   a criação e conferência do ambiente isolado; ainda não executar restore manual.

[Instalação oficial do Docker](https://docs.docker.com/desktop/setup/install/windows-install/),
[instalação do WSL](https://learn.microsoft.com/en-us/windows/wsl/install),
[opção sem distribuição](https://learn.microsoft.com/en-us/windows/wsl/basic-commands#install).

Não foi instalado serviço privilegiado, aceito contrato, contratado plano, criado
projeto Supabase remoto, alterado componente Windows ou iniciado ambiente local.
O instalador sozinho não comprova isolamento nem recuperação.

### Procedimento após o Docker estar pronto

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

## Histórico da preparação inicial

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

Esses resultados descrevem a preparação inicial. Foram superados pela exportação
real registrada acima, mas não pelo teste de recuperação, que continua pendente.

## Verificação da exportação e dos utilitários

- Inspeção independente do pacote real aprovada, incluindo AES-GCM, hashes e TOC.
- Zero assinaturas de replicação, conferidas em transação somente leitura.
- 12 testes específicos de backup aprovados: criptografia, senha incorreta,
  corrupção, limites, manifesto, isolamento das credenciais e scripts somente leitura.
- Nenhuma migration ou dependência nova. Nenhuma alteração no frontend, dados de
  produção, Auth/SMTP, segredos ou flags comerciais. `.env.example` continua excluído.
- Suíte completa: 172 testes aprovados, zero falhas; TypeScript e lint aprovados.
- Build final aprovado, 39 páginas geradas. Houve `EPERM` ao limpar um cache antigo
  com atributos de OneDrive; esse cache foi preservado em subpasta ignorada `.data`
  e a reconstrução passou, sem exclusão de arquivos ou alteração do código do site.
- Conferência de 37 assets do cliente sem valores das credenciais privadas configuradas,
  incluindo conexão/senha de backup. Não equivale ao ensaio de restauração real.

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
