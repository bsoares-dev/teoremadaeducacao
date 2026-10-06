-- Stage 3. Prepare locally; apply remotely only after explicit approval.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

alter table public.products add column publication_status text not null default 'DRAFT',
  add column revision integer not null default 1,
  add column updated_at timestamptz not null default now();
-- Never leave legacy products purchasable without a validated PDF.
update public.products p set publication_status=case when p.is_active and exists
  (select 1 from public.product_files f where f.product_id=p.id and f.is_current and f.validation_status='VALIDATED')
  then 'PUBLISHED' else 'DRAFT' end;
update public.products set is_active=(publication_status='PUBLISHED');
alter table public.products alter column is_active set default false,
  alter column is_active set not null,
  add constraint products_publication_check check(publication_status in ('DRAFT','PUBLISHED','UNPUBLISHED','ARCHIVED')
    and is_active=(publication_status='PUBLISHED') and revision>0);
revoke delete on public.products from service_role;

alter table public.admin_audit_events drop constraint admin_audit_events_action_check;
alter table public.admin_audit_events add constraint admin_audit_events_action_check check(action in
  ('ORDER_CONFIRMED','ORDER_CANCELED','ACCESS_REVOKED','ACCESS_RESTORED','PRODUCT_PUBLISHED','PRODUCT_UNPUBLISHED',
   'PRODUCT_ARCHIVED','FILE_VALIDATED','FILE_REJECTED','FILE_REPLACED','PRODUCT_CREATED','PRODUCT_UPDATED','COVER_VALIDATED','COVER_REJECTED'));

create table public.product_uploads (
  id uuid primary key,
  product_id uuid not null references public.products(id) on delete restrict,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  kind text not null check(kind in ('PDF','COVER')),
  original_name text not null check(length(original_name) between 1 and 160),
  expected_size bigint not null,
  mime_type text not null,
  state text not null default 'UPLOADING' check(state in ('UPLOADING','VALIDATED','REJECTED')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  cleaned_at timestamptz,
  check((kind='PDF' and expected_size between 1 and 20971520 and mime_type='application/pdf')
    or (kind='COVER' and expected_size between 1 and 5242880 and mime_type in ('image/jpeg','image/png','image/webp')))
);
create index product_uploads_product_idx on public.product_uploads(product_id,created_at desc);
create index product_uploads_actor_idx on public.product_uploads(uploaded_by);
create index product_uploads_cleanup_idx on public.product_uploads(created_at) where cleaned_at is null;
alter table public.product_uploads enable row level security;
revoke all on public.product_uploads from public,anon,authenticated,service_role;
grant select,insert,update on public.product_uploads to service_role;
create policy product_uploads_no_clients on public.product_uploads as restrictive for all
  to anon,authenticated using(false) with check(false);
create policy teorema_staging_objects_guard on storage.objects as restrictive for all to anon,authenticated
  using(bucket_id<>'teorema-uploads') with check(bucket_id<>'teorema-uploads');

create function teorema_private.product_upload_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Upload history cannot be deleted' using errcode='23514'; end if;
  if row(new.id,new.product_id,new.uploaded_by,new.kind,new.original_name,new.expected_size,new.mime_type,new.created_at)
    is distinct from row(old.id,old.product_id,old.uploaded_by,old.kind,old.original_name,old.expected_size,old.mime_type,old.created_at)
    or (old.state<>'UPLOADING' and new.state<>old.state) then
    raise exception 'Upload identity or final state is immutable' using errcode='23514'; end if;
  return new;
end $$;
create trigger product_upload_guard before update or delete on public.product_uploads
  for each row execute function teorema_private.product_upload_guard();
revoke all on function teorema_private.product_upload_guard() from public,anon,authenticated;
grant execute on function teorema_private.product_upload_guard() to service_role;

create function public.teorema_admin_check(p_actor_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin perform teorema_private.commerce_assert_admin(p_actor_id); return true; end $$;

create function public.teorema_save_product(p_actor_id uuid,p_product_id uuid,p_revision integer,
  p_name text,p_description text,p_price numeric) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.products; event text;
begin
  perform teorema_private.commerce_assert_admin(p_actor_id);
  if p_product_id is null or p_revision is null or p_revision<0 or p_name is null or p_description is null
    or length(btrim(p_name)) not between 2 and 120 or length(btrim(p_description)) not between 10 and 2000
    or p_price is null or p_price<=0 or p_price>1000000 or p_price<>round(p_price,2) then
    raise exception 'Invalid product input' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('product:'||p_product_id::text,0));
  select * into p from public.products where id=p_product_id for update;
  if found then
    if p.publication_status='ARCHIVED' then raise exception 'Archived product' using errcode='23514'; end if;
    if p.revision=p_revision+1 and row(p.name,p.description,p.price)=row(btrim(p_name),btrim(p_description),p_price) then
      return to_jsonb(p); end if; -- Retry after a lost response, not a blind overwrite.
    if p.revision<>p_revision then raise exception 'Product changed; refresh' using errcode='40001'; end if;
    update public.products set name=btrim(p_name),description=btrim(p_description),price=p_price,
      revision=revision+1,updated_at=now() where id=p_product_id returning * into p;
    event:='PRODUCT_UPDATED';
  else
    if p_revision<>0 then raise exception 'Product not found' using errcode='P0002'; end if;
    insert into public.products(id,name,description,price,image_url,is_active)
      values(p_product_id,btrim(p_name),btrim(p_description),p_price,'',false) returning * into p;
    event:='PRODUCT_CREATED';
  end if;
  insert into public.admin_audit_events(actor_id,operation_id,action,entity_id)
    values(p_actor_id,gen_random_uuid(),event,p.id);
  return to_jsonb(p);
end $$;

create function public.teorema_set_product_state(p_actor_id uuid,p_product_id uuid,p_state text,
  p_revision integer,p_operation_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.products; a public.admin_audit_events; event text;
begin
  perform teorema_private.commerce_assert_admin(p_actor_id);
  if p_state is null or p_state not in ('PUBLISHED','UNPUBLISHED','ARCHIVED') or p_operation_id is null then
    raise exception 'Invalid publication state' using errcode='22023'; end if;
  event:=case p_state when 'PUBLISHED' then 'PRODUCT_PUBLISHED' when 'UNPUBLISHED' then 'PRODUCT_UNPUBLISHED' else 'PRODUCT_ARCHIVED' end;
  perform pg_advisory_xact_lock(hashtextextended('product:'||p_product_id::text,0));
  select * into p from public.products where id=p_product_id for update;
  if not found then raise exception 'Product not found' using errcode='P0002'; end if;
  select * into a from public.admin_audit_events where actor_id=p_actor_id and operation_id=p_operation_id;
  if found then
    if a.entity_id<>p.id or a.action<>event then raise exception 'Operation reused' using errcode='22023'; end if;
    return to_jsonb(p);
  end if;
  if p.revision is distinct from p_revision then raise exception 'Product changed; refresh' using errcode='40001'; end if;
  if p.publication_status='ARCHIVED' then raise exception 'Archived product' using errcode='23514'; end if;
  if p_state='PUBLISHED' and (length(btrim(coalesce(p.image_url,'')))=0 or not exists
    (select 1 from public.product_files f join storage.objects o on o.bucket_id=f.bucket_id and o.name=f.object_key
     join storage.buckets b on b.id=f.bucket_id where f.product_id=p.id and f.is_current
       and f.validation_status='VALIDATED' and b.public=false)) then
    raise exception 'Validated PDF and cover required' using errcode='23514'; end if;
  if p_state='UNPUBLISHED' and p.publication_status<>'PUBLISHED' then
    raise exception 'Product is not published' using errcode='23514'; end if;
  update public.products set publication_status=p_state,is_active=(p_state='PUBLISHED'),
    revision=revision+1,updated_at=now() where id=p.id returning * into p;
  insert into public.admin_audit_events(actor_id,operation_id,action,entity_id) values(p_actor_id,p_operation_id,event,p.id);
  return to_jsonb(p);
end $$;

create function public.teorema_reserve_upload(p_actor_id uuid,p_product_id uuid,p_upload_id uuid,p_kind text,
  p_name text,p_size bigint,p_mime text,p_version_label text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.products; u public.product_uploads; v integer;
begin
  perform teorema_private.commerce_assert_admin(p_actor_id);
  if p_upload_id is null or p_name is null or length(p_name) not between 1 and 160 or
    p_kind is null or p_kind not in ('PDF','COVER') or p_size is null or p_mime is null then
    raise exception 'Invalid upload' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('product:'||p_product_id::text,0));
  select * into p from public.products where id=p_product_id for update;
  if not found then raise exception 'Product not found' using errcode='P0002'; end if;
  if p.publication_status='ARCHIVED' then raise exception 'Archived product' using errcode='23514'; end if;
  select * into u from public.product_uploads where id=p_upload_id;
  if found then
    if row(u.product_id,u.uploaded_by,u.kind,u.original_name,u.expected_size,u.mime_type)
      is distinct from row(p_product_id,p_actor_id,p_kind,p_name,p_size,p_mime) or u.state<>'UPLOADING'
      or u.created_at<now()-interval '2 hours' then raise exception 'Upload cannot be reused' using errcode='22023'; end if;
    return to_jsonb(u);
  end if;
  if (select count(*) from public.product_uploads where product_id=p.id and state='UPLOADING'
    and created_at>now()-interval '48 hours')>=3 then raise exception 'Too many pending uploads' using errcode='23514'; end if;
  insert into public.product_uploads(id,product_id,uploaded_by,kind,original_name,expected_size,mime_type)
    values(p_upload_id,p.id,p_actor_id,p_kind,p_name,p_size,p_mime) returning * into u;
  if p_kind='PDF' then
    select coalesce(max(version),0)+1 into v from public.product_files where product_id=p.id;
    insert into public.product_files(id,product_id,version,version_label,object_key,size_bytes,mime_type,uploaded_by)
      values(u.id,p.id,v,coalesce(nullif(btrim(p_version_label),''),v::text),
        'products/'||p.id::text||'/'||u.id::text||'.pdf',p_size,p_mime,p_actor_id);
  end if;
  return to_jsonb(u);
end $$;

create function public.teorema_finish_upload(p_actor_id uuid,p_upload_id uuid,p_sha256 text,p_cover_url text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare u public.product_uploads; p public.products; old_file uuid; old_version integer; new_version integer; event text;
begin
  perform teorema_private.commerce_assert_admin(p_actor_id);
  select * into u from public.product_uploads where id=p_upload_id;
  if not found then raise exception 'Upload not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('product:'||u.product_id::text,0));
  select * into p from public.products where id=u.product_id for update;
  select * into u from public.product_uploads where id=p_upload_id for update;
  if u.state='VALIDATED' then return to_jsonb(p); end if;
  if u.state<>'UPLOADING' or p.publication_status='ARCHIVED' or u.created_at<now()-interval '48 hours'
    or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Upload cannot be finalized' using errcode='23514'; end if;
  if u.kind='PDF' then
    if not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id
      where b.id='teorema-pdfs' and b.public=false and o.name='products/'||p.id::text||'/'||u.id::text||'.pdf') then
      raise exception 'Private final object missing' using errcode='23514'; end if;
    select id,version into old_file,old_version from public.product_files where product_id=p.id and is_current for update;
    select version into new_version from public.product_files where id=u.id;
    if old_version is not null and new_version<=old_version then
      raise exception 'Newer version already current; cancel stale upload' using errcode='23514'; end if;
    update public.product_files set is_current=false where product_id=p.id and is_current;
    update public.product_files set validation_status='VALIDATED',sha256=p_sha256,validated_at=now(),is_current=true where id=u.id;
    event:='FILE_VALIDATED';
    if old_file is not null then
      insert into public.admin_audit_events(actor_id,operation_id,action,entity_id)
        values(p_actor_id,gen_random_uuid(),'FILE_REPLACED',old_file);
    end if;
  else
    if p_cover_url is null or p_cover_url !~ '^https://' or length(p_cover_url)>2000 or not exists
      (select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id where b.id='teorema-covers' and b.public=true
        and o.name='products/'||p.id::text||'/'||u.id::text||'.webp') then
      raise exception 'Validated cover missing' using errcode='23514'; end if;
    update public.products set image_url=p_cover_url where id=p.id;
    event:='COVER_VALIDATED';
  end if;
  update public.product_uploads set state='VALIDATED' where id=u.id;
  update public.products set revision=revision+1,updated_at=now() where id=p.id returning * into p;
  insert into public.admin_audit_events(actor_id,operation_id,action,entity_id) values(p_actor_id,u.id,event,u.id);
  return to_jsonb(p);
end $$;

create function public.teorema_reject_upload(p_actor_id uuid,p_upload_id uuid,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare u public.product_uploads;
begin
  perform teorema_private.commerce_assert_admin(p_actor_id);
  select * into u from public.product_uploads where id=p_upload_id;
  if not found then raise exception 'Upload not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('product:'||u.product_id::text,0));
  perform 1 from public.products where id=u.product_id for update;
  select * into u from public.product_uploads where id=p_upload_id for update;
  if u.state='VALIDATED' then raise exception 'Validated history cannot be rejected' using errcode='23514'; end if;
  if u.state='REJECTED' then return; end if;
  if p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then raise exception 'Reason required' using errcode='22023'; end if;
  update public.product_uploads set state='REJECTED',rejection_reason=p_reason where id=u.id;
  if u.kind='PDF' then update public.product_files set validation_status='REJECTED' where id=u.id and not is_current; end if;
  insert into public.admin_audit_events(actor_id,operation_id,action,entity_id,reason)
    values(p_actor_id,u.id,case u.kind when 'PDF' then 'FILE_REJECTED' else 'COVER_REJECTED' end,u.id,p_reason);
end $$;

-- Locked-down default EXECUTE, including future changes made by the service API.
do $$ declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('teorema_admin_check','teorema_save_product','teorema_set_product_state',
      'teorema_reserve_upload','teorema_finish_upload','teorema_reject_upload') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
