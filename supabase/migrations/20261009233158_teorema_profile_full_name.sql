-- Authorized addition: canonical student name; no inferred backfill or new identity store.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Only the audited profile-creation bodies may be extended. Unexpected custom
-- Auth logic must be reviewed, not silently overwritten. Existing trigger names,
-- ownership, grants, CPF/phone validation and conflict behavior are preserved.
do $$
declare f record; body text;
begin
  if (select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid
      where t.tgrelid='auth.users'::regclass and not t.tgisinternal
        and (t.tgtype & 4)=4 and pg_get_functiondef(p.oid) ilike '%profiles%') <> 1
    or exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
      join pg_namespace n on n.oid=p.pronamespace
      where t.tgrelid='auth.users'::regclass and not t.tgisinternal
        and (t.tgtype & 4)=4 and pg_get_functiondef(p.oid) ilike '%profiles%'
        and (n.nspname <> 'public' or p.proname not in ('handle_new_user','teorema_create_profile')))
  then raise exception 'Unexpected Auth profile trigger; inspect before changing.'; end if;
  for f in select p.proname,p.prosrc,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('handle_new_user','teorema_create_profile')
        and p.pronargs=0 loop
    body := regexp_replace(lower(f.prosrc),'[[:space:];]','','g');
    if not f.prosecdef or f.owner <> 'postgres'
      or not coalesce('search_path=""'=any(f.proconfig),false)
      or body not in (
        'begininsertintopublic.profiles(id,email,cpf,phone)values(new.id,new.email,new.raw_user_meta_data->>''cpf'',new.raw_user_meta_data->>''phone'')returnnewend',
        'begininsertintopublic.profiles(id,email,cpf,phone)values(new.id,new.email,new.raw_user_meta_data->>''cpf'',new.raw_user_meta_data->>''phone'')onconflict(id)donothingreturnnewend')
    then raise exception 'Unexpected profile creation function: %; inspect before changing.',f.proname; end if;
  end loop;
end $$;

alter table public.profiles add column full_name text;
comment on column public.profiles.full_name is 'Canonical student name. NULL for legacy accounts until the owner completes it; not an authorization attribute.';

create function public.teorema_validate_profile_name() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.full_name is not null then
    new.full_name := btrim(regexp_replace(pg_catalog.normalize(new.full_name,'NFC'),' +',' ','g'));
  end if;
  return new;
end $$;
create trigger teorema_validate_profile_name before insert or update of full_name on public.profiles
for each row execute function public.teorema_validate_profile_name();
alter table public.profiles add constraint teorema_profile_full_name_valid check (
  full_name is null or (
    char_length(full_name) between 2 and 150
    and full_name ~ '^[[:alpha:]][[:alpha:] .''’-]*$'
    and full_name=btrim(full_name) and position('  ' in full_name)=0
  )
);
revoke all on function public.teorema_validate_profile_name() from public,anon,authenticated;

-- Existing Auth provisioning remains atomic: the same INSERT copies the name.
-- Missing metadata stays NULL for old clients; no existing account is rewritten.
create or replace function public.teorema_create_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,email,cpf,phone,full_name)
  values(new.id,new.email,new.raw_user_meta_data->>'cpf',new.raw_user_meta_data->>'phone',new.raw_user_meta_data->>'full_name')
  on conflict(id) do nothing;
  return new;
end $$;
do $$ begin
  if to_regprocedure('public.handle_new_user()') is not null then
    execute $definition$
      create or replace function public.handle_new_user()
      returns trigger language plpgsql security definer set search_path='' as $body$
      begin
        insert into public.profiles(id,email,cpf,phone,full_name)
        values(new.id,new.email,new.raw_user_meta_data->>'cpf',new.raw_user_meta_data->>'phone',new.raw_user_meta_data->>'full_name');
        return new;
      end;
      $body$
    $definition$;
  end if;
end $$;

-- Do not open direct client UPDATE/INSERT. The existing ownership RLS stays intact.
revoke all (full_name) on public.profiles from public,anon,authenticated;
grant select (full_name) on public.profiles to authenticated;

create function public.teorema_update_profile_name(p_user_id uuid,p_full_name text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved text;
begin
  -- Same server-only confirmed/non-anonymous/non-banned account check as commerce.
  perform teorema_private.commerce_assert_user(p_user_id);
  if p_full_name is null then raise exception 'Name required' using errcode='22023'; end if;
  update public.profiles set full_name=p_full_name where id=p_user_id returning full_name into saved;
  return jsonb_build_object('fullName',saved);
end $$;
revoke all on function public.teorema_update_profile_name(uuid,text) from public,anon,authenticated;
grant execute on function public.teorema_update_profile_name(uuid,text) to service_role;

commit;
