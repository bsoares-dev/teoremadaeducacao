-- Part 1: additive license identity. Existing access grants, checkout, downloads
-- and administrative decisions remain authoritative and unchanged.
create table public.pdf_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null,
  license_code text not null unique check (license_code ~ '^LIC-[0-9A-F]{32}$'),
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint pdf_licenses_purchase_unique unique (order_id,product_id),
  constraint pdf_licenses_order_item_unique unique (order_item_id),
  constraint pdf_licenses_item_owner_fk foreign key (order_item_id,user_id,product_id)
    references public.order_items(id,user_id,product_id) on delete restrict,
  constraint pdf_licenses_grant_origin_fk foreign key (order_item_id)
    references public.access_grants(order_item_id) on delete restrict,
  constraint pdf_licenses_state_check check (
    (status='active' and revoked_at is null) or (status='revoked' and revoked_at is not null)
  )
);
create index pdf_licenses_user_created_idx on public.pdf_licenses(user_id,created_at desc,id);
create index pdf_licenses_product_idx on public.pdf_licenses(product_id);
comment on table public.pdf_licenses is
  'Stable license per confirmed order item. Not a replacement for access_grants and not a download authorization alone.';

alter table public.pdf_licenses enable row level security;
alter table public.pdf_licenses force row level security;
revoke all on public.pdf_licenses from public,anon,authenticated,service_role;
grant select,insert,update on public.pdf_licenses to service_role;
grant select on public.pdf_licenses to authenticated;
create policy pdf_licenses_own_read on public.pdf_licenses for select to authenticated
  using (user_id=(select auth.uid()));
create policy pdf_licenses_own_read_guard on public.pdf_licenses as restrictive for select to authenticated
  using (user_id=(select auth.uid()));
create policy pdf_licenses_no_anon on public.pdf_licenses as restrictive for all to anon
  using(false) with check(false);
create policy pdf_licenses_no_insert on public.pdf_licenses as restrictive for insert to authenticated
  with check(false);
create policy pdf_licenses_no_update on public.pdf_licenses as restrictive for update to authenticated
  using(false) with check(false);
create policy pdf_licenses_no_delete on public.pdf_licenses as restrictive for delete to authenticated
  using(false);

-- Guard only the NEW table. Never attach new triggers to existing commerce tables.
create function teorema_private.pdf_license_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then
    raise exception 'License history is immutable' using errcode='23514';
  end if;
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception 'Trusted server required' using errcode='42501';
  end if;
  if tg_op='UPDATE' and
    row(new.id,new.user_id,new.product_id,new.order_id,new.order_item_id,new.license_code,new.created_at)
      is distinct from
    row(old.id,old.user_id,old.product_id,old.order_id,old.order_item_id,old.license_code,old.created_at) then
    raise exception 'License identity is immutable' using errcode='23514';
  end if;
  if tg_op='INSERT' and new.status is distinct from 'active' then
    raise exception 'New license must be active' using errcode='23514';
  end if;
  if new.status='active' then
    perform teorema_private.commerce_assert_user(new.user_id);
    -- Also protects direct privileged INSERTs: origin, owner and product must
    -- match exactly; a different purchase's active grant cannot authorize this one.
    perform 1 from public.order_items i
      join public.orders o on o.id=i.order_id and o.user_id=i.user_id
      join public.access_grants g on g.order_item_id=i.id and g.user_id=i.user_id and g.product_id=i.product_id
      where i.id=new.order_item_id and i.order_id=new.order_id
        and i.user_id=new.user_id and i.product_id=new.product_id
        and o.status='CONFIRMADO' and g.state='ATIVO'
      for share of g;
    if not found then raise exception 'License access denied' using errcode='42501'; end if;
    new.revoked_at:=null;
  else
    new.revoked_at:=case when tg_op='UPDATE' and old.status='revoked' then old.revoked_at else clock_timestamp() end;
  end if;
  if tg_op='INSERT' then new.created_at:=clock_timestamp(); end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
create trigger pdf_license_identity_guard before insert or update or delete on public.pdf_licenses
for each row execute function teorema_private.pdf_license_guard();
revoke all on function teorema_private.pdf_license_guard() from public,anon,authenticated;
grant execute on function teorema_private.pdf_license_guard() to service_role;

-- One transaction, same owner-lock ordering as confirmation/access revocation.
-- Candidate codes are generated with Node crypto by the trusted server only.
create function public.teorema_get_or_create_pdf_license(
  p_user_id uuid,p_order_id uuid,p_product_id uuid,p_license_code text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item_id uuid; license public.pdf_licenses;
begin
  perform teorema_private.commerce_assert_user(p_user_id);
  if p_order_id is null or p_product_id is null or p_license_code is null
    or p_license_code !~ '^LIC-[0-9A-F]{32}$' then
    raise exception 'Invalid license request' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce:'||p_user_id::text,0));
  select i.id into item_id from public.order_items i
    join public.orders o on o.id=i.order_id and o.user_id=i.user_id
    join public.access_grants g on g.order_item_id=i.id and g.user_id=i.user_id and g.product_id=i.product_id
    where i.order_id=p_order_id and i.product_id=p_product_id and i.user_id=p_user_id
      and o.status='CONFIRMADO' and g.state='ATIVO'
    for share of g;
  if not found then raise exception 'License access denied' using errcode='42501'; end if;

  select * into license from public.pdf_licenses where order_id=p_order_id and product_id=p_product_id;
  if not found then
    insert into public.pdf_licenses(user_id,product_id,order_id,order_item_id,license_code)
      values(p_user_id,p_product_id,p_order_id,item_id,p_license_code)
      on conflict (order_id,product_id) do nothing;
    select * into strict license from public.pdf_licenses where order_id=p_order_id and product_id=p_product_id;
  end if;
  -- Existing revoked license is returned unchanged, NEVER recreated/reactivated.
  if license.user_id<>p_user_id or license.order_item_id<>item_id then
    raise exception 'License access denied' using errcode='42501';
  end if;
  return to_jsonb(license);
end $$;
revoke all on function public.teorema_get_or_create_pdf_license(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.teorema_get_or_create_pdf_license(uuid,uuid,uuid,text) to service_role;
