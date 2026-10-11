# Domínio e descoberta no Google

## Escopo

- Domínio comprado na HostGator: `teoremadaeducacao.com.br`.
- Endereço canônico: `https://www.teoremadaeducacao.com.br`, conforme a configuração de produção mostrada pelo responsável na Vercel. O domínio sem `www` está configurado na Vercel para redirecionar com 308 para esse endereço; a resposta pública depende da conexão DNS.
- Projeto Vercel existente: `teoremadaeducacao`, equipe `bsoares-devs-projects`.
- Sem alteração de design, login, banco, pedidos, licenças ou travas comerciais.
- A home mantém seu componente interativo em `app/home-content.tsx`; `app/page.tsx` apenas o renderiza e fornece metadados no servidor.
- `.env.example` permanece excluído por decisão do responsável. Nenhum `.env` real foi alterado.

## Código

- `lib/seo.ts`: domínio canônico, política de indexação e metadados das duas páginas públicas.
- `app/sitemap.ts`: `/sitemap.xml`, somente `/` e `/materiais`. Não anuncia contas, pedidos, arquivos privados ou URLs de produtos inexistentes.
- `app/robots.ts`: `/robots.txt`, referência ao sitemap em produção e bloqueio integral de rastreamento em desenvolvimento/Preview.
- `app/layout.tsx`: `metadataBase` centralizado, sem canonical de home herdado por páginas privadas.
- Home e catálogo possuem canonicals distintos, Open Graph e Twitter metadata. A paginação existente do catálogo usa canonical próprio (`/materiais?page=2`, por exemplo), sem tratar páginas de conteúdo diferente como duplicadas da primeira. Links de paginação permitem descoberta; o sitemap lista apenas a entrada do catálogo.
- Não foram inventadas datas de atualização. O sitemap não precisa acessar o banco nem gerar URLs assinadas.
- Os headers `noindex` e a autenticação das áreas privadas foram preservados. `robots.txt` não substitui autenticação nem garante remoção do índice.

## Conectar o domínio sem afetar o Resend

1. No projeto correto da Vercel, abrir **Settings → Domains**.
2. Adicionar `www.teoremadaeducacao.com.br` para produção.
3. Adicionar `teoremadaeducacao.com.br` e configurar redirecionamento permanente 308 para o domínio com `www`, preservando a escolha existente na Vercel.
4. Copiar os valores exatos solicitados pela Vercel para esse projeto. Não usar um IP/CNAME genérico presumido.
5. Na HostGator, editar o registro A do domínio principal e o CNAME de `www` com esses valores. Não criar registros duplicados nem trocar nameservers.
6. Preservar o TXT `resend._domainkey` e os CNAMEs `rsend` e `send`, bem como outros registros sem relação com o site.
7. Confirmar ausência de AAAA/CAA conflitantes caso a Vercel aponte problemas; não removê-los por inferência.
8. Verificar propagação e HTTPS válido para ambos os nomes; conferir o redirecionamento do domínio sem `www` para `www`, a home, o catálogo, `/robots.txt` e `/sitemap.xml`.

Valores exatos mostrados pelo responsável na tela da Vercel para este projeto:

| Tipo | Nome na HostGator | Valor solicitado |
| --- | --- | --- |
| A | `teoremadaeducacao.com.br` | `216.198.79.1` |
| CNAME | `www.teoremadaeducacao.com.br` | `bf134500d3ec0799.vercel-dns-017.com.` |

Editar os registros existentes, não adicionar duplicatas. Uma captura dos valores esperados não comprova propagação: verificar DNS/HTTPS após o responsável salvar.

O responsável confirmou que usa apenas o Resend para envio, sem caixas de e-mail na HostGator. O MX antigo e os aliases `mail`/`ftp` apontam para o domínio principal; não correspondem a um serviço de e-mail/FTP oferecido pela Vercel. Nenhum desses registros foi alterado por esta entrega. Se futuramente houver recebimento de e-mail, configurá-lo com os valores do provedor escolhido.

## Google Search Console

1. Abrir https://search.google.com/search-console e criar uma propriedade **Domínio**: `teoremadaeducacao.com.br`.
2. Copiar o TXT `google-site-verification=...` específico dessa propriedade e adicioná-lo na raiz da zona DNS da HostGator, preservando os registros existentes.
3. Verificar a propriedade depois da propagação.
4. Após o domínio servir o deploy correto, enviar `https://www.teoremadaeducacao.com.br/sitemap.xml` em **Sitemaps**.
5. Inspecionar a home e `/materiais`; solicitar indexação. A submissão não garante prazo, presença nem posição nos resultados.

Não há acesso conectado ao Search Console. Nenhum código de verificação foi inventado e nenhuma submissão foi feita em nome do responsável.

## Pendências externas identificadas

Em 11/10/2026 UTC, o conector Vercel retornou 403 para a equipe correta, sem CLI Vercel disponível. A leitura inicial de DNS mostrou A `162.240.81.81` e `www` apontando para o domínio principal, ambos da configuração anterior na HostGator. O responsável enviou posteriormente as telas de ambos os domínios na Vercel, com os valores exatos acima e `www` em produção. A alteração na HostGator e a propagação dependem de confirmação/verificação; não foram presumidas a partir das capturas.

## Verificação

Executar `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`. Conferir o XML/robots reais e os canonicals no servidor de produção local. Após o push, verificar o deploy do commit exato; só considerar o domínio conectado após testar DNS, HTTPS e resposta no endereço definitivo.

Validações locais desta entrega, em 11/10/2026 UTC:

- TypeScript, lint e build de produção: aprovados.
- Suíte completa: 133 testes aprovados, zero falhas.
- `/sitemap.xml`: HTTP 200, XML com namespace correto e apenas as duas URLs públicas canônicas.
- `/robots.txt`: HTTP 200, sitemap correto e exclusões de API/Auth.
- Home, catálogo e paginação: HTTP 200, canonicals próprios e metadados indexáveis. A normalização de página inválida mantém a primeira página.
- Checks HTTP existentes: aprovados; áreas privadas, origem de requisições, callbacks, validação de CPF e travas comerciais preservadas.
- Comparação da home com o histórico Git: JSX, estilos referenciados, links e comportamento preservados integralmente; mudou somente o nome do componente movido.
- Verificação de credenciais no build: 28 assets frontend examinados, sem valores de credenciais server-side configuradas.
- Nenhuma migração de banco necessária e nenhum segredo alterado.

Esses resultados locais não comprovam propagação DNS, emissão do certificado, entrega do commit pela Vercel nem indexação pelo Google; verificar cada uma dessas etapas separadamente.
