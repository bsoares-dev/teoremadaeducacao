# Envio simplificado de PDFs — 12/10/2026

## Diagnóstico confirmado

A reserva do arquivo funcionava, mas a transferência TUS retornava HTTP 400
`Unauthorized`. Reproduzido no domínio de produção com um PDF sintético e
rascunho identificado, nunca publicado. Os dois arquivos mostrados pelo
administrador não estavam no Storage: um envio continuava pendente e o outro
havia sido cancelado pelo próprio administrador. Não foi uma rejeição do
conteúdo desses PDFs.

Havia também uma política excessivamente restritiva que recusava links comuns,
formulários AcroForm e configurações de visualização inicial.

## Correção

- Upload direto para o endpoint de envio assinado do Supabase, com progresso,
  cancelamento e chave exclusiva; sem passar os bytes pela função da Vercel.
- Preparação automática após o envio. Não existe aprovação humana adicional.
- Links HTTP/HTTPS, e-mail, telefone, formulários comuns e navegação aceitos.
- PDFs com MIME ausente ou genérico no navegador são reconhecidos pela extensão;
  o conteúdo continua sendo conferido no servidor, antes da versão definitiva.
- Erros temporários do worker preservam o envio para nova tentativa, sem marcar
  o arquivo como rejeitado. Arquivos realmente incompatíveis recebem explicação
  específica (senha, integridade ou recursos ativos).
- O painel usa “Enviar PDF”, “Pronto” e “Concluir envio”, com aviso claro quando
  falta capa. O histórico e as compras anteriores permanecem intactos.

Nenhuma migration, alteração de segredo, política RLS, permissão administrativa
ou dependência nova. Campos antigos do ticket de upload ficam temporariamente
compatíveis com abas já abertas; atualizar o painel carrega o novo fluxo.

## Como publicar

1. Crie ou abra um material não arquivado e salve nome, descrição e preço.
2. Selecione o PDF e clique em **Enviar PDF**. Aguarde a mensagem de arquivo pronto.
3. Selecione o tipo **Capa**, envie a imagem e aguarde a conclusão.
4. Clique em **Publicar** e confirme.

O envio original que nunca chegou ao Storage precisa ser reenviado. Se o
material já foi arquivado, crie um novo rascunho; esta correção não desfaz
arquivamentos nem altera materiais existentes. “Concluir envio” é apenas
recuperação para uma transferência que chegou ao Storage mas não foi finalizada.

## Garantias e limites mantidos

- Original privado; comprador recebe somente a cópia personalizada após autorização.
- PDF de até 20 MiB, capa de até 5 MiB; limites de páginas, memória e processamento.
- Arquivos corrompidos, criptografados, scripts, anexos, XFA dinâmico e ações
  executáveis continuam bloqueados. Esta inspeção não é um antivírus.
- Upload usa PUT assinado, não uma URL de leitura. Token não é persistido no navegador.
- Sem sobrescrever versões; repetição de transferência ainda depende da conferência
  server-side antes de concluir. Interrupção de transferência exige reenviar o arquivo,
  sem retomada por partes; o limite continua 20 MiB.
- Publicação ainda é decisão explícita do administrador; testes não publicam materiais.

## Verificação

Ensaio no navegador usando o build de produção local e o Supabase real:
reserva 200 → PUT assinado 200 → preparação 200 → versão atual pronta;
capa 200 → botão Publicar habilitado. Acesso anônimo ao original bloqueado.
Rascunho de teste arquivado e sessão temporária encerrada ao final.

Testes de regressão cobrem upload/progresso/cancelamento/repetição, MIME genérico,
links seguros e perigosos, formulários, senha, corrupção, falha temporária do
worker, marca d’água e preservação de acentos. O script de homologação existente
foi atualizado para os novos botões e para observar o PUT assinado sem registrar tokens.

Validações locais concluídas: 185 testes aprovados, TypeScript aprovado,
lint aprovado, build aprovado e 36 assets do cliente examinados sem os valores
de credenciais server-side configuradas. O resultado do deploy e o ensaio no
domínio publicado devem ser verificados após o push; o build local não os substitui.

Documentação de referência: [upload assinado do Supabase](https://supabase.com/docs/reference/javascript/file-buckets-uploadtosignedurl).
