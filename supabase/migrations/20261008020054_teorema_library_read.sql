-- Stage 8: read-only, customer-scoped library. No changes to purchases or grants.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create function public.teorema_read_library(p_user_id uuid, p_page integer default 1)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  perform teorema_private.commerce_assert_user(p_user_id);
  if p_page is null or p_page not between 1 and 10000 then
    raise exception 'Invalid library page' using errcode='22023';
  end if;
  with candidates as (
    select i.product_id, i.product_name, i.id as item_id, o.id as order_id, o.code, o.created_at,
      case when g.state='ATIVO' then 'ATIVO' when o.status='AGUARDANDO_CONFIRMACAO' then 'PENDENTE' else 'REVOGADO' end as state,
      case when g.state='ATIVO' then 0 when o.status='AGUARDANDO_CONFIRMACAO' then 1 else 2 end as priority,
      coalesce(g.revoked_at,g.granted_at,o.created_at) as updated_at
    from public.order_items i join public.orders o on o.id=i.order_id and o.user_id=i.user_id
    left join public.access_grants g on g.order_item_id=i.id and g.user_id=i.user_id and g.product_id=i.product_id
    where i.user_id=p_user_id and (o.status='AGUARDANDO_CONFIRMACAO' or (o.status='CONFIRMADO' and g.id is not null))
  ), chosen as (
    select distinct on(product_id) * from candidates
    order by product_id, priority, updated_at desc, created_at desc, item_id
  ), paged as (
    select * from chosen order by updated_at desc, product_id limit 20 offset ((p_page-1)*20)
  ), material as (
    select c.*, p.image_url, f.version, f.version_label, f.size_bytes,
      (c.state='ATIVO' and f.id is not null) as available
    from paged c join public.products p on p.id=c.product_id
    left join public.product_files f on c.state='ATIVO' and f.product_id=c.product_id and f.is_current
      and f.validation_status='VALIDATED'
      and exists(select 1 from storage.buckets b where b.id=f.bucket_id and not b.public)
      and exists(select 1 from storage.objects s where s.bucket_id=f.bucket_id and s.name=f.object_key)
  )
  select jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
    'productId',product_id,'name',product_name,'state',state,'orderId',order_id,'code',code,
    'updatedAt',updated_at,'available',available,'imageUrl',image_url,
    'version',version,'versionLabel',version_label,'sizeBytes',size_bytes)
    order by updated_at desc, product_id) from material),'[]'::jsonb),
    'total',(select count(*) from chosen),'page',p_page,'size',20) into result;
  return result;
end $$;

revoke all on function public.teorema_read_library(uuid,integer) from public,anon,authenticated;
grant execute on function public.teorema_read_library(uuid,integer) to service_role;
comment on function public.teorema_read_library(uuid,integer) is
  'Trusted server only: verified Auth UUID, one material per product, active grant wins, no private file paths.';
notify pgrst,'reload schema';
commit;
