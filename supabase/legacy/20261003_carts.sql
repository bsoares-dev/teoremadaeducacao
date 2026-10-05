-- ARCHIVED, DO NOT APPLY. Canonical applied version is migrations/20261004005139_teorema_carts_security.sql.
-- Run AFTER 20261003_accounts_catalog.sql. No records are deleted.
-- Server-only cart mutations; never expose the service-role key to a browser.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status varchar(50) default 'OPEN', total_amount numeric(10,2) default 0,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null, unit_price numeric(10,2) not null,
  created_at timestamptz default now(), unique(cart_id, product_id)
);

-- Abort on a different schema instead of altering types or moving existing records.
-- Live audit: this column was absent in the production schema.
alter table public.carts add column if not exists updated_at timestamptz default now();

do $$
declare missing text; link record;
begin
  select string_agg(e.t || '.' || e.c, ', ') into missing
  from (values
    ('carts','id','uuid'), ('carts','user_id','uuid'),
    ('carts','total_amount','numeric'), ('carts','created_at','timestamp with time zone'),
    ('carts','updated_at','timestamp with time zone'),
    ('cart_items','id','uuid'), ('cart_items','cart_id','uuid'), ('cart_items','product_id','uuid'),
    ('cart_items','quantity','integer'), ('cart_items','unit_price','numeric'),
    ('cart_items','created_at','timestamp with time zone')
  ) e(t,c,d)
  where not exists(select 1 from information_schema.columns a
    where a.table_schema='public' and a.table_name=e.t and a.column_name=e.c and a.data_type=e.d);
  if missing is not null then raise exception 'Unexpected column/type: %. Transaction cancelled.', missing; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='carts' and column_name='status' and data_type in ('text','character varying'))
  then raise exception 'Unexpected carts.status type. Transaction cancelled.'; end if;
  for link in select * from (values
    ('public.profiles','id','auth.users'), ('public.carts','user_id','public.profiles'),
    ('public.cart_items','cart_id','public.carts'), ('public.cart_items','product_id','public.products')
  ) e(src,col,dst) loop
    if not exists(select 1 from pg_constraint c
      where c.contype='f' and c.conrelid=link.src::regclass and c.confrelid=link.dst::regclass
        and c.conkey=array[(select attnum from pg_attribute where attrelid=link.src::regclass and attname=link.col)]
        and c.confkey=array[(select attnum from pg_attribute where attrelid=link.dst::regclass and attname='id')])
    then raise exception 'Unexpected/missing FK: %.% -> %. No data moved.', link.src,link.col,link.dst; end if;
  end loop;
  if exists(select 1 from public.cart_items group by cart_id,product_id having count(*)>1)
  then raise exception 'Duplicate cart items found. Review manually; nothing deleted.'; end if;
end $$;

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.cart_items'::regclass and contype='u'
    and conkey=array[
      (select attnum from pg_attribute where attrelid='public.cart_items'::regclass and attname='cart_id'),
      (select attnum from pg_attribute where attrelid='public.cart_items'::regclass and attname='product_id')]) then
    create unique index if not exists teorema_cart_product_idx on public.cart_items(cart_id,product_id);
  end if;
end $$;
create index if not exists teorema_carts_user_idx on public.carts(user_id,created_at desc);
create index if not exists teorema_items_product_idx on public.cart_items(product_id);

-- NOT VALID preserves historical invalid records, but enforces all new/updated rows.
do $$ begin
  -- Audited legacy status constraint omits CANCELED; replaced by the stricter check below.
  alter table public.carts drop constraint if exists carts_status_check;
  if not exists(select 1 from pg_constraint where conrelid='public.carts'::regclass and conname='teorema_cart_values') then
    alter table public.carts add constraint teorema_cart_values check (
      user_id is not null and status is not null and status in ('OPEN','SENT_TO_WHATSAPP','COMPLETED','CANCELED')
      and total_amount is not null and total_amount >= 0 and total_amount <= 99999999.99
      and total_amount = round(total_amount,2)
    ) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.cart_items'::regclass and conname='teorema_item_values') then
    alter table public.cart_items add constraint teorema_item_values check (
      cart_id is not null and product_id is not null and quantity is not null and quantity between 1 and 1000
      and unit_price is not null and unit_price > 0 and unit_price <= 1000000
      and unit_price = round(unit_price,2)
    ) not valid;
  end if;
end $$;

-- Revoke every current column, not only known columns: column grants survive table revokes.
do $$
declare tbl text; cols text;
begin
  foreach tbl in array array['profiles','products','registrations','carts','cart_items'] loop
    if to_regclass('public.' || tbl) is null then continue; end if;
    select string_agg(quote_ident(attname),',') into cols from pg_attribute
      where attrelid=('public.' || tbl)::regclass and attnum>0 and not attisdropped;
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from public,anon,authenticated',tbl);
    execute format('revoke all (%s) on public.%I from public,anon,authenticated',cols,tbl);
  end loop;
end $$;
grant select(id,email,cpf,phone,created_at) on public.profiles to authenticated;
grant select(id,name,description,price,image_url,is_active,created_at) on public.products to anon,authenticated;
grant select(id,user_id,status,total_amount,created_at,updated_at) on public.carts to authenticated;
grant select(id,cart_id,product_id,quantity,unit_price,created_at) on public.cart_items to authenticated;
grant select,insert,update,delete on public.carts,public.cart_items to service_role;

-- Remove the audited broad policies; restrictive guards also block unknown permissive policies.
drop policy if exists "Usuários gerenciam seus próprios carrinhos" on public.carts;
drop policy if exists "Usuários gerenciam itens dos seus carrinhos" on public.cart_items;
drop policy if exists "Usuários podem ver e editar o próprio perfil" on public.profiles;
drop policy if exists teorema_carts_read on public.carts;
create policy teorema_carts_read on public.carts for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists teorema_carts_read_guard on public.carts;
create policy teorema_carts_read_guard on public.carts as restrictive for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists teorema_items_read on public.cart_items;
create policy teorema_items_read on public.cart_items for select to authenticated
  using(exists(select 1 from public.carts c where c.id=cart_id and c.user_id=(select auth.uid())));
drop policy if exists teorema_items_read_guard on public.cart_items;
create policy teorema_items_read_guard on public.cart_items as restrictive for select to authenticated
  using(exists(select 1 from public.carts c where c.id=cart_id and c.user_id=(select auth.uid())));
do $$ declare tbl text;
begin
  foreach tbl in array array['carts','cart_items'] loop
    execute format('drop policy if exists teorema_no_anon on public.%I',tbl);
    execute format('create policy teorema_no_anon on public.%I as restrictive for all to anon using(false) with check(false)',tbl);
    execute format('drop policy if exists teorema_no_insert on public.%I',tbl);
    execute format('create policy teorema_no_insert on public.%I as restrictive for insert to authenticated with check(false)',tbl);
    execute format('drop policy if exists teorema_no_update on public.%I',tbl);
    execute format('create policy teorema_no_update on public.%I as restrictive for update to authenticated using(false) with check(false)',tbl);
    execute format('drop policy if exists teorema_no_delete on public.%I',tbl);
    execute format('create policy teorema_no_delete on public.%I as restrictive for delete to authenticated using(false)',tbl);
  end loop;
end $$;

-- All mutation RPCs are SECURITY INVOKER, executable only by the trusted server.
-- p_user_id must come from getUser(), NEVER request JSON or user-editable metadata.
create or replace function public.teorema_get_or_create_cart(p_user_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
  if p_user_id is null then raise exception 'User required' using errcode='22023'; end if;
  -- Serialize cart creation for this user. Hash collisions only serialize unrelated users.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  if not exists(select 1 from public.profiles where id=p_user_id)
  then raise exception 'Profile required' using errcode='23503'; end if;
  select id into result from public.carts where user_id=p_user_id and status='OPEN'
    order by created_at,id limit 1 for update;
  if result is null then
    insert into public.carts(user_id,status,total_amount) values(p_user_id,'OPEN',0) returning id into result;
  end if;
  return result;
end $$;

create or replace function public.teorema_set_cart_item(p_user_id uuid,p_cart_id uuid,p_product_id uuid,p_quantity integer)
returns numeric language plpgsql security invoker set search_path='' as $$
declare current_status text; product_price numeric; amount numeric;
begin
  if p_user_id is null or p_cart_id is null or p_product_id is null or p_quantity is null or p_quantity not between 0 and 1000
  then raise exception 'Invalid cart input' using errcode='22023'; end if;
  select status into current_status from public.carts where id=p_cart_id and user_id=p_user_id for update;
  if not found then raise exception 'Cart unavailable' using errcode='42501'; end if;
  if current_status is distinct from 'OPEN' then raise exception 'Cart is closed' using errcode='23514'; end if;
  if p_quantity=0 then
    delete from public.cart_items where cart_id=p_cart_id and product_id=p_product_id;
  else
    select price into product_price from public.products where id=p_product_id and is_active=true for share;
    if not found or product_price is null or not(product_price>0 and product_price<=1000000 and product_price=round(product_price,2))
    then raise exception 'Product unavailable' using errcode='23514'; end if;
    insert into public.cart_items(cart_id,product_id,quantity,unit_price)
    values(p_cart_id,p_product_id,p_quantity,product_price)
    on conflict(cart_id,product_id) do update set quantity=excluded.quantity,unit_price=excluded.unit_price;
  end if;
  select coalesce(sum(quantity*unit_price),0) into amount from public.cart_items where cart_id=p_cart_id;
  update public.carts set total_amount=amount,updated_at=now() where id=p_cart_id;
  return amount;
end $$;

-- Reprice from the catalog atomically before preparing a WhatsApp hand-off.
-- This is NOT proof of message delivery, payment, or entitlement to a download.
create or replace function public.teorema_prepare_cart(p_user_id uuid,p_cart_id uuid)
returns numeric language plpgsql security invoker set search_path='' as $$
declare current_status text; amount numeric; item record; product_price numeric;
begin
  if p_user_id is null or p_cart_id is null then raise exception 'Invalid cart input' using errcode='22023'; end if;
  select status into current_status from public.carts where id=p_cart_id and user_id=p_user_id for update;
  if not found then raise exception 'Cart unavailable' using errcode='42501'; end if;
  if current_status is distinct from 'OPEN' then raise exception 'Cart is closed' using errcode='23514'; end if;
  if not exists(select 1 from public.cart_items where cart_id=p_cart_id)
  then raise exception 'Empty cart' using errcode='23514'; end if;
  for item in select product_id from public.cart_items where cart_id=p_cart_id order by product_id loop
    select price into product_price from public.products where id=item.product_id and is_active=true for share;
    if not found or product_price is null or not(product_price>0 and product_price<=1000000 and product_price=round(product_price,2))
    then raise exception 'Product unavailable' using errcode='23514'; end if;
    update public.cart_items set unit_price=product_price where cart_id=p_cart_id and product_id=item.product_id;
  end loop;
  select sum(quantity*unit_price) into amount from public.cart_items where cart_id=p_cart_id;
  update public.carts set total_amount=amount,status='SENT_TO_WHATSAPP',updated_at=now() where id=p_cart_id;
  return amount;
end $$;

revoke all on function public.teorema_get_or_create_cart(uuid) from public,anon,authenticated;
revoke all on function public.teorema_set_cart_item(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.teorema_prepare_cart(uuid,uuid) from public,anon,authenticated;
grant execute on function public.teorema_get_or_create_cart(uuid) to service_role;
grant execute on function public.teorema_set_cart_item(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.teorema_prepare_cart(uuid,uuid) to service_role;
-- Audited platform event trigger: keep its behavior but remove client EXECUTE grants.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
