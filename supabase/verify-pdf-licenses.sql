-- Read-only verification. No personal data, generated secrets, or row mutations.
select jsonb_build_object(
  'rls', (select jsonb_build_object('enabled',relrowsecurity,'forced',relforcerowsecurity)
    from pg_class where oid='public.pdf_licenses'::regclass),
  'constraints', (select jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) order by conname)
    from pg_constraint where conrelid='public.pdf_licenses'::regclass),
  'indexes', (select jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) order by indexname)
    from pg_indexes where schemaname='public' and tablename='pdf_licenses'),
  'policies', (select jsonb_agg(jsonb_build_object('name',policyname,'kind',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check) order by policyname)
    from pg_policies where schemaname='public' and tablename='pdf_licenses'),
  'privileges', (select jsonb_agg(jsonb_build_object('role',r,'read',has_table_privilege(r,'public.pdf_licenses','SELECT'),
    'insert',has_table_privilege(r,'public.pdf_licenses','INSERT'),'update',has_table_privilege(r,'public.pdf_licenses','UPDATE'),
    'delete',has_table_privilege(r,'public.pdf_licenses','DELETE'),
    'execute_rpc',has_function_privilege(r,'public.teorema_get_or_create_pdf_license(uuid,uuid,uuid,text)','EXECUTE')))
    from unnest(array['anon','authenticated','service_role']) r),
  'rpc', (select jsonb_build_object('security_definer',prosecdef,'settings',proconfig)
    from pg_proc where oid='public.teorema_get_or_create_pdf_license(uuid,uuid,uuid,text)'::regprocedure),
  'license_count', (select count(*) from public.pdf_licenses),
  'original_bucket_private', (select not public from storage.buckets where id='teorema-pdfs')
) as verification;
