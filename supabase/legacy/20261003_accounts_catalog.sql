-- ARCHIVED, DO NOT APPLY. Canonical applied version is migrations/20261004005128_teorema_accounts_catalog_security.sql.
-- Additive migration. Run in Supabase SQL Editor after audit.sql.
-- Existing profiles, products, registrations and existing auth triggers are preserved.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, cpf text, phone text, created_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text not null,
  price numeric(12,2) not null, image_url text not null,
  created_at timestamptz not null default now()
);

-- Refuse an unexpected contract instead of rewriting a populated table.
do $$
begin
  if (select count(*) from information_schema.columns where table_schema='public'
      and table_name='profiles' and column_name in ('id','email','cpf','phone','created_at')) <> 5
     or (select count(*) from information_schema.columns where table_schema='public'
      and table_name='products' and column_name in ('id','name','description','price','image_url','created_at')) <> 6
  then raise exception 'Schema differs from application contract. Review audit.sql before proceeding.';
  end if;
end $$;

-- Preserve existing visibility flags; NULL remains unpublished.
alter table public.products add column if not exists is_active boolean default true;
alter table public.products alter column is_active set default true;

-- Audited existing function uses qualified table names. Preserve its body/trigger.
do $$ begin
  if to_regprocedure('public.handle_new_user()') is not null then
    alter function public.handle_new_user() set search_path = '';
    revoke execute on function public.handle_new_user() from public, anon, authenticated;
  end if;
end $$;

create or replace function public.teorema_valid_cpf(value text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare digits text := regexp_replace(coalesce(value,''), '[^0-9]', '', 'g');
        total integer; expected integer; len integer; idx integer;
begin
  if length(digits) <> 11 or digits = repeat(substr(digits,1,1),11) then return false; end if;
  for len in 9..10 loop
    total := 0;
    for idx in 1..len loop total := total + substr(digits,idx,1)::integer * (len + 2 - idx); end loop;
    expected := ((total * 10) % 11) % 10;
    if expected <> substr(digits,len+1,1)::integer then return false; end if;
  end loop;
  return true;
end $$;

-- This validation executes for profile writes, including writes from auth triggers.
create or replace function public.teorema_validate_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.cpf := regexp_replace(coalesce(new.cpf,''),'[^0-9]','','g');
  new.phone := regexp_replace(coalesce(new.phone,''),'[^0-9]','','g');
  if not public.teorema_valid_cpf(new.cpf) then raise exception 'Invalid CPF' using errcode='23514'; end if;
  if new.phone !~ '^[1-9]{2}[0-9]{8,9}$' then raise exception 'Invalid phone' using errcode='23514'; end if;
  return new;
end $$;
drop trigger if exists teorema_validate_profile on public.profiles;
create trigger teorema_validate_profile before insert or update of cpf, phone on public.profiles
for each row execute function public.teorema_validate_profile();

create or replace function public.teorema_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email,cpf,phone)
  values(new.id,new.email,new.raw_user_meta_data->>'cpf',new.raw_user_meta_data->>'phone')
  on conflict(id) do nothing;
  return new;
end $$;

-- Preserve an existing INSERT trigger whose function references profiles.
-- Unrecognized auth INSERT triggers stop this migration for explicit inspection.
do $$
declare has_profile_trigger boolean;
begin
  select exists(select 1 from pg_trigger t where t.tgrelid='auth.users'::regclass
    and not t.tgisinternal and (t.tgtype & 4) = 4
    and pg_get_functiondef(t.tgfoid) ilike '%profiles%') into has_profile_trigger;
  if not has_profile_trigger then
    if exists(select 1 from pg_trigger t where t.tgrelid='auth.users'::regclass
      and not t.tgisinternal and (t.tgtype & 4) = 4)
    then raise exception 'Unrecognized auth INSERT trigger. Inspect audit.sql; no changes committed.';
    end if;
    create trigger teorema_auth_profile after insert on auth.users
      for each row execute function public.teorema_create_profile();
  end if;
end $$;

-- Fill only missing profiles whose stored metadata is valid. Never overwrite a profile.
insert into public.profiles(id,email,cpf,phone,created_at)
select u.id,u.email,u.raw_user_meta_data->>'cpf',u.raw_user_meta_data->>'phone',u.created_at
from auth.users u where not exists(select 1 from public.profiles p where p.id=u.id)
and public.teorema_valid_cpf(u.raw_user_meta_data->>'cpf')
and regexp_replace(coalesce(u.raw_user_meta_data->>'phone',''),'[^0-9]','','g') ~ '^[1-9]{2}[0-9]{8,9}$'
on conflict(id) do nothing;

alter table public.profiles enable row level security;
alter table public.products enable row level security;

-- Table-level AND column-level grants are revoked, including old API mutation grants.
revoke all on public.profiles from public, anon, authenticated;
revoke all (id,email,cpf,phone,created_at) on public.profiles from public, anon, authenticated;
grant select (id,email,cpf,phone,created_at) on public.profiles to authenticated;
grant all on public.profiles to service_role;
drop policy if exists teorema_profile_select on public.profiles;
create policy teorema_profile_select on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists teorema_profile_guard on public.profiles;
create policy teorema_profile_guard on public.profiles as restrictive for select to authenticated using ((select auth.uid()) = id);
drop policy if exists teorema_profile_anon_guard on public.profiles;
create policy teorema_profile_anon_guard on public.profiles as restrictive for all to anon using (false) with check (false);

revoke all on public.products from public, anon, authenticated;
revoke all (id,name,description,price,image_url,is_active,created_at) on public.products from public, anon, authenticated;
grant select (id,name,description,price,image_url,is_active,created_at) on public.products to anon, authenticated;
grant all on public.products to service_role;
drop policy if exists teorema_catalog_read on public.products;
create policy teorema_catalog_read on public.products for select to anon, authenticated using (is_active = true);
drop policy if exists teorema_catalog_guard on public.products;
create policy teorema_catalog_guard on public.products as restrictive for select to anon, authenticated using (is_active = true);

-- Also prevent writes should older column-level mutation grants exist on extra columns.
drop policy if exists teorema_profiles_no_insert on public.profiles;
create policy teorema_profiles_no_insert on public.profiles as restrictive for insert to anon,authenticated with check(false);
drop policy if exists teorema_profiles_no_update on public.profiles;
create policy teorema_profiles_no_update on public.profiles as restrictive for update to anon,authenticated using(false) with check(false);
drop policy if exists teorema_profiles_no_delete on public.profiles;
create policy teorema_profiles_no_delete on public.profiles as restrictive for delete to anon,authenticated using(false);
drop policy if exists teorema_products_no_insert on public.products;
create policy teorema_products_no_insert on public.products as restrictive for insert to anon,authenticated with check(false);
drop policy if exists teorema_products_no_update on public.products;
create policy teorema_products_no_update on public.products as restrictive for update to anon,authenticated using(false) with check(false);
drop policy if exists teorema_products_no_delete on public.products;
create policy teorema_products_no_delete on public.products as restrictive for delete to anon,authenticated using(false);

do $$ begin
  if not exists(select 1 from pg_constraint where conname='teorema_product_price' and conrelid='public.products'::regclass) then
    alter table public.products add constraint teorema_product_price
      check (price > 0 and price <= 1000000 and price = round(price::numeric,2)) not valid;
  end if;
  if to_regclass('public.registrations') is not null then
    alter table public.registrations enable row level security;
    revoke all on public.registrations from public, anon, authenticated;
    drop policy if exists teorema_legacy_guard on public.registrations;
    create policy teorema_legacy_guard on public.registrations as restrictive for all to anon,authenticated using(false) with check(false);
  end if;
end $$;

create index if not exists profiles_created_id_idx on public.profiles(created_at desc,id);
create index if not exists products_created_id_idx on public.products(created_at desc,id);
revoke execute on function public.teorema_create_profile() from public, anon, authenticated;
revoke execute on function public.teorema_validate_profile() from public, anon, authenticated;
commit;
