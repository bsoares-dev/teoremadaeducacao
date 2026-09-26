# Cadastro e segurança

## Configuração obrigatória

Antes de publicar, configure no ambiente da Vercel:

- `POSTGRES_URL`: conexão privada do Postgres/Supabase. Use a conexão pooler ou direta com credenciais de servidor, nunca uma chave pública no navegador.
- `ADMIN_EMAIL`: e-mail administrativo autorizado a acessar `/admin`.
- `ADMIN_PASSWORD`: senha longa e exclusiva para acessar `/admin`.
- `ENCRYPTION_KEY`: 32 bytes aleatórios em hexadecimal (`64` caracteres).

O arquivo `.env.example` é apenas uma referência. Nunca coloque valores reais no Git.

## Proteções implementadas

- Validação de nome, e-mail, telefone e CPF no servidor.
- CPF e telefone cifrados com AES-256-GCM antes da persistência.
- Hash HMAC para detectar duplicidade sem expor os identificadores.
- CPF e telefone mascarados no painel administrativo.
- Sessão administrativa em cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção.
- Rate limit básico no cadastro: cinco tentativas por IP a cada dez minutos.
- Verificação de origem, limite de payload e aceitação apenas de JSON.
- Mensagens de erro sem exposição de detalhes internos do banco.

## Operação

- Cadastros: `/` na seção “Cadastre-se”.
- Painel: `/admin`.
- A tabela é criada automaticamente na primeira operação do banco.
- Em produção, use um banco Postgres gerenciado e faça backups e controle de acesso pela Vercel/Neon.
- Para Supabase, execute `supabase/schema.sql` no SQL Editor antes do primeiro cadastro.
