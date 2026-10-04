-- Teorema da Educação
-- Schema LEGADO: mantido para recuperação de registrations.
-- Para o fluxo atual use audit.sql e migrations/20261003_accounts_catalog.sql.

create table if not exists public.registrations (
  id text primary key,
  name_ciphertext text not null,
  email_ciphertext text not null,
  phone_ciphertext text not null,
  cpf_ciphertext text not null,
  email_hash text not null unique,
  cpf_hash text not null unique,
  ip_hash text,
  created_at timestamptz not null default now(),

  constraint registrations_id_not_empty check (char_length(id) > 0),
  constraint registrations_name_not_empty check (char_length(name_ciphertext) > 0),
  constraint registrations_email_not_empty check (char_length(email_ciphertext) > 0),
  constraint registrations_phone_not_empty check (char_length(phone_ciphertext) > 0),
  constraint registrations_cpf_not_empty check (char_length(cpf_ciphertext) > 0)
);

create index if not exists registrations_created_at_idx
  on public.registrations (created_at desc);

-- O painel usa a conexão privada do servidor. A aplicação pública não deve
-- acessar esta tabela diretamente pelo cliente Supabase.
alter table public.registrations enable row level security;

-- Não crie políticas para anon/authenticated: sem política, o acesso público
-- fica bloqueado. O backend usa a conexão POSTGRES_URL no servidor.
