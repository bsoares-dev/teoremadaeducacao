-- READ ONLY. Run after BOTH migrations. Only aggregate counts; no personal data.
-- Each technical check should return 0. Nonzero legacy counts require manual review,
-- never DELETE or rewrite customer records just to make the report green.
select '01_tabelas_sem_RLS' as verificacao,count(*)::bigint as pendencias
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','products','registrations','carts','cart_items') and not c.relrowsecurity
union all
select '02_escrita_direta_permitida',count(*) from pg_class c
cross join (values('anon'),('authenticated')) r(role_name)
cross join (values('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) a(priv)
where c.relnamespace='public'::regnamespace and c.relname in ('profiles','products','registrations','carts','cart_items')
and (has_table_privilege(r.role_name,c.oid,a.priv)
  or case when a.priv in ('INSERT','UPDATE','REFERENCES') then has_any_column_privilege(r.role_name,c.oid,a.priv) else false end)
union all
select '03_leitura_anonima_privada',count(*) from pg_class c
where c.relnamespace='public'::regnamespace and c.relname in ('profiles','registrations','carts','cart_items')
and (has_table_privilege('anon',c.oid,'SELECT') or has_any_column_privilege('anon',c.oid,'SELECT'))
union all
select '04_RPC_carrinho_exposta',count(*) from pg_proc p
where p.pronamespace='public'::regnamespace and p.proname in ('teorema_get_or_create_cart','teorema_set_cart_item','teorema_prepare_cart')
and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
union all
select '05_politicas_restritivas_ausentes',count(*) from (values
  ('profiles','teorema_profile_guard'),('products','teorema_catalog_guard'),
  ('carts','teorema_carts_read_guard'),('cart_items','teorema_items_read_guard'),
  ('carts','teorema_no_insert'),('carts','teorema_no_update'),('carts','teorema_no_delete'),
  ('cart_items','teorema_no_insert'),('cart_items','teorema_no_update'),('cart_items','teorema_no_delete')
) e(t,p) where not exists(select 1 from pg_policies where schemaname='public' and tablename=e.t and policyname=e.p and permissive='RESTRICTIVE')
union all
select '06_legado_perfis_invalidos',count(*) from public.profiles
where not public.teorema_valid_cpf(cpf) or coalesce(phone,'') !~ '^[1-9]{2}[0-9]{8,9}$'
union all
select '07_legado_carrinhos_invalidos',count(*) from public.carts
where status is null or status not in ('OPEN','SENT_TO_WHATSAPP','COMPLETED','CANCELED')
or total_amount is null or total_amount<0 or total_amount>99999999.99 or total_amount<>round(total_amount,2)
union all
select '08_legado_itens_invalidos',count(*) from public.cart_items
where quantity is null or quantity not between 1 and 1000 or unit_price is null or unit_price<=0
or unit_price>1000000 or unit_price<>round(unit_price,2)
union all
select '09_legado_totais_divergentes',count(*) from public.carts c
where c.total_amount is distinct from (select coalesce(sum(i.quantity*i.unit_price),0) from public.cart_items i where i.cart_id=c.id)
union all
select '10_legado_multiplos_carrinhos_abertos',count(*) from (
  select user_id from public.carts where status='OPEN' group by user_id having count(*)>1
) duplicates
union all
select '11_legado_produtos_preco_invalido',count(*) from public.products
where price is null or price<=0 or price>1000000 or price<>round(price,2)
union all
select '12_RPC_privilegiada_adicional_revisar',count(*) from pg_proc p
where p.pronamespace='public'::regnamespace and p.prosecdef and p.prorettype<>'trigger'::regtype
and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
order by verificacao;
