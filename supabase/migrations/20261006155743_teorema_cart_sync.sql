-- Stage 5: applied with approval; filename aligned with remote migration history.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

-- Preserve legacy/history; fail rather than silently consolidating existing carts.
do $$ begin
  if exists(select 1 from public.carts where status='OPEN' group by user_id having count(*)>1)
    or exists(select 1 from public.cart_items i join public.carts c on c.id=i.cart_id where c.status='OPEN' and i.quantity<>1)
    or exists(select 1 from public.cart_items i join public.carts c on c.id=i.cart_id where c.status='OPEN' group by c.id having count(*)>50)
  then raise exception 'Review legacy open carts before migrating. No data changed.'; end if;
end $$;
alter table public.carts add column revision bigint not null default 0 check(revision>=0);
create unique index carts_one_open_per_user on public.carts(user_id) where status='OPEN';
alter table public.cart_items add constraint cart_digital_single_unit check(quantity=1) not valid;

create table teorema_private.cart_operations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  accepted_ids uuid[] not null,
  rejected jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);
alter table teorema_private.cart_operations enable row level security;
revoke all on teorema_private.cart_operations from public,anon,authenticated,service_role;
grant select,insert on teorema_private.cart_operations to service_role;

-- One SQL snapshot returns current catalog prices, not browser values. Previously
-- stored prices remain visible so changes are explicit until checkout revalidates.
create function public.teorema_read_cart(p_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  perform teorema_private.commerce_assert_user(p_user_id);
  with current_cart as (
    select id,revision from public.carts where user_id=p_user_id and status='OPEN'
  ), lines as (
    select i.product_id as id,p.name,p.image_url,p.price,i.unit_price,
      case when exists(select 1 from public.access_grants g where g.user_id=p_user_id and g.product_id=p.id and g.state='ATIVO') then 'owned'
        when p.is_active and p.publication_status='PUBLISHED' and exists(
          select 1 from public.product_files f join storage.buckets b on b.id=f.bucket_id and not b.public
          join storage.objects o on o.bucket_id=f.bucket_id and o.name=f.object_key
          where f.product_id=p.id and f.is_current and f.validation_status='VALIDATED') then 'available'
        else 'unavailable' end as state
    from public.cart_items i join current_cart c on c.id=i.cart_id join public.products p on p.id=i.product_id
  ) select jsonb_build_object(
    'id',(select id from current_cart),'revision',coalesce((select revision from current_cart),0),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'image_url',image_url,
      'priceCents',(price*100)::bigint,'previousPriceCents',(unit_price*100)::bigint,
      'priceChanged',price<>unit_price,'state',state) order by id) from lines),'[]'::jsonb),
    'totalCents',coalesce((select sum((price*100)::bigint) from lines where state='available'),0),
    'hasBlockedItems',exists(select 1 from lines where state<>'available')
  ) into result;
  return result;
end $$;

create function public.teorema_sync_cart(p_user_id uuid,p_operation_id uuid,p_cart_id uuid,
  p_revision bigint,p_add_ids uuid[],p_remove_ids uuid[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.carts; prior teorema_private.cart_operations; payload jsonb; product public.products;
  candidate uuid; accepted uuid[]:='{}'; rejected jsonb:='[]'; reason text; n integer;
begin
  perform teorema_private.commerce_assert_user(p_user_id);
  if p_operation_id is null or p_revision is null or p_revision<0 or p_add_ids is null or p_remove_ids is null
    or cardinality(p_add_ids)>50 or cardinality(p_remove_ids)>50
    or cardinality(p_add_ids)+cardinality(p_remove_ids)=0
    or array_position(p_add_ids,null) is not null or array_position(p_remove_ids,null) is not null
    or p_add_ids && p_remove_ids
  then raise exception 'Invalid selection' using errcode='22023'; end if;
  payload:=jsonb_build_object('cart',p_cart_id,'revision',p_revision,'add',p_add_ids,'remove',p_remove_ids);
  -- Same order as checkout/confirmation/revocation: user -> cart -> sorted products.
  perform pg_advisory_xact_lock(hashtextextended('commerce:'||p_user_id::text,0));
  select * into prior from teorema_private.cart_operations where user_id=p_user_id and operation_id=p_operation_id;
  if found then
    if prior.payload<>payload then raise exception 'Operation key reused' using errcode='22023'; end if;
    return jsonb_build_object('cart',public.teorema_read_cart(p_user_id),'acceptedIds',prior.accepted_ids,'rejected',prior.rejected);
  end if;
  select * into c from public.carts where user_id=p_user_id and status='OPEN' for update;
  if c.id is distinct from p_cart_id or coalesce(c.revision,0)<>p_revision then
    raise exception 'Cart changed; reload' using errcode='40001';
  end if;
  if c.id is null then
    if cardinality(p_add_ids)=0 then raise exception 'Cart unavailable' using errcode='42501'; end if;
    c.id:=public.teorema_get_or_create_cart(p_user_id);
  end if;
  delete from public.cart_items where cart_id=c.id and product_id=any(p_remove_ids);
  -- Lock all candidates in a deterministic order before inspecting availability.
  perform p.id from public.products p where p.id=any(p_add_ids) order by p.id for share;
  foreach candidate in array p_add_ids loop
    if candidate=any(accepted) then continue; end if;
    reason:=null;
    select * into product from public.products where id=candidate;
    if exists(select 1 from public.access_grants where user_id=p_user_id and product_id=candidate and state='ATIVO') then reason:='owned';
    elsif product.id is null or not product.is_active or product.publication_status<>'PUBLISHED'
      or not exists(select 1 from public.product_files f join storage.buckets b on b.id=f.bucket_id and not b.public
        join storage.objects o on o.bucket_id=f.bucket_id and o.name=f.object_key
        where f.product_id=candidate and f.is_current and f.validation_status='VALIDATED') then reason:='unavailable';
    end if;
    if reason is null then
      select count(*) into n from public.cart_items where cart_id=c.id;
      if n>=50 and not exists(select 1 from public.cart_items where cart_id=c.id and product_id=candidate) then reason:='limit'; end if;
    end if;
    if reason is not null then
      rejected:=rejected||jsonb_build_array(jsonb_build_object('id',candidate,'reason',reason));
    else
      insert into public.cart_items(cart_id,product_id,quantity,unit_price) values(c.id,candidate,1,product.price)
        on conflict(cart_id,product_id) do nothing;
      accepted:=array_append(accepted,candidate);
    end if;
  end loop;
  update public.carts set total_amount=(select coalesce(sum(unit_price),0) from public.cart_items where cart_id=c.id),
    revision=revision+1,updated_at=now() where id=c.id;
  insert into teorema_private.cart_operations(user_id,operation_id,payload,accepted_ids,rejected)
    values(p_user_id,p_operation_id,payload,accepted,rejected);
  return jsonb_build_object('cart',public.teorema_read_cart(p_user_id),'acceptedIds',accepted,'rejected',rejected);
end $$;

revoke all on function public.teorema_read_cart(uuid) from public,anon,authenticated;
revoke all on function public.teorema_sync_cart(uuid,uuid,uuid,bigint,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.teorema_read_cart(uuid) to service_role;
grant execute on function public.teorema_sync_cart(uuid,uuid,uuid,bigint,uuid[],uuid[]) to service_role;
-- Retire writers that accepted multiple units or changed status without an order.
revoke execute on function public.teorema_set_cart_item(uuid,uuid,uuid,integer) from service_role;
revoke execute on function public.teorema_prepare_cart(uuid,uuid) from service_role;
notify pgrst,'reload schema';
commit;
