-- Read-only verification; no emails, CPFs, phones or student names are returned.
select jsonb_build_object(
  'column', (select jsonb_build_object('type',data_type,'nullable',is_nullable)
    from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='full_name'),
  'rls_enabled',(select relrowsecurity from pg_class where oid='public.profiles'::regclass),
  'constraint_validated',(select convalidated from pg_constraint where conrelid='public.profiles'::regclass and conname='teorema_profile_full_name_valid'),
  'authenticated_name_select',has_column_privilege('authenticated','public.profiles','full_name','SELECT'),
  'anon_name_select',has_column_privilege('anon','public.profiles','full_name','SELECT'),
  'authenticated_name_update',has_column_privilege('authenticated','public.profiles','full_name','UPDATE'),
  'authenticated_name_insert',has_column_privilege('authenticated','public.profiles','full_name','INSERT'),
  'anon_rpc',has_function_privilege('anon','public.teorema_update_profile_name(uuid,text)','EXECUTE'),
  'authenticated_rpc',has_function_privilege('authenticated','public.teorema_update_profile_name(uuid,text)','EXECUTE'),
  'service_rpc',has_function_privilege('service_role','public.teorema_update_profile_name(uuid,text)','EXECUTE'),
  'rpc_is_invoker',(select not prosecdef from pg_proc where oid='public.teorema_update_profile_name(uuid,text)'::regprocedure),
  'name_counts',(select jsonb_build_object('total',count(*),'with_name',count(full_name),'awaiting_name',count(*) filter(where full_name is null)) from public.profiles),
  'auth_profile_triggers',(select jsonb_agg(jsonb_build_object('trigger',t.tgname,'function',p.proname))
    from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='auth.users'::regclass
    and not t.tgisinternal and (t.tgtype & 4)=4 and pg_get_functiondef(p.oid) ilike '%profiles%')
) as verification;
