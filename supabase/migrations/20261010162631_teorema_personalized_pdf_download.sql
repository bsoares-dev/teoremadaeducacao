-- Part 3: trusted-server context for an on-demand personalized download.
-- No table, policy, purchase status or commercial gate is replaced.
begin;
create function public.teorema_prepare_pdf_download(
  p_user_id uuid, p_product_id uuid, p_license_code text, p_license_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare purchase record; license jsonb; file jsonb; customer_name text;
begin
  perform teorema_private.commerce_assert_user(p_user_id);
  if p_product_id is null or p_license_code is null or p_license_code !~ '^LIC-[0-9A-F]{32}$' then
    raise exception 'Invalid download request' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce:'||p_user_id::text,0));
  if not exists(select 1 from public.products where id=p_product_id) then
    raise exception 'PDF product unavailable' using errcode='P0002';
  end if;
  -- Oldest eligible origin is stable across retries. A different, valid purchase
  -- may authorize access, but a revoked license is never recreated/reactivated.
  select i.order_id,i.product_name into purchase from public.order_items i
    join public.orders o on o.id=i.order_id and o.user_id=i.user_id
    join public.access_grants g on g.order_item_id=i.id and g.user_id=i.user_id and g.product_id=i.product_id
    left join public.pdf_licenses l on l.order_item_id=i.id
    where i.user_id=p_user_id and i.product_id=p_product_id
      and o.status='CONFIRMADO' and g.state='ATIVO'
      and (l.id is null or l.status='active')
      and (p_license_id is null or l.id=p_license_id)
    order by o.created_at,o.id,i.id limit 1 for share of g;
  if not found then
    if exists(select 1 from public.pdf_licenses l
      join public.orders o on o.id=l.order_id and o.user_id=l.user_id
      join public.access_grants g on g.order_item_id=l.order_item_id and g.user_id=l.user_id and g.product_id=l.product_id
      where l.user_id=p_user_id and l.product_id=p_product_id and l.status='revoked'
        and o.status='CONFIRMADO' and g.state='ATIVO'
        and (p_license_id is null or l.id=p_license_id)) then
      raise exception 'PDF license revoked' using errcode='42501';
    end if;
    raise exception 'PDF access denied' using errcode='42501';
  end if;
  -- Reuse the validated current-file resolver and the Part 1 atomic license RPC.
  file:=public.teorema_resolve_pdf(p_user_id,p_product_id);
  license:=public.teorema_get_or_create_pdf_license(p_user_id,purchase.order_id,p_product_id,p_license_code);
  if license->>'status'<>'active' then
    raise exception 'PDF license revoked' using errcode='42501';
  end if;
  if p_license_id is not null and (license->>'id')::uuid<>p_license_id then
    raise exception 'PDF access denied' using errcode='42501';
  end if;
  select full_name into customer_name from public.profiles where id=p_user_id;
  return jsonb_build_object('file',file,'license',license,'full_name',customer_name,'product_name',purchase.product_name);
end $$;
revoke all on function public.teorema_prepare_pdf_download(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.teorema_prepare_pdf_download(uuid,uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
