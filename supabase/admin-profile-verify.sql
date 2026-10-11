-- Read-only aggregate verification after controlled admin profile migration.
-- Run as database owner, not as a browser or application client. All counts should be zero.
select '01_invitation_table_without_rls' as verification, count(*)::bigint as issues
from pg_class where oid='teorema_private.admin_profile_invitations'::regclass and not relrowsecurity
union all
select '02_client_reservation_access', count(*) from (values ('anon'),('authenticated')) r(name)
where has_table_privilege(r.name,'teorema_private.admin_profile_invitations','SELECT,INSERT,UPDATE,DELETE')
union all
select '03_service_reservation_write', count(*)
where has_table_privilege('service_role','teorema_private.admin_profile_invitations','INSERT,UPDATE,DELETE')
union all
select '04_invalid_identifiers_without_authorized_exception', count(*) from public.profiles p
left join teorema_private.admin_profile_invitations i on i.user_id=p.id and i.provisioned_at is not null
where (p.cpf is null and i.user_id is null)
   or (p.cpf is not null and not public.teorema_valid_cpf(p.cpf))
   or (p.phone is null and i.user_id is null)
   or (p.phone is not null and p.phone !~ '^[1-9]{2}[0-9]{8,9}$')
union all
select '05_privileged_public_validator', count(*) from pg_proc
where oid='public.teorema_validate_profile()'::regprocedure and prosecdef
union all
-- The deferred verifier is private and cannot be invoked as an application RPC.
select '06_exposed_deferred_verifier', count(*)
from (values ('anon'),('authenticated'),('service_role')) r(name)
where has_function_privilege(r.name,'teorema_private.verify_admin_profile_origin()','EXECUTE');
