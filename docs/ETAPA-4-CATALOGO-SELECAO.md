# Etapa 4 — catálogo e seleção de PDFs

Implementação de prévia local concluída; EM VALIDAÇÃO integrada. O responsável autorizou avançar e adiou o teste de upload/capa/publicação real da etapa 3. Não foram criados materiais fictícios no Supabase nem alterações em produção.

## Entrega

- `/materiais`: renderização no servidor, paginação de 12 itens e filtro explícito de produtos ativos/publicados. Rascunhos não aparecem.
- Cards responsivos na identidade do Teorema, título/descrição/preço, capa otimizada via Next Image e alternativa quando a imagem não existe ou falha.
- Imagens restritas ao bucket público de capas validadas do mesmo projeto. Nenhum caminho ou URL de PDF é consultado pela vitrine.
- Estados de carregamento, erro com nova tentativa, catálogo vazio e página fora de faixa; título/descrição/Open Graph e noindex na prévia.
- Seleção com contador, feedback acessível, adicionar/remover, estado adicionado/indisponível/já adquirido, revalidação ao focar a janela e antes de adicionar.
- API `POST /api/catalog/selection` somente leitura, payload limitado, origem validada e resposta `private, no-store`. Aceita somente IDs; não aceita identidade, preços, arquivos ou estado de aquisição fornecido pelo navegador.
- Usa cliente Supabase da sessão e `auth.getUser()`. Consulta `access_grants` apenas para o próprio usuário com estado ATIVO, respeitando RLS. Não depende da service role. “Já adquirido” significa acesso ativo, não apenas pedido pendente ou acesso revogado.
- Link de carrinho restrito à prévia. A etapa 5 acrescentou o carrinho funcional e seu contador à vitrine; produção mantém o atendimento por WhatsApp e não oferece checkout incompleto.

## Ativar para revisar localmente

No PowerShell, dentro do projeto:

```powershell
$env:TEOREMA_CATALOG_SELECTION_ENABLED='true'
npm run dev
```

Abrir `http://localhost:3000/materiais`. Usar localhost no teste local, pois Next normaliza a origem interna; a API exige mesma origem. Na Vercel, só uma configuração Preview pode habilitar esta seleção. A flag não ativa seleção em Production nem em um servidor standalone com NODE_ENV=production. A etapa 5 preservou a trava até integração de pedido/WhatsApp e autorização de publicação.

## Contrato para etapa 5

- Chave local: `teorema:pdf-selection:v1`.
- Conteúdo: `{ "version": 1, "ids": ["uuid-do-produto"] }`.
- Sem preços, nomes, dados pessoais, tokens, quantidades nem links privados. Quantidade de cada PDF é sempre 1. Limite de 50 IDs únicos, válidos e normalizados; dados corrompidos/versões desconhecidas são ignorados.
- Seleção é do navegador, pode atravessar login/cadastro e recarga. Não é um pedido e não concede acesso. Não limpar durante autenticação.
- Mesclar seleção com carrinho existente usando união, conservando IDs persistidos primeiro, sem apagar o carrinho do usuário. Se exceder 50, apresentar os excedentes ao cliente; o helper limitado não deve ser usado para descartar silenciosamente uma mesclagem persistente.
- Servidor da etapa 5 deve validar sessão, acesso atual, disponibilidade e preço; nenhum estado de card ou localStorage é confiável. Mostrar mudanças e remoções antes de continuar.
- Só remover os IDs locais efetivamente mesclados após confirmação da persistência no servidor. Falhas preservam seleção para nova tentativa.
- Abas recebem eventos de storage; Web Locks serializa alterações onde suportado. Sem Web Locks, alterações simultâneas têm semântica de última gravação. Sem armazenamento, mantém seleção em memória na página e exibe aviso.
- Invalidação de catálogo não remove IDs silenciosamente; apresenta aviso e remoção explícita. A confirmação final de preço pertence à etapa 5/6.

## Verificação

- 42 testes automatizados: 36 anteriores e seis novos para persistência/corrupção/limites, mesclagem, disponibilidade/aquisição, payloads indevidos, trava de produção e URLs de capa.
- Lint, tipos e build de produção verificados.
- `scripts/check-catalog-browser.mjs`: Next real com servidor HTTP Supabase simulado isolado; 13 produtos fictícios. Verifica seleção de dois PDFs, recarga, paginação, sincronização entre abas, despublicação entre render e clique, estado adquirido, erro/vazio, larguras 320/390/768/1440, navegação e erros de execução.
- Playwright do runtime local utilizado porque agent-browser não está instalado. Pode ser executado com `PLAYWRIGHT_MODULE` apontando para o entrypoint de uma instalação existente de Playwright; utiliza Edge headless.
- Evidências visuais ficam em `.data/catalog-check`, fora do Git. Estado adquirido da UI é simulado; isolamento e permissões são verificados também nos testes SQL existentes. Isso não substitui login de dois clientes reais.
- Pendente: ensaio com material realmente publicado pelo admin após upload da etapa 3 e validação do otimizador com capa real no ambiente publicado. Integração local com carrinho entregue na etapa 5. Nenhum fluxo de pedido/WhatsApp/liberação/download foi antecipado.

## Correção na etapa 5 — 06/10/2026

Consulta remota somente leitura confirmou ausência de SELECT público em `publication_status`. A vitrine agora usa somente `is_active=true`; a constraint existente exige `is_active=(publication_status='PUBLISHED')`. Teste SQL confirma a projeção pública e a negação da coluna privada. Nenhuma permissão foi ampliada. Com a flag de carrinho ativa, a API consulta apenas o carrinho OPEN e os itens da própria sessão via RLS para compor o contador e oferecer “Gerenciar no carrinho”.

Referências consultadas: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client) e [Next Image](https://nextjs.org/docs/app/api-reference/components/image).
