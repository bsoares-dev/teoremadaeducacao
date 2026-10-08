-- Read-only security checks. Each violations value must be zero. No PII output.
select '01_budget_rls' as check_name,count(*) as violations from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='teorema_private' and c.relname='request_limits' and not c.relrowsecurity
union all
select '02_client_table_grants',count(*) from information_schema.table_privileges
where table_schema='teorema_private' and table_name='request_limits' and grantee in ('PUBLIC','anon','authenticated')
union all
select '03_client_column_grants',count(*) from information_schema.column_privileges
where table_schema='teorema_private' and table_name='request_limits' and grantee in ('PUBLIC','anon','authenticated')
union all
select '04_client_rpc_execution',count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='teorema_consume_request'
and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
union all
select '05_rpc_invoker_empty_search_path',count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='teorema_consume_request'
and (p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'],false) or not has_function_privilege('service_role',p.oid,'EXECUTE'))
union all
select '06_missing_budget_objects',
  (case when to_regclass('teorema_private.request_limits') is null then 1 else 0 end)+
  (case when to_regprocedure('public.teorema_consume_request(uuid,text)') is null then 1 else 0 end)
union all
select '07_service_auth_read',case when has_table_privilege('service_role','auth.users','SELECT') then 1 else 0 end;
