# Otimização de navegação e carregamento — 09/10/2026

## Escopo preservado

Otimizações internas, sem redesenhar o site, mudar textos, preços, pedidos,
autorização de PDFs ou regras de publicação. Nenhuma migração de banco necessária.
As travas comerciais de produção continuam ativas.

## Alterações

- DM Sans e Playfair Display servidas pelo próprio site com `next/font`, mantendo
  as famílias, pesos, estilos e dimensões existentes. Sem importação de CSS do
  Google durante a visita.
- Proxy verifica/refresca o JWT com `getClaims`. Páginas privadas e APIs continuam
  consultando `getUser` para confirmar a sessão atual. Tokens revogados não
  autorizam acesso. O fallback seguro de chaves simétricas é mantido pelo SDK.
- `React.cache` deduplica autenticação somente dentro de uma renderização RSC.
  Não há cache global de usuários, sessões ou clientes Supabase autenticados.
- Primeira página da biblioteca consultada no servidor e transmitida em uma
  região `Suspense` após autenticação. A mesma validação de DTO, limite de
  requisições e consulta vinculada ao usuário continuam ativos.
- Atualização manual, paginação e downloads continuam usando APIs autenticadas.
  Nenhuma URL de download é incluída no HTML inicial ou armazenada no navegador.
- Indicador discreto enquanto links da navegação do aluno estão pendentes,
  sem deslocar o layout. Respeita preferência por movimento reduzido.
- Componentes de produtos e pedidos do admin carregados sob demanda, em vez de
  incluir seus módulos no carregamento inicial da aba de usuários.

## Evidências

- `npm test`: 68 testes passaram.
- `npm run build`, `npm run typecheck` e `npm run lint`: passaram.
- `check-build-secrets.mjs`: 26 arquivos do cliente inspecionados, sem valores de
  credenciais de servidor configuradas.
- `check-http.mjs` e `check-public-browser.mjs` no build final original: passaram.
  Home, catálogo, login e cadastro sem overflow ou erro de runtime/CSP em
  320/390/768/1440px; visitantes redirecionados e travas comerciais preservadas.
- `check-cart-browser.mjs` com build de produção, banco PGlite e transportes
  Auth/REST/Storage locais: fluxo completo de carrinho, pedidos, admin e biblioteca
  passou, incluindo download real no navegador, expiração, revogação, arquivo
  ausente, preço alterado, recuperação de respostas perdidas e troca de conta.
- No ensaio otimizado: uma consulta de Auth por renderização direta do perfil e
  zero requisições do navegador à `/api/library` para a carga inicial. Na referência
  anterior em desenvolvimento foram duas consultas Auth e duas tentativas de
  fetch inicial da biblioteca (Strict Mode). Isso mede requisições, não uma
  porcentagem de ganho de velocidade real em produção.
- HTML da biblioteca no `next start`: `private` e `no-store`, sem cache público.
  O Next de desenvolvimento sobrescreve páginas com `no-cache, must-revalidate`;
  o teste distingue esses ambientes, sem flexibilizar o requisito de produção.
- Fontes originais carregadas localmente; indicador de clique verificado com
  latência artificial. Capturas da área do aluno conferidas em desktop e celular;
  perfil, pedidos, biblioteca e carrinho testados em 320/390/768/1440px.
- Sete folhas de estilo comparadas mecanicamente com o commit anterior: apenas
  a entrega das fontes mudou, sem mudança de cores, layout, espaçamento ou pesos.
- JWKS público do projeto consultado em modo somente leitura: uma chave ES256,
  compatível com verificação local no proxy. Nenhuma chave privada foi consultada.

## Repetir o ensaio isolado

O script aceita `TEOREMA_BROWSER_PRODUCTION=true`, constrói e executa `next start`
com configuração de teste e comércio restrito ao ambiente preview. Exige
`PLAYWRIGHT_MODULE`, `TEOREMA_FIXTURE_TLS_CERT` e `TEOREMA_FIXTURE_TLS_KEY` apontando
para um certificado de teste HTTPS com SAN `127.0.0.1` e sua chave. Os arquivos
devem ficar em `.data/` ignorado pelo Git. Somente o processo Next de teste confia
nesse certificado via `NODE_EXTRA_CA_CERTS`; não se desativa a verificação TLS
da aplicação. Ao terminar, o script encerra seu próprio servidor e banco.

Esse ensaio sobrescreve o build local com valores de teste. Execute novamente
`npm run build` com a configuração original antes de usar o build para entrega.
Não execute build e dev simultaneamente contra a mesma pasta `.next`.

## Decisões de segurança e referência

A revisão seguiu as skills React Best Practices, Supabase e Verification:
deduplicação por requisição, carregamento sob demanda e ensaio do fluxo completo.
Não se adicionou cache público a perfis, pedidos ou biblioteca. Não se adicionou
`loading.tsx` antes de verificações de acesso/404 para manter os contratos HTTP.

Documentação da versão Next instalada em `node_modules/next/dist/docs/` e
[guia SSR de segurança do Supabase](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
Não houve atualizações de dependências, alterações de segredos, mensagens no
WhatsApp ou escrita no Supabase de produção para testar esta otimização.
