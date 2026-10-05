-- Stage 2 only. Apply to an isolated Supabase environment before production.
-- Auth, profiles, products and legacy carts remain intact. No bucket is provisioned here.
-- All p_user_id / p_actor_id values must originate from server-validated getUser(), not JSON.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$ begin
  if to_regclass('public.profiles') is null or to_regclass('public.products') is null
     or to_regclass('public.carts') is null or to_regclass('public.cart_items') is null
     or to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise exception 'Missing audited baseline or Supabase Storage schema. No changes committed.';
  end if;
  if exists(select 1 from storage.buckets where id='teorema-pdfs' and public=true) then
    raise exception 'PDF bucket is public. Stop and correct through Storage API before migrating.';
  end if;
end $$;

create schema if not exists teorema_private;
revoke all on schema teorema_private from public,anon,authenticated;
grant usage on schema teorema_private to service_role;

-- Authority is an account UUID, never user_metadata or a mutable profile email.
create table teorema_private.commerce_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table teorema_private.commerce_admins enable row level security;
create policy commerce_admins_no_clients on teorema_private.commerce_admins as restrictive
for all to anon,authenticated using(false) with check(false);
revoke all on teorema_private.commerce_admins from public,anon,authenticated,service_role;
grant select on teorema_private.commerce_admins to service_role;
insert into teorema_private.commerce_admins(user_id)
select id from auth.users where lower(email)='bernardozsoares11@gmail.com'
  and email_confirmed_at is not null and deleted_at is null
  and (banned_until is null or banned_until<=now()) and not coalesce(is_anonymous,false);
-- No eligible account in a fresh test project means no administrator, not an open fallback.

create table public.product_files (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  version integer not null check(version>0),
  version_label text not null check(length(btrim(version_label)) between 1 and 40),
  bucket_id text not null default 'teorema-pdfs' check(bucket_id='teorema-pdfs'),
  object_key text not null unique,
  size_bytes bigint not null check(size_bytes between 1 and 20971520),
  mime_type text not null check(mime_type='application/pdf'),
  sha256 text check(sha256 ~ '^[a-f0-9]{64}$'),
  validation_status text not null default 'UPLOADING' check(validation_status in ('UPLOADING','VALIDATED','REJECTED')),
  validated_at timestamptz,
  is_current boolean not null default false,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(product_id,version), unique(id,product_id),
  check(object_key='products/'||product_id::text||'/'||id::text||'.pdf'),
  check(validation_status<>'VALIDATED' or (validated_at is not null and sha256 is not null)),
  check(not is_current or validation_status='VALIDATED')
);
create unique index product_files_current_idx on public.product_files(product_id) where is_current;
create index product_files_uploaded_by_idx on public.product_files(uploaded_by);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  code text generated always as ('TE-'||lpad(order_number::text,greatest(12,length(order_number::text)),'0')) stored unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  source_cart_id uuid not null unique references public.carts(id) on delete restrict,
  idempotency_key uuid not null,
  status text not null default 'AGUARDANDO_CONFIRMACAO'
    check(status in ('AGUARDANDO_CONFIRMACAO','CONFIRMADO','CANCELADO')),
  currency text not null default 'BRL' check(currency='BRL'),
  total_amount numeric(12,2) not null check(total_amount>0 and total_amount<=99999999.99),
  confirmed_at timestamptz, confirmed_by uuid references auth.users(id) on delete restrict,
  canceled_at timestamptz, canceled_by uuid references auth.users(id) on delete restrict,
  cancellation_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,idempotency_key), unique(id,user_id),
  check((status='AGUARDANDO_CONFIRMACAO' and confirmed_at is null and confirmed_by is null
           and canceled_at is null and canceled_by is null and cancellation_reason is null)
     or (status='CONFIRMADO' and confirmed_at is not null and confirmed_by is not null
           and canceled_at is null and canceled_by is null and cancellation_reason is null)
     or (status='CANCELADO' and confirmed_at is null and confirmed_by is null
           and canceled_at is not null and canceled_by is not null
           and cancellation_reason is not null and length(btrim(cancellation_reason)) between 5 and 1000))
);
create index orders_user_created_idx on public.orders(user_id,created_at desc,id);
create index orders_status_created_idx on public.orders(status,created_at desc,id);
create index orders_confirmed_by_idx on public.orders(confirmed_by) where confirmed_by is not null;
create index orders_canceled_by_idx on public.orders(canceled_by) where canceled_by is not null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null, user_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null check(length(btrim(product_name)) between 1 and 255),
  quantity integer not null default 1 check(quantity=1),
  unit_price numeric(12,2) not null check(unit_price>0 and unit_price<=1000000),
  line_total numeric(12,2) generated always as (quantity*unit_price) stored,
  purchased_file_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key(order_id,user_id) references public.orders(id,user_id) on delete restrict,
  foreign key(purchased_file_id,product_id) references public.product_files(id,product_id) on delete restrict,
  unique(order_id,product_id), unique(id,user_id,product_id)
);
create index order_items_user_idx on public.order_items(user_id,order_id);
create index order_items_product_idx on public.order_items(product_id);
create index order_items_file_idx on public.order_items(purchased_file_id);

create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique, user_id uuid not null, product_id uuid not null,
  state text not null default 'ATIVO' check(state in ('ATIVO','REVOGADO')),
  granted_by uuid not null references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz, revocation_reason text,
  created_at timestamptz not null default now(),
  foreign key(order_item_id,user_id,product_id) references public.order_items(id,user_id,product_id) on delete restrict,
  check((state='ATIVO' and revoked_by is null and revoked_at is null and revocation_reason is null)
     or (state='REVOGADO' and revoked_by is not null and revoked_at is not null
           and revocation_reason is not null and length(btrim(revocation_reason)) between 5 and 1000))
);
create index access_grants_user_product_idx on public.access_grants(user_id,product_id) where state='ATIVO';
create index access_grants_user_created_idx on public.access_grants(user_id,created_at desc,id);
create index access_grants_product_idx on public.access_grants(product_id);
create index access_grants_granted_by_idx on public.access_grants(granted_by);
create index access_grants_revoked_by_idx on public.access_grants(revoked_by) where revoked_by is not null;

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation_id uuid not null,
  action text not null check(action in ('ORDER_CONFIRMED','ORDER_CANCELED','ACCESS_REVOKED','ACCESS_RESTORED',
    'PRODUCT_PUBLISHED','PRODUCT_UNPUBLISHED','PRODUCT_ARCHIVED','FILE_VALIDATED','FILE_REJECTED','FILE_REPLACED')),
  entity_id uuid not null,
  reason text check(length(btrim(reason)) between 5 and 1000),
  created_at timestamptz not null default now(),
  unique(actor_id,operation_id)
);
create index admin_audit_entity_idx on public.admin_audit_events(entity_id,created_at desc,id);
create index admin_audit_created_idx on public.admin_audit_events(created_at desc,id);

-- Minimal grants PLUS restrictive policies protect against accidental future broad grants/policies.
do $$ declare tbl text;
begin
  foreach tbl in array array['orders','order_items','product_files','access_grants','admin_audit_events'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',tbl);
    execute format('grant select,insert,update on public.%I to service_role',tbl);
    execute format('create policy commerce_no_anon on public.%I as restrictive for all to anon using(false) with check(false)',tbl);
    execute format('create policy commerce_no_insert on public.%I as restrictive for insert to authenticated with check(false)',tbl);
    execute format('create policy commerce_no_update on public.%I as restrictive for update to authenticated using(false) with check(false)',tbl);
    execute format('create policy commerce_no_delete on public.%I as restrictive for delete to authenticated using(false)',tbl);
  end loop;
end $$;
revoke all on sequence public.orders_order_number_seq from public,anon,authenticated;
grant usage,select on sequence public.orders_order_number_seq to service_role;
-- Customer-safe columns only; internal idempotency keys/actors/reasons/file paths remain server-only.
grant select(id,code,user_id,status,currency,total_amount,created_at,updated_at,confirmed_at,canceled_at)
  on public.orders to authenticated;
grant select(id,order_id,user_id,product_id,product_name,quantity,unit_price,line_total,created_at)
  on public.order_items to authenticated;
grant select(id,order_item_id,user_id,product_id,state,granted_at,revoked_at,created_at)
  on public.access_grants to authenticated;
do $$ declare tbl text;
begin
  foreach tbl in array array['orders','order_items','access_grants'] loop
    execute format('create policy commerce_own_read on public.%I for select to authenticated using(user_id=(select auth.uid()))',tbl);
    execute format('create policy commerce_own_read_guard on public.%I as restrictive for select to authenticated using(user_id=(select auth.uid()))',tbl);
  end loop;
  foreach tbl in array array['product_files','admin_audit_events'] loop
    execute format('create policy commerce_private_read_guard on public.%I as restrictive for select to authenticated using(false)',tbl);
  end loop;
end $$;
-- Preserve unrelated buckets. Client credentials never read/list/write managed PDF/cap buckets.
-- Public cover GETs are served by the public bucket, not by a storage.objects SELECT policy.
create policy teorema_managed_objects_guard on storage.objects as restrictive for all to anon,authenticated
using(bucket_id not in ('teorema-pdfs','teorema-covers'))
with check(bucket_id not in ('teorema-pdfs','teorema-covers'));

-- Supabase service_role cannot SELECT auth.users in this project. This one private
-- definer helper checks eligibility only; it exposes no Auth fields or mutable data.
-- The caller must be service_role and the UUID must come from server getUser().
create function teorema_private.commerce_assert_user(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception 'Trusted server required' using errcode='42501';
  end if;
  if p_user_id is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=p_user_id and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now()) and not coalesce(u.is_anonymous,false)) then
    raise exception 'Confirmed account required' using errcode='42501';
  end if;
end $$;
alter function teorema_private.commerce_assert_user(uuid) owner to postgres;
create function teorema_private.commerce_assert_admin(p_actor_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  perform teorema_private.commerce_assert_user(p_actor_id);
  if not exists(select 1 from teorema_private.commerce_admins where user_id=p_actor_id and is_active) then
    raise exception 'Administrator required' using errcode='42501';
  end if;
end $$;

create function teorema_private.commerce_immutable_row() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'Historical row is immutable' using errcode='23514'; end $$;
create trigger commerce_items_immutable before update or delete on public.order_items
for each row execute function teorema_private.commerce_immutable_row();
create trigger commerce_audit_immutable before update or delete on public.admin_audit_events
for each row execute function teorema_private.commerce_immutable_row();

create function teorema_private.commerce_order_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Order history cannot be deleted' using errcode='23514'; end if;
  -- NEW generated columns are not yet populated in a BEFORE trigger; code derives from order_number.
  if row(new.id,new.order_number,new.user_id,new.source_cart_id,new.idempotency_key,new.currency,new.total_amount,new.created_at)
     is distinct from row(old.id,old.order_number,old.user_id,old.source_cart_id,old.idempotency_key,old.currency,old.total_amount,old.created_at) then
    raise exception 'Order snapshot is immutable' using errcode='23514';
  end if;
  if old.status<>'AGUARDANDO_CONFIRMACAO' or new.status not in ('CONFIRMADO','CANCELADO') then
    raise exception 'Invalid order transition' using errcode='23514';
  end if;
  new.updated_at:=now(); return new;
end $$;
create trigger commerce_order_guard before update or delete on public.orders
for each row execute function teorema_private.commerce_order_guard();

create function teorema_private.commerce_file_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'File version cannot be deleted' using errcode='23514'; end if;
  if tg_op='INSERT' then
    perform teorema_private.commerce_assert_admin(new.uploaded_by);
    return new;
  end if;
  if row(new.id,new.product_id,new.version,new.version_label,new.bucket_id,new.object_key,new.size_bytes,new.mime_type,new.uploaded_by,new.created_at)
    is distinct from row(old.id,old.product_id,old.version,old.version_label,old.bucket_id,old.object_key,old.size_bytes,old.mime_type,old.uploaded_by,old.created_at)
    or (old.validation_status='VALIDATED' and row(new.sha256,new.validated_at) is distinct from row(old.sha256,old.validated_at)) then
    raise exception 'File version identity/content is immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger commerce_file_guard before insert or update or delete on public.product_files
for each row execute function teorema_private.commerce_file_guard();

create function teorema_private.commerce_grant_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Grant history cannot be deleted' using errcode='23514'; end if;
  if tg_op='UPDATE' and row(new.id,new.order_item_id,new.user_id,new.product_id,new.created_at)
     is distinct from row(old.id,old.order_item_id,old.user_id,old.product_id,old.created_at) then
    raise exception 'Grant origin is immutable' using errcode='23514';
  end if;
  if not exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id
    where i.id=new.order_item_id and o.status='CONFIRMADO') then
    raise exception 'Grant requires confirmed order' using errcode='23514';
  end if;
  return new;
end $$;
create trigger commerce_grant_guard before insert or update or delete on public.access_grants
for each row execute function teorema_private.commerce_grant_guard();

-- Deferred invariant: no empty/underfunded snapshot and no half-confirmed order at commit.
create function teorema_private.commerce_order_integrity() returns trigger
language plpgsql security invoker set search_path='' as $$
declare order_id uuid; o public.orders; item_count integer; item_total numeric; grant_count integer;
begin
  if tg_table_name='orders' then order_id:=new.id; else order_id:=new.order_id; end if;
  select * into o from public.orders where id=order_id;
  select count(*),coalesce(sum(line_total),0) into item_count,item_total from public.order_items where order_items.order_id=o.id;
  if item_count not between 1 and 50 or item_total<>o.total_amount then
    raise exception 'Order items/total mismatch' using errcode='23514';
  end if;
  if o.status='CONFIRMADO' then
    select count(*) into grant_count from public.access_grants g join public.order_items i on i.id=g.order_item_id where i.order_id=o.id;
    if grant_count<>item_count then raise exception 'Confirmation must grant every item' using errcode='23514'; end if;
  end if;
  return null;
end $$;
create constraint trigger commerce_order_integrity after insert or update on public.orders
deferrable initially deferred for each row execute function teorema_private.commerce_order_integrity();
create constraint trigger commerce_items_integrity after insert on public.order_items
deferrable initially deferred for each row execute function teorema_private.commerce_order_integrity();

create function public.teorema_create_order(p_user_id uuid,p_cart_id uuid,p_idempotency_key uuid,
  p_expected_total numeric,p_expected_prices jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare c public.carts; existing public.orders; result uuid; item record; f public.product_files;
  amount numeric:=0; count_items integer; actual_prices jsonb;
begin
  perform teorema_private.commerce_assert_user(p_user_id);
  if p_cart_id is null or p_idempotency_key is null or p_expected_total is null
    or p_expected_total<=0 or p_expected_total<>round(p_expected_total,2)
    or p_expected_prices is null or jsonb_typeof(p_expected_prices)<>'object' then
    raise exception 'Invalid checkout input' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce:'||p_user_id::text,0));
  select * into existing from public.orders where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    if existing.source_cart_id<>p_cart_id then raise exception 'Idempotency key already used' using errcode='23514'; end if;
    return existing.id;
  end if;
  select * into c from public.carts where id=p_cart_id and user_id=p_user_id for update;
  if not found then raise exception 'Cart unavailable' using errcode='42501'; end if;
  select * into existing from public.orders where source_cart_id=p_cart_id;
  if found then return existing.id; end if; -- one cart can produce only one order, even with a new key
  if c.status is distinct from 'OPEN' then raise exception 'Cart is closed' using errcode='23514'; end if;
  select count(*) into count_items from public.cart_items where cart_id=p_cart_id;
  if count_items not between 1 and 50 then raise exception 'Cart requires 1 to 50 PDFs' using errcode='23514'; end if;
  if exists(select 1 from public.cart_items where cart_id=p_cart_id and quantity<>1) then
    raise exception 'One unit per PDF required' using errcode='23514';
  end if;
  if not exists(select 1 from storage.buckets where id='teorema-pdfs' and public=false) then
    raise exception 'Private PDF bucket required' using errcode='23514';
  end if;
  -- Cart -> sorted products/files. All checkout/admin writers use the same user serialization key.
  actual_prices:='{}'::jsonb;
  for item in select i.product_id,p.name,p.price,p.is_active from public.cart_items i
    join public.products p on p.id=i.product_id where i.cart_id=p_cart_id order by p.id for share of p loop
    if item.is_active is distinct from true or item.price<=0 or item.price>1000000
      or item.price<>round(item.price,2) then raise exception 'Product unavailable' using errcode='23514'; end if;
    if exists(select 1 from public.access_grants where user_id=p_user_id and product_id=item.product_id and state='ATIVO') then
      raise exception 'Material already authorized' using errcode='23514';
    end if;
    select * into f from public.product_files where product_id=item.product_id and is_current and validation_status='VALIDATED' for share;
    if not found or not exists(select 1 from storage.objects where bucket_id=f.bucket_id and name=f.object_key) then
      raise exception 'Validated PDF unavailable' using errcode='23514';
    end if;
    amount:=amount+item.price;
    actual_prices:=actual_prices||jsonb_build_object(item.product_id::text,item.price);
  end loop;
  if amount<>p_expected_total or actual_prices<>p_expected_prices then
    raise exception 'Prices changed; review selection' using errcode='23514';
  end if;
  insert into public.orders(user_id,source_cart_id,idempotency_key,total_amount)
    values(p_user_id,p_cart_id,p_idempotency_key,amount) returning id into result;
  insert into public.order_items(order_id,user_id,product_id,product_name,unit_price,purchased_file_id)
    select result,p_user_id,p.id,p.name,p.price,pf.id from public.cart_items i
    join public.products p on p.id=i.product_id join public.product_files pf on pf.product_id=p.id and pf.is_current
    where i.cart_id=p_cart_id;
  update public.carts set status='SENT_TO_WHATSAPP',total_amount=amount,updated_at=now() where id=p_cart_id;
  return result;
end $$;

create function public.teorema_confirm_order(p_actor_id uuid,p_order_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare o public.orders; owner_id uuid;
begin
  perform teorema_private.commerce_assert_admin(p_actor_id);
  select user_id into owner_id from public.orders where id=p_order_id;
  if not found then raise exception 'Order unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce:'||owner_id::text,0));
  select * into o from public.orders where id=p_order_id for update;
  if o.status='CONFIRMADO' then return o.id; end if;
  if o.status<>'AGUARDANDO_CONFIRMACAO' then raise exception 'Order cannot be confirmed' using errcode='23514'; end if;
  perform teorema_private.commerce_assert_user(o.user_id);
  if not exists(select 1 from storage.buckets where id='teorema-pdfs' and public=false)
    or exists(select 1 from public.order_items i where i.order_id=o.id and not exists(
      select 1 from public.product_files f join storage.objects s on s.bucket_id=f.bucket_id and s.name=f.object_key
      where f.product_id=i.product_id and f.is_current and f.validation_status='VALIDATED')) then
    raise exception 'Validated PDF unavailable' using errcode='23514';
  end if;
  update public.orders set status='CONFIRMADO',confirmed_by=p_actor_id,confirmed_at=now() where id=o.id;
  insert into public.access_grants(order_item_id,user_id,product_id,granted_by)
    select id,user_id,product_id,p_actor_id from public.order_items where order_id=o.id;
  insert into public.admin_audit_events(actor_id,operation_id,action,entity_id)
    values(p_actor_id,gen_random_uuid(),'ORDER_CONFIRMED',o.id);
  return o.id;
end $$;

create function public.teorema_cancel_order(p_actor_id uuid,p_order_id uuid,p_reason text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare o public.orders; owner_id uuid;
begin
  perform teorema_private.commerce_assert_admin(p_actor_id);
  if p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then
    raise exception 'Reason required' using errcode='22023'; end if;
  select user_id into owner_id from public.orders where id=p_order_id;
  if not found then raise exception 'Order unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce:'||owner_id::text,0));
  select * into o from public.orders where id=p_order_id for update;
  if o.status='CANCELADO' then return o.id; end if;
  if o.status<>'AGUARDANDO_CONFIRMACAO' then raise exception 'Only pending orders can be canceled' using errcode='23514'; end if;
  update public.orders set status='CANCELADO',canceled_by=p_actor_id,canceled_at=now(),cancellation_reason=btrim(p_reason) where id=o.id;
  insert into public.admin_audit_events(actor_id,operation_id,action,entity_id,reason)
    values(p_actor_id,gen_random_uuid(),'ORDER_CANCELED',o.id,btrim(p_reason));
  return o.id;
end $$;

create function public.teorema_set_access_state(p_actor_id uuid,p_grant_id uuid,p_state text,p_reason text,p_operation_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare g public.access_grants; owner_id uuid; a public.admin_audit_events; event_action text;
begin
  perform teorema_private.commerce_assert_admin(p_actor_id);
  if p_operation_id is null or p_state is null or p_state not in ('ATIVO','REVOGADO')
    or p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then
    raise exception 'Invalid access decision' using errcode='22023'; end if;
  event_action:=case p_state when 'ATIVO' then 'ACCESS_RESTORED' else 'ACCESS_REVOKED' end;
  -- Serialize operation IDs as well, across different customers targeted by one actor.
  perform pg_advisory_xact_lock(hashtextextended('operation:'||p_actor_id::text||p_operation_id::text,0));
  select * into a from public.admin_audit_events where actor_id=p_actor_id and operation_id=p_operation_id;
  if found then
    if a.entity_id<>p_grant_id or a.action<>event_action or a.reason is distinct from btrim(p_reason) then
      raise exception 'Operation key already used' using errcode='23514'; end if;
    return p_grant_id; -- old retry must not reapply an action after a later restore/revoke
  end if;
  select user_id into owner_id from public.access_grants where id=p_grant_id;
  if not found then raise exception 'Grant unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce:'||owner_id::text,0));
  select * into g from public.access_grants where id=p_grant_id for update;
  if p_state='ATIVO' then
    perform teorema_private.commerce_assert_user(g.user_id);
    update public.access_grants set state='ATIVO',granted_by=p_actor_id,granted_at=now(),revoked_by=null,revoked_at=null,revocation_reason=null where id=g.id;
  else
    update public.access_grants set state='REVOGADO',revoked_by=p_actor_id,revoked_at=now(),revocation_reason=btrim(p_reason) where id=g.id;
  end if;
  insert into public.admin_audit_events(actor_id,operation_id,action,entity_id,reason)
    values(p_actor_id,p_operation_id,event_action,g.id,btrim(p_reason));
  return g.id;
end $$;

-- Server resolves a PRIVATE object only after ownership+grant validation; never a public PDF URL.
create function public.teorema_resolve_pdf(p_user_id uuid,p_product_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare f public.product_files;
begin
  perform teorema_private.commerce_assert_user(p_user_id);
  if not exists(select 1 from public.access_grants where user_id=p_user_id and product_id=p_product_id and state='ATIVO') then
    raise exception 'Material not authorized' using errcode='42501'; end if;
  select * into f from public.product_files where product_id=p_product_id and is_current and validation_status='VALIDATED';
  if not found or not exists(select 1 from storage.buckets where id=f.bucket_id and public=false)
    or not exists(select 1 from storage.objects where bucket_id=f.bucket_id and name=f.object_key) then
    raise exception 'Validated PDF unavailable' using errcode='23514'; end if;
  return jsonb_build_object('file_id',f.id,'bucket_id',f.bucket_id,'object_key',f.object_key,
    'version',f.version,'version_label',f.version_label,'size_bytes',f.size_bytes,'sha256',f.sha256);
end $$;

-- Public RPCs are INVOKER. Only the private Auth eligibility helper is DEFINER.
-- Trusted server only. RLS is never replaced by a browser admin check.
do $$ declare fn record;
begin
  for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='teorema_private' and p.proname like 'commerce_%')
       or (n.nspname='public' and p.proname in ('teorema_create_order','teorema_confirm_order',
          'teorema_cancel_order','teorema_set_access_state','teorema_resolve_pdf')) loop
    execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
