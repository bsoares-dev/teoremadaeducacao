-- READ ONLY. Run ONLY after 20261005004458_teorema_pdf_orders_access.sql in the selected environment.
-- Aggregate output, no CPF, emails, tokens, personal records or private object keys.
-- Technical checks must be zero. Bucket/admin readiness is separately classified as CONFIGURACAO.
-- Run as the project SQL Editor/postgres auditor, not the restricted service_role.
do $$ begin
  if to_regclass('public.orders') is null or to_regclass('public.order_items') is null
    or to_regclass('public.product_files') is null or to_regclass('public.access_grants') is null
    or to_regclass('public.admin_audit_events') is null or to_regclass('teorema_private.commerce_admins') is null then
    raise exception 'Commerce migration not applied in this environment; do not confuse local files with a remote deployment.';
  end if;
end $$;

select '01_RLS_ausente' as verificacao,'SEGURANCA' as categoria,count(*)::bigint as pendencias
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where ((n.nspname='public' and c.relname in ('orders','order_items','product_files','access_grants','admin_audit_events'))
  or (n.nspname='teorema_private' and c.relname='commerce_admins')) and not c.relrowsecurity
union all
select '02_escrita_cliente_permitida','SEGURANCA',count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values('anon'),('authenticated')) r(role_name)
cross join (values('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) a(priv)
where ((n.nspname='public' and c.relname in ('orders','order_items','product_files','access_grants','admin_audit_events'))
  or (n.nspname='teorema_private' and c.relname='commerce_admins'))
and (has_table_privilege(r.role_name,c.oid,a.priv)
  or case when a.priv in ('INSERT','UPDATE','REFERENCES') then has_any_column_privilege(r.role_name,c.oid,a.priv) else false end)
union all
select '03_leitura_anonima_privada','SEGURANCA',count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where ((n.nspname='public' and c.relname in ('orders','order_items','product_files','access_grants','admin_audit_events'))
  or (n.nspname='teorema_private' and c.relname='commerce_admins'))
and (has_table_privilege('anon',c.oid,'SELECT') or has_any_column_privilege('anon',c.oid,'SELECT'))
union all
select '04_metadados_internos_expostos','SEGURANCA',count(*) from (values
  ('public.orders','idempotency_key'),('public.orders','cancellation_reason'),('public.orders','confirmed_by'),
  ('public.order_items','purchased_file_id'),('public.product_files','object_key'),
  ('public.access_grants','revocation_reason'),('public.admin_audit_events','reason'),
  ('teorema_private.commerce_admins','user_id')) e(tbl,col)
where has_column_privilege('authenticated',e.tbl,e.col,'SELECT')
union all
select '05_RPC_permissoes_ou_contexto_inseguro','SEGURANCA',count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where ((n.nspname='teorema_private' and p.proname like 'commerce_%')
  or (n.nspname='public' and p.proname in ('teorema_create_order','teorema_confirm_order','teorema_cancel_order','teorema_set_access_state','teorema_resolve_pdf')))
and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')
  or (p.prosecdef and not (n.nspname='teorema_private' and p.proname='commerce_assert_user'
      and p.oid::regprocedure::text='teorema_private.commerce_assert_user(uuid)' and pg_get_userbyid(p.proowner)='postgres'))
  or (n.nspname='teorema_private' and p.proname='commerce_assert_user' and not p.prosecdef)
  or not coalesce(p.proconfig @> array['search_path=""'],false))
union all
select '06_guards_RLS_ausentes','SEGURANCA',count(*) from (values
  ('public','orders','commerce_own_read_guard'),('public','order_items','commerce_own_read_guard'),('public','access_grants','commerce_own_read_guard'),
  ('public','product_files','commerce_private_read_guard'),('public','admin_audit_events','commerce_private_read_guard'),
  ('teorema_private','commerce_admins','commerce_admins_no_clients')) e(ns,tbl,policy)
where not exists(select 1 from pg_policies where schemaname=e.ns and tablename=e.tbl and policyname=e.policy and permissive='RESTRICTIVE')
union all
select '07_guard_Storage_ausente','SEGURANCA',count(*) from (values(1)) e(n)
where not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
  and policyname='teorema_managed_objects_guard' and permissive='RESTRICTIVE')
union all
select '08_pedidos_totais_divergentes','INTEGRIDADE',count(*) from public.orders o
where o.total_amount<>(select coalesce(sum(line_total),0) from public.order_items i where i.order_id=o.id)
  or (select count(*) from public.order_items i where i.order_id=o.id) not between 1 and 50
union all
select '09_confirmacao_parcial','INTEGRIDADE',count(*) from public.orders o where o.status='CONFIRMADO'
and exists(select 1 from public.order_items i where i.order_id=o.id and not exists(select 1 from public.access_grants g where g.order_item_id=i.id))
union all
select '10_grant_sem_compra_confirmada','INTEGRIDADE',count(*) from public.access_grants g
join public.order_items i on i.id=g.order_item_id join public.orders o on o.id=i.order_id where o.status<>'CONFIRMADO'
union all
select '11_compra_sem_evento_auditoria','INTEGRIDADE',count(*) from public.orders o
where (o.status='CONFIRMADO' and not exists(select 1 from public.admin_audit_events a where a.entity_id=o.id and a.action='ORDER_CONFIRMED'))
   or (o.status='CANCELADO' and not exists(select 1 from public.admin_audit_events a where a.entity_id=o.id and a.action='ORDER_CANCELED'))
union all
select '12_PDF_atual_objeto_ausente','OPERACAO',count(*) from public.product_files f where f.is_current
and not exists(select 1 from storage.objects s where s.bucket_id=f.bucket_id and s.name=f.object_key)
union all
select '13_bucket_PDF_privado_pendente','CONFIGURACAO',count(*) from (values(1)) e(n)
where not exists(select 1 from storage.buckets where id='teorema-pdfs' and public=false
  and file_size_limit=20971520 and allowed_mime_types=array['application/pdf'])
union all
select '14_admin_confirmado_pendente','CONFIGURACAO',count(*) from (values(1)) e(n)
where not exists(select 1 from teorema_private.commerce_admins a join auth.users u on u.id=a.user_id
  where a.is_active and u.email_confirmed_at is not null and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=now()) and not coalesce(u.is_anonymous,false))
order by verificacao;
