begin;
-- Narrow read-only bridge: no direct auth.sessions privilege for application roles.
create function public.teorema_pdf_session_active(p_user_id uuid,p_session_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception 'Trusted PDF server required' using errcode='42501'; end if;
  if p_user_id is null or p_session_id is null then return false; end if;
  return exists(select 1 from auth.sessions s where s.id=p_session_id and s.user_id=p_user_id
    and (s.not_after is null or s.not_after>statement_timestamp()));
end $$;
revoke all on function public.teorema_pdf_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.teorema_pdf_session_active(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
