begin;

-- Bounded counters, one row per existing account/action. No IPs or personal data.
create table teorema_private.request_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('LIBRARY_READ','PDF_DOWNLOAD','CART_READ','CART_WRITE','ORDER_CREATE','PRODUCT_UPLOAD')),
  window_start timestamptz not null,
  requests integer not null check (requests between 1 and 121),
  primary key (user_id,action)
);
alter table teorema_private.request_limits enable row level security;
create policy request_limits_no_clients on teorema_private.request_limits
  as restrictive for all to anon,authenticated using (false) with check (false);
revoke all on teorema_private.request_limits from public,anon,authenticated,service_role;
grant select,insert,update on teorema_private.request_limits to service_role;

create function public.teorema_consume_request(p_user_id uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_limit integer;
  v_seconds integer;
  v_start timestamptz;
  v_requests integer;
begin
  perform teorema_private.commerce_assert_user(p_user_id);
  case p_action
    when 'LIBRARY_READ' then v_limit:=120; v_seconds:=60;
    when 'PDF_DOWNLOAD' then v_limit:=20; v_seconds:=60;
    when 'CART_READ' then v_limit:=120; v_seconds:=60;
    when 'CART_WRITE' then v_limit:=60; v_seconds:=60;
    when 'ORDER_CREATE' then v_limit:=10; v_seconds:=900;
    when 'PRODUCT_UPLOAD' then v_limit:=30; v_seconds:=900;
    else raise exception 'Unknown request action' using errcode='22023';
  end case;

  insert into teorema_private.request_limits as r(user_id,action,window_start,requests)
  values(p_user_id,p_action,v_now,1)
  on conflict(user_id,action) do update set
    requests=case when r.window_start+make_interval(secs=>v_seconds)<=v_now then 1
      else least(r.requests+1,v_limit+1) end,
    window_start=case when r.window_start+make_interval(secs=>v_seconds)<=v_now then v_now
      else r.window_start end
  returning window_start,requests into v_start,v_requests;
  return jsonb_build_object('allowed',v_requests<=v_limit,'retryAfterSeconds',
    case when v_requests<=v_limit then 0
      else greatest(1,least(v_seconds,ceil(extract(epoch from (v_start+make_interval(secs=>v_seconds)-v_now)))::integer)) end);
end $$;
revoke all on function public.teorema_consume_request(uuid,text) from public,anon,authenticated;
grant execute on function public.teorema_consume_request(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
