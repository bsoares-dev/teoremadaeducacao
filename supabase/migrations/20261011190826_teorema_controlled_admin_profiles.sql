-- Explicit, private enrollment reservations; no real emails or generated IDs in migrations.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- No auth FK here: a reservation must exist BEFORE the official Auth API creates
-- its UUID. Unused reservations expire; provisioned ones remain UUID-bound audit records.
create table teorema_private.admin_profile_invitations (
  user_id uuid primary key,
  authorized_email text not null unique
    check (authorized_email = lower(btrim(authorized_email)) and authorized_email like '%@%'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  provisioned_at timestamptz,
  check (expires_at > created_at),
  check (provisioned_at is null or provisioned_at >= created_at)
);
alter table teorema_private.admin_profile_invitations enable row level security;
create policy admin_profile_invitations_no_clients
  on teorema_private.admin_profile_invitations as restrictive
  for all to anon, authenticated using (false) with check (false);
revoke all on teorema_private.admin_profile_invitations from public, anon, authenticated, service_role;
grant select on teorema_private.admin_profile_invitations to service_role;

-- Preserve the existing Auth creation trigger and validation of supplied values.
-- SECURITY INVOKER: initial enrollment executes inside the existing owner-owned
-- Auth trigger, not through a new public privileged RPC.
create or replace function public.teorema_validate_profile()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  optional_identifiers boolean := false;
  raw_cpf text := new.cpf;
  raw_phone text := new.phone;
begin
  new.cpf := nullif(regexp_replace(coalesce(new.cpf,''),'[^0-9]','','g'), '');
  new.phone := nullif(regexp_replace(coalesce(new.phone,''),'[^0-9]','','g'), '');

  if new.cpf is null or new.phone is null then
    select i.provisioned_at is not null into optional_identifiers
      from teorema_private.admin_profile_invitations i where i.user_id = new.id;
    if not coalesce(optional_identifiers, false) and tg_op = 'INSERT' then
      select exists (
        select 1 from teorema_private.admin_profile_invitations i
        join auth.users u on u.id = i.user_id
        where i.user_id = new.id and i.provisioned_at is null and i.expires_at > now()
          and i.authorized_email = lower(u.email)
          and i.authorized_email = lower(new.email)
          and u.raw_app_meta_data->>'teorema_profile_origin' = 'controlled_admin_invitation'
          and not coalesce(u.is_anonymous, false) and u.deleted_at is null
      ) into optional_identifiers;
    end if;
  end if;

  if (new.cpf is null and (not coalesce(optional_identifiers, false) or btrim(coalesce(raw_cpf,'')) <> ''))
     or (new.cpf is not null and not public.teorema_valid_cpf(new.cpf)) then
    raise exception 'Invalid CPF' using errcode = '23514';
  end if;
  if (new.phone is null and (not coalesce(optional_identifiers, false) or btrim(coalesce(raw_phone,'')) <> ''))
     or (new.phone is not null and new.phone !~ '^[1-9]{2}[0-9]{8,9}$') then
    raise exception 'Invalid phone' using errcode = '23514';
  end if;

  if optional_identifiers and tg_op = 'INSERT' then
    update teorema_private.admin_profile_invitations
      set provisioned_at = now() where user_id = new.id and provisioned_at is null;
  end if;
  return new;
end $$;
revoke execute on function public.teorema_validate_profile() from public, anon, authenticated;
commit;
