-- Auth createUser writes app_metadata AFTER INSERT, within the same transaction.
-- Keep the prior migration as applied history; verify trusted origin at COMMIT.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

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

-- Internal trigger, not an RPC. The owner privilege is necessary at deferred
-- execution: the Auth connection itself cannot read the private enrollment table.
-- Explicit UUID/email binding replaces a request auth.uid() (absent during account creation).
create function teorema_private.verify_admin_profile_origin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.cpf is null or new.phone is null then
    if not exists (
      select 1 from teorema_private.admin_profile_invitations i
      join auth.users u on u.id = i.user_id
      where i.user_id = new.id and i.provisioned_at is not null
        and i.authorized_email = lower(u.email) and i.authorized_email = lower(new.email)
        and u.raw_app_meta_data->>'teorema_profile_origin' = 'controlled_admin_invitation'
        and u.email_confirmed_at is null and u.deleted_at is null
        and not coalesce(u.is_anonymous, false)
    ) then
      raise exception 'Controlled invitation required' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke execute on function teorema_private.verify_admin_profile_origin()
  from public, anon, authenticated, service_role;
create constraint trigger teorema_admin_profile_origin
  after insert on public.profiles deferrable initially deferred
  for each row execute function teorema_private.verify_admin_profile_origin();
commit;
