-- READ ONLY: execute before the migration and keep the results privately.
-- No CPF, e-mail, phone or user rows are returned here.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('profiles','products','registrations','carts','cart_items')
order by table_name, ordinal_position;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('profiles','products','registrations','carts','cart_items');

select n.nspname, c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','products','registrations','carts','cart_items');

select t.tgname, pg_get_triggerdef(t.oid), pg_get_functiondef(t.tgfoid)
from pg_trigger t
where not t.tgisinternal and t.tgrelid in ('auth.users'::regclass, 'public.profiles'::regclass);

select conrelid::regclass as tabela,conname,pg_get_constraintdef(oid) as definicao
from pg_constraint where connamespace='public'::regnamespace order by conrelid::regclass::text,conname;

select grantee,table_name,privilege_type from information_schema.table_privileges
where table_schema='public' and table_name in ('profiles','products','registrations','carts','cart_items')
and grantee in ('PUBLIC','anon','authenticated');

select grantee,table_name,column_name,privilege_type from information_schema.column_privileges
where table_schema='public' and table_name in ('profiles','products','registrations','carts','cart_items')
and grantee in ('PUBLIC','anon','authenticated');

-- Additional RPC/view bypasses need review; do not revoke unknown application functions blindly.
select p.oid::regprocedure as funcao,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_executa,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as aluno_executa
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef and p.prorettype<>'trigger'::regtype;

select c.relname,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m');
