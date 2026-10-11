# Manual administrativo do Teorema da Educação

Edição 01, 11/10/2026. Guia de operação preparado pela Code&Commerce.

Entrega: `output/pdf/Manual-Administrativo-Teorema-da-Educacao.pdf`.
São 12 páginas A4 com texto pesquisável, fontes incorporadas, marcadores de
navegação e sumário interno clicável. O manual não é publicado em `public/`.
Não contém dados reais de clientes, senhas, chaves ou URLs de PDFs originais.

## Conteúdo e limites

- Login e navegação; lista de usuários somente para consulta.
- Rascunhos, cadastro, PDF privado, capa e histórico de versões.
- Publicação, despublicação, arquivamento e consulta dos arquivados ocultos.
- Pedido pelo WhatsApp, conferência externa do pagamento e liberação conjunta.
- Cancelamento de pedido pendente, sem sugerir estorno financeiro automático.
- Acessos, licenças, revogação, reativação, contador e limite técnico opcional.
- Recuperação de decisões pendentes e limpeza restrita de envios expirados.
- Checklist de rotina e cuidados com conta/dados.

Conteúdo conferido no código atual de `app/admin/` e nos contratos em `lib/`.
As operações comerciais são explicadas condicionalmente: as travas existentes
em `selectionPreviewEnabled` e `cartPreviewEnabled` permanecem preservadas.
Documentar uma função implementada não certifica sua ativação em produção,
o aceite operacional ou a conclusão das pendências de homologação.

O manual não inventa exclusão definitiva de produto, desfazer arquivamento,
edição de usuário ou um campo administrativo para alterar limite de download.
Não promete revogar arquivos já baixados nem comprovar que o aluno os abriu.

## Regenerar

```powershell
python scripts/create-admin-manual.py
```

Requer Python, ReportLab e pypdf, disponíveis no runtime de documentos do
Codex, e as fontes locais Windows Segoe UI e Georgia. O gerador usa caminhos
relativos ao próprio repositório e não lê `.env`, não acessa Supabase/Vercel
e não executa mudanças na aplicação.

Depois de alterar o conteúdo, renderize com Poppler e revise todas as páginas:

```powershell
New-Item -ItemType Directory -Force tmp/pdfs/admin-manual
pdftoppm -r 110 -png output/pdf/Manual-Administrativo-Teorema-da-Educacao.pdf tmp/pdfs/admin-manual/page
pdfinfo output/pdf/Manual-Administrativo-Teorema-da-Educacao.pdf
```

Os PNGs são apenas intermediários de revisão; não versioná-los. Atualize a
data/edição e os nomes dos botões quando a interface mudar.

## Validação desta entrega

- Geração executada; 12 páginas e conteúdo esperado conferidos.
- Renderização Poppler e inspeção visual das 12 páginas: sem cortes,
  sobreposições, glifos inválidos ou quebra de tabelas.
- Sumário, marcadores e links conferidos; texto e fontes incorporadas.
- Nenhuma alteração em Auth, banco, migrações, Storage, variáveis ou travas.
- A exclusão preexistente de `.env.example` permanece fora desta entrega.

Não houve alteração de TypeScript, dependências ou aplicação; build e testes
da aplicação não foram necessários para a criação deste artefato documental.
