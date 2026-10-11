# Recuperação de senha — Teorema da Educação

Implementação de 11/10/2026. Usa Supabase Auth e o SMTP já configurado, sem
substituir a autenticação, alterar permissões ou abrir a publicação comercial.

## Como usar

1. Abra `/login` e clique em **Esqueci minha senha**, abaixo do campo de senha.
2. Informe o e-mail da conta e escolha **Enviar link de recuperação**.
3. Confira a caixa de entrada e o spam. A resposta é genérica, para não revelar
   se determinada pessoa possui conta. Não cria conta nem altera a senha ao enviar.
4. Abra o link recebido e informe duas vezes a nova senha, de 8 a 128 caracteres.
5. Após salvar, clique em **Entrar com a nova senha**. O destino original, como
   carrinho ou admin, é preservado somente se estiver na lista segura da aplicação.

A interface aguarda 60 segundos antes de permitir reenvio. Os limites reais
continuam sendo os do Supabase Auth; a contagem visual não é um limitador de
segurança distribuído. Não foram alterados SMTP, CAPTCHA, limites ou segredos.

Links inválidos, expirados ou de outro propósito exibem **Solicitar novo link**.
A expiração e o uso único da verificação são controlados pelo Supabase, não por
um prazo inventado no frontend. Recarregar a página após remover o token da URL
não recupera a sessão temporária: solicite outro link.

## Arquitetura e segurança

- `/auth/recuperar`: formulário e envio via `auth.resetPasswordForEmail`.
- `/auth/redefinir`: validação do link, nova senha e retorno ao login.
- `lib/password-recovery.ts`: validações, destinos seguros e contratos testáveis.
- `utils/supabase/recovery.ts`: cliente com chave publishable e sessão em memória.
- `app/auth/recovery-frame.tsx`: estrutura visual reaproveitada pelas duas telas.

O cliente de recuperação é isolado do cliente SSR existente: não sobrescreve
cookies de login, localStorage ou o verificador PKCE de outra conta. O envio usa
o fluxo implicit do Supabase apenas para esta operação. Com o template padrão,
o link verificado retorna os tokens no fragmento da URL, inclusive quando aberto
em outro navegador. O fluxo normal de login/cadastro continua inalterado.

Antes de inicializar o cliente, a página remove fragmento e parâmetros sensíveis
da URL. Estabelece a sessão temporária com `setSession` e consulta `getUser`, que
valida a identidade no servidor Auth. Também suporta um template personalizado
que envie `token_hash` e `type=recovery` diretamente para a nova página; nesse
caso usa `verifyOtp`. Convites e confirmações de cadastro não são aceitos aqui.
Não aceita a sessão ordinária de uma conta já aberta como substituto do link.

A gravação revalida o mesmo usuário e chama somente `updateUser({ password })`
no cliente isolado. Não existe escolha de usuário, alteração de perfil/admin,
consulta por e-mail de terceiros, endpoint privilegiado nem service role no
navegador. Senhas e tokens não são registrados em logs ou relatórios.

Após salvar, solicita `signOut({ scope: "global" })`. Se a saída falhar, informa
que a senha já foi alterada, sem apresentar a gravação como falha nem afirmar
que todas as sessões foram encerradas. Revogar refresh tokens não torna todos
os JWTs existentes inválidos imediatamente: operações sensíveis continuam com
suas verificações server-side e de sessão já existentes.

As páginas têm `noindex`, herdam `Referrer-Policy: no-referrer` e a política
privada do proxy em `/auth/*`. O HTML não contém credenciais de recuperação.
O destino do e-mail é fixo em `https://www.teoremadaeducacao.com.br/auth/redefinir`;
`next` nunca permite redirecionar tokens para outro domínio.

## Configuração externa

O Supabase deve manter o Site URL no domínio canônico e aceitar a URL de retorno
acima em **Authentication → URL Configuration**. Se outro host estiver como
Site URL, adicione explicitamente esse retorno à allowlist. Sem isso o Supabase
pode usar seu Site URL padrão em vez da tela de nova senha.

O template **Reset password** padrão deve usar `{{ .ConfirmationURL }}`. Se já
houver um template personalizado, seu botão deve retornar à nova tela com o
tipo `recovery`, nunca ao callback de cadastro ou à ativação administrativa.
O SMTP Resend existente continua responsável pela entrega; nenhum template,
remetente, senha SMTP ou configuração remota foi substituído nesta entrega.

## Verificações

- `npm test`: 164 testes aprovados, incluindo 12 novos testes de recuperação.
- `npm run typecheck`, `npm run lint`, `npm run build`: aprovados.
- Scanner do build: 37 assets de cliente, sem valores de credenciais de servidor.
- Navegador real, build local, 390 × 844 e 1440 × 900: login → recuperação →
  envio → confirmação divergente → gravação válida → saída → retorno ao login.
- Links expirados/ausentes, limpeza da URL, preservação de armazenamento de
  outra conta, ausência de overflow horizontal e erros de execução: aprovados.
- Chamadas Auth dos ensaios de navegador interceptadas com fixtures: **zero
  e-mails reais enviados e zero senhas reais alteradas** nesses testes.

As fixtures HTTP exercitam o SDK instalado, não outro framework de testes.
Entrega efetiva do e-mail, template remoto e troca de senha de uma conta real
ainda dependem de um ensaio autorizado com o titular. O código e o build
validados não são prova de recebimento do e-mail ou de aprovação do deploy.
Conferir separadamente o status do commit exato e as páginas em produção.

Nenhuma dependência, variável de ambiente ou migração foi necessária.
Preservada a exclusão anterior de `.env.example` e o restante do projeto.

Referências: [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail),
[templates de e-mail](https://supabase.com/docs/guides/auth/auth-email-templates),
[redirecionamentos](https://supabase.com/docs/guides/auth/redirect-urls),
[limites de Auth](https://supabase.com/docs/guides/auth/rate-limits).
