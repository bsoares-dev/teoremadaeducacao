-- Part 4: atomic reservations, append-only events and administrative decisions.
begin;
alter table public.pdf_licenses add constraint pdf_licenses_log_origin_key unique(id,user_id,product_id,order_id);
create table public.pdf_download_logs (
  id uuid primary key,
  license_id uuid not null,
  user_id uuid not null,
  product_id uuid not null,
  order_id uuid not null,
  file_id uuid not null references public.product_files(id) on delete restrict,
  file_sha256 text not null check(file_sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'PREPARING' check(state in ('PREPARING','SUCCESS','FAILED')),
  success boolean not null default false,
  error_code text check(error_code in ('ACCESS_DENIED','LICENSE_REVOKED','PDF_NOT_FOUND','DOWNLOAD_FAILED',
    'MATERIAL_UPDATED','CUSTOMER_NAME_REQUIRED','DOWNLOAD_LIMIT_REACHED','ATTEMPT_EXPIRED')),
  started_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '150 seconds',
  downloaded_at timestamptz,
  finished_at timestamptz,
  foreign key(license_id,user_id,product_id,order_id) references public.pdf_licenses(id,user_id,product_id,order_id) on delete restrict,
  check(expires_at>started_at),
  check((state='PREPARING' and not success and error_code is null and finished_at is null and downloaded_at is null)
    or (state='SUCCESS' and success and error_code is null and finished_at is not null and downloaded_at=finished_at)
    or (state='FAILED' and not success and error_code is not null and finished_at is not null and downloaded_at is null))
);
create index pdf_download_license_idx on public.pdf_download_logs(license_id,started_at desc,id);
create index pdf_download_origin_idx on public.pdf_download_logs(license_id,user_id,product_id,order_id);
create index pdf_download_quota_idx on public.pdf_download_logs(license_id,state,expires_at) where state in ('PREPARING','SUCCESS');
create index pdf_download_user_idx on public.pdf_download_logs(user_id,started_at desc,id);
create index pdf_download_product_idx on public.pdf_download_logs(product_id);
create index pdf_download_order_idx on public.pdf_download_logs(order_id);
create index pdf_download_file_idx on public.pdf_download_logs(file_id);
create table public.pdf_license_events (
  id uuid primary key default gen_random_uuid(),
  license_id uuid,
  user_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  attempt_id uuid references public.pdf_download_logs(id) on delete restrict,
  event text not null check(event in ('PDF_GENERATION_STARTED','PDF_GENERATION_SUCCESS','PDF_GENERATION_FAILED',
    'PDF_DOWNLOAD_DENIED','LICENSE_CREATED','LICENSE_REVOKED','LICENSE_REACTIVATED')),
  error_code text check(error_code in ('ACCESS_DENIED','LICENSE_REVOKED','PDF_NOT_FOUND','DOWNLOAD_FAILED',
    'MATERIAL_UPDATED','CUSTOMER_NAME_REQUIRED','DOWNLOAD_LIMIT_REACHED','ATTEMPT_EXPIRED')),
  actor_id uuid references public.profiles(id) on delete restrict,
  operation_id uuid,
  expected_updated_at timestamptz,
  reason text check(length(btrim(reason)) between 5 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(license_id,user_id,product_id,order_id) references public.pdf_licenses(id,user_id,product_id,order_id) on delete restrict,
  unique(actor_id,operation_id),
  check((license_id is null and order_id is null and attempt_id is null)
    or (license_id is not null and product_id is not null and order_id is not null)),
  check((event in ('PDF_GENERATION_FAILED','PDF_DOWNLOAD_DENIED') and error_code is not null)
    or (event not in ('PDF_GENERATION_FAILED','PDF_DOWNLOAD_DENIED') and error_code is null)),
  check((actor_id is null and operation_id is null and expected_updated_at is null and reason is null)
    or (actor_id is not null and operation_id is not null and expected_updated_at is not null and reason is not null
      and event in ('LICENSE_REVOKED','LICENSE_REACTIVATED')))
);
create index pdf_event_license_idx on public.pdf_license_events(license_id,created_at desc,id);
create index pdf_event_origin_idx on public.pdf_license_events(license_id,user_id,product_id,order_id);
create index pdf_event_user_idx on public.pdf_license_events(user_id,created_at desc,id);
create index pdf_event_product_idx on public.pdf_license_events(product_id);
create index pdf_event_order_idx on public.pdf_license_events(order_id);
create index pdf_event_attempt_idx on public.pdf_license_events(attempt_id);
-- unique(actor_id,operation_id) also indexes the actor foreign key.
do $$ declare tbl text;
begin
  foreach tbl in array array['pdf_download_logs','pdf_license_events'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('alter table public.%I force row level security',tbl);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',tbl);
    execute format('grant select,insert on public.%I to service_role',tbl);
    execute format('create policy pdf_own_read on public.%I for select to authenticated using(user_id=(select auth.uid()))',tbl);
    execute format('create policy pdf_own_guard on public.%I as restrictive for select to authenticated using(user_id=(select auth.uid()))',tbl);
    execute format('create policy pdf_no_anon on public.%I as restrictive for all to anon using(false) with check(false)',tbl);
    execute format('create policy pdf_no_insert on public.%I as restrictive for insert to authenticated with check(false)',tbl);
    execute format('create policy pdf_no_update on public.%I as restrictive for update to authenticated using(false) with check(false)',tbl);
    execute format('create policy pdf_no_delete on public.%I as restrictive for delete to authenticated using(false)',tbl);
  end loop;
end $$;
grant update on public.pdf_download_logs to service_role;
grant select(id,license_id,user_id,product_id,order_id,state,success,error_code,started_at,downloaded_at,finished_at)
  on public.pdf_download_logs to authenticated;
grant select(id,license_id,user_id,product_id,order_id,event,error_code,created_at) on public.pdf_license_events to authenticated;
create trigger pdf_event_immutable before update or delete on public.pdf_license_events
  for each row execute function teorema_private.commerce_immutable_row();
create function teorema_private.pdf_log_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('role',true) is distinct from 'service_role' or tg_op='DELETE' then
    raise exception 'Trusted PDF ledger required' using errcode='42501'; end if;
  if tg_op='INSERT' then
    if new.state<>'PREPARING' then raise exception 'Invalid initial attempt' using errcode='23514'; end if;
    new.started_at:=clock_timestamp(); new.expires_at:=new.started_at+interval '150 seconds';
  elsif old.state<>'PREPARING' or new.state='PREPARING'
    or (new.id,new.license_id,new.user_id,new.product_id,new.order_id,new.file_id,new.file_sha256,new.started_at,new.expires_at)
      is distinct from (old.id,old.license_id,old.user_id,old.product_id,old.order_id,old.file_id,old.file_sha256,old.started_at,old.expires_at) then
    raise exception 'Attempt history is immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger pdf_log_guard before insert or update or delete on public.pdf_download_logs
  for each row execute function teorema_private.pdf_log_guard();
create function teorema_private.pdf_created_event() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  insert into public.pdf_license_events(license_id,user_id,product_id,order_id,event)
    values(new.id,new.user_id,new.product_id,new.order_id,'LICENSE_CREATED');
  return new;
end $$;
create trigger pdf_license_created_event after insert on public.pdf_licenses for each row execute function teorema_private.pdf_created_event();

-- Domain failures return an outcome, not an exception: denial events must commit.
create function teorema_private.pdf_error_code(p_state text,p_message text) returns text
language sql immutable security invoker set search_path='' as $$
  select case when p_state='42501' and p_message='PDF license revoked' then 'LICENSE_REVOKED'
    when p_state='42501' then 'ACCESS_DENIED' when p_state in ('P0002','23514') then 'PDF_NOT_FOUND' else 'DOWNLOAD_FAILED' end
$$;
create function public.teorema_begin_pdf_download(p_user_id uuid,p_product_id uuid,p_attempt_id uuid,p_license_code text,p_max_downloads integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; l public.pdf_licenses; used bigint; failed public.pdf_download_logs; code text; message text;
begin
  perform teorema_private.commerce_assert_user(p_user_id);
  if p_attempt_id is null or p_product_id is null or p_max_downloads is null or p_max_downloads<0 or p_max_downloads>1000000 then
    raise exception 'Invalid reservation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce:'||p_user_id::text,0));
  -- Attempt ids are minted server-side; a duplicate must never authorize a second response.
  if exists(select 1 from public.pdf_download_logs where id=p_attempt_id) then
    return jsonb_build_object('ok',false,'error_code','DOWNLOAD_FAILED'); end if;
  begin
    ctx:=public.teorema_prepare_pdf_download(p_user_id,p_product_id,p_license_code,null);
  exception when others then
    get stacked diagnostics message=MESSAGE_TEXT;
    code:=teorema_private.pdf_error_code(SQLSTATE,message);
  end;
  if code is not null then
    select * into l from public.pdf_licenses where user_id=p_user_id and product_id=p_product_id order by created_at,id limit 1;
    insert into public.pdf_license_events(license_id,user_id,product_id,order_id,event,error_code)
      values(l.id,p_user_id,(select id from public.products where id=p_product_id),l.order_id,'PDF_DOWNLOAD_DENIED',code);
    return jsonb_build_object('ok',false,'error_code',code);
  end if;
  select * into strict l from public.pdf_licenses where id=(ctx->'license'->>'id')::uuid for update;
  for failed in update public.pdf_download_logs set state='FAILED',success=false,error_code='ATTEMPT_EXPIRED',finished_at=clock_timestamp()
    where license_id=l.id and state='PREPARING' and expires_at<=clock_timestamp() returning * loop
    insert into public.pdf_license_events(license_id,user_id,product_id,order_id,attempt_id,event,error_code)
      values(l.id,l.user_id,l.product_id,l.order_id,failed.id,'PDF_GENERATION_FAILED','ATTEMPT_EXPIRED');
  end loop;
  select count(*) into used from public.pdf_download_logs where license_id=l.id and
    (state='SUCCESS' or (state='PREPARING' and expires_at>clock_timestamp()));
  if p_max_downloads>0 and used>=p_max_downloads then
    insert into public.pdf_license_events(license_id,user_id,product_id,order_id,event,error_code)
      values(l.id,l.user_id,l.product_id,l.order_id,'PDF_DOWNLOAD_DENIED','DOWNLOAD_LIMIT_REACHED');
    return jsonb_build_object('ok',false,'error_code','DOWNLOAD_LIMIT_REACHED');
  end if;
  insert into public.pdf_download_logs(id,license_id,user_id,product_id,order_id,file_id,file_sha256)
    values(p_attempt_id,l.id,l.user_id,l.product_id,l.order_id,(ctx->'file'->>'file_id')::uuid,ctx->'file'->>'sha256');
  insert into public.pdf_license_events(license_id,user_id,product_id,order_id,attempt_id,event)
    values(l.id,l.user_id,l.product_id,l.order_id,p_attempt_id,'PDF_GENERATION_STARTED');
  return jsonb_build_object('ok',true,'context',ctx);
end $$;
create function public.teorema_finish_pdf_download(p_user_id uuid,p_attempt_id uuid,p_full_name text,p_error_code text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.pdf_download_logs; ctx jsonb; code text:=p_error_code; message text; finished timestamptz;
begin
  -- No eligibility assertion here: an account banned during generation must still
  -- have its failure recorded. Only the trusted server can call this function.
  if current_setting('role',true) is distinct from 'service_role' then raise exception 'Trusted server required' using errcode='42501'; end if;
  if p_user_id is null or p_attempt_id is null or (code is not null and code not in
    ('ACCESS_DENIED','LICENSE_REVOKED','PDF_NOT_FOUND','DOWNLOAD_FAILED','MATERIAL_UPDATED','CUSTOMER_NAME_REQUIRED')) then
    raise exception 'Invalid completion' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce:'||p_user_id::text,0));
  select * into a from public.pdf_download_logs where id=p_attempt_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'error_code','ACCESS_DENIED'); end if;
  if a.state<>'PREPARING' then return jsonb_build_object('ok',a.success,'error_code',a.error_code); end if;
  if a.expires_at<=clock_timestamp() then code:='ATTEMPT_EXPIRED'; end if;
  if code is null then
    begin
      ctx:=public.teorema_prepare_pdf_download(a.user_id,a.product_id,(select license_code from public.pdf_licenses where id=a.license_id),a.license_id);
      if (ctx->'file'->>'file_id')::uuid<>a.file_id or ctx->'file'->>'sha256'<>a.file_sha256 or ctx->>'full_name' is distinct from p_full_name then
        code:='MATERIAL_UPDATED'; end if;
    exception when others then
      get stacked diagnostics message=MESSAGE_TEXT;
      code:=teorema_private.pdf_error_code(SQLSTATE,message);
    end;
  end if;
  finished:=clock_timestamp();
  update public.pdf_download_logs set state=case when code is null then 'SUCCESS' else 'FAILED' end,
    success=code is null,error_code=code,finished_at=finished,downloaded_at=case when code is null then finished end where id=a.id;
  insert into public.pdf_license_events(license_id,user_id,product_id,order_id,attempt_id,event,error_code)
    values(a.license_id,a.user_id,a.product_id,a.order_id,a.id,case when code is null then 'PDF_GENERATION_SUCCESS' else 'PDF_GENERATION_FAILED' end,code);
  return jsonb_build_object('ok',code is null,'error_code',code);
end $$;

create function public.teorema_set_pdf_license_state(p_actor_id uuid,p_license_id uuid,p_state text,p_reason text,p_operation_id uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare l public.pdf_licenses; e public.pdf_license_events; owner_id uuid; action text;
begin
  perform teorema_private.commerce_assert_admin(p_actor_id);
  if p_state is null or p_state not in ('active','revoked') or p_reason is null or length(btrim(p_reason)) not between 5 and 1000
    or p_operation_id is null or p_expected_updated_at is null then raise exception 'Invalid license decision' using errcode='22023'; end if;
  action:=case p_state when 'active' then 'LICENSE_REACTIVATED' else 'LICENSE_REVOKED' end;
  perform pg_advisory_xact_lock(hashtextextended('pdf-operation:'||p_actor_id::text||p_operation_id::text,0));
  select * into e from public.pdf_license_events where actor_id=p_actor_id and operation_id=p_operation_id;
  if found then
    if e.license_id<>p_license_id or e.event<>action or e.reason is distinct from btrim(p_reason) or e.expected_updated_at<>p_expected_updated_at then
      raise exception 'Operation key already used' using errcode='23514'; end if;
    return p_license_id;
  end if;
  select user_id into owner_id from public.pdf_licenses where id=p_license_id;
  if not found then raise exception 'License unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commerce:'||owner_id::text,0));
  select * into strict l from public.pdf_licenses where id=p_license_id for update;
  if l.updated_at<>p_expected_updated_at or l.status=p_state then raise exception 'License state changed' using errcode='40001'; end if;
  -- Existing identity guard validates purchase/grant again when reactivating.
  update public.pdf_licenses set status=p_state where id=l.id;
  insert into public.pdf_license_events(license_id,user_id,product_id,order_id,event,actor_id,operation_id,expected_updated_at,reason)
    values(l.id,l.user_id,l.product_id,l.order_id,action,p_actor_id,p_operation_id,p_expected_updated_at,btrim(p_reason));
  return l.id;
end $$;

create function public.teorema_admin_pdf_licenses(p_actor_id uuid,p_page integer,p_email text default null,p_code text default null,p_status text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  perform teorema_private.commerce_assert_admin(p_actor_id);
  if p_page is null or p_page not between 1 and 100000 or (p_email is not null and length(p_email)>255)
    or (p_code is not null and p_code !~ '^LIC-[0-9A-F]{32}$') or (p_status is not null and p_status not in ('active','revoked')) then
    raise exception 'Invalid license filters' using errcode='22023'; end if;
  with filtered as (
    select l.*,p.email,p.full_name,i.product_name,o.code as order_code from public.pdf_licenses l
      join public.profiles p on p.id=l.user_id join public.order_items i on i.id=l.order_item_id join public.orders o on o.id=l.order_id
    where (p_email is null or p.email=lower(btrim(p_email))) and (p_code is null or l.license_code=p_code) and (p_status is null or l.status=p_status)
  ), page as (select * from filtered order by created_at desc,id limit 20 offset (p_page-1)*20)
  select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,'code',v.license_code,'status',v.status,'createdAt',v.created_at,'updatedAt',v.updated_at,
    'name',v.full_name,'email',v.email,'product',v.product_name,'orderCode',v.order_code,'orderId',v.order_id,
    'downloads',(select count(*) from public.pdf_download_logs d where d.license_id=v.id and d.success),
    'lastDownload',(select max(downloaded_at) from public.pdf_download_logs d where d.license_id=v.id and d.success)
  ) order by v.created_at desc,v.id),'[]'::jsonb)) into result from page v;
  return result;
end $$;
create function public.teorema_admin_pdf_history(p_actor_id uuid,p_license_id uuid,p_page integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  perform teorema_private.commerce_assert_admin(p_actor_id);
  if p_page is null or p_page not between 1 and 100000 then raise exception 'Invalid history page' using errcode='22023'; end if;
  if not exists(select 1 from public.pdf_licenses where id=p_license_id) then raise exception 'License unavailable' using errcode='42501'; end if;
  return jsonb_build_object('total',(select count(*) from public.pdf_license_events where license_id=p_license_id),
    'items',coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc,v.id) from (
      select e.id,e.event,e.error_code,e.created_at,e.reason,p.email as actor_email from public.pdf_license_events e
        left join public.profiles p on p.id=e.actor_id where e.license_id=p_license_id order by e.created_at desc,e.id limit 20 offset (p_page-1)*20
    ) v),'[]'::jsonb));
end $$;
revoke all on function teorema_private.pdf_log_guard(),teorema_private.pdf_created_event(),teorema_private.pdf_error_code(text,text) from public,anon,authenticated;
grant execute on function teorema_private.pdf_log_guard(),teorema_private.pdf_created_event(),teorema_private.pdf_error_code(text,text) to service_role;
revoke all on function public.teorema_begin_pdf_download(uuid,uuid,uuid,text,integer),public.teorema_finish_pdf_download(uuid,uuid,text,text),
  public.teorema_set_pdf_license_state(uuid,uuid,text,text,uuid,timestamptz),public.teorema_admin_pdf_licenses(uuid,integer,text,text,text),public.teorema_admin_pdf_history(uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.teorema_begin_pdf_download(uuid,uuid,uuid,text,integer),public.teorema_finish_pdf_download(uuid,uuid,text,text),
  public.teorema_set_pdf_license_state(uuid,uuid,text,text,uuid,timestamptz),public.teorema_admin_pdf_licenses(uuid,integer,text,text,text),public.teorema_admin_pdf_history(uuid,uuid,integer)
  to service_role;
notify pgrst,'reload schema';
commit;
