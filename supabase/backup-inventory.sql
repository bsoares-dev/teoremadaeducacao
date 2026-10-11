-- Read-only inventory for the database owner. Does not export personal records,
-- password hashes, sessions, tokens, Vault values, encryption keys or PDF bytes.
-- Counts are evidence of scope, NOT a database backup or a recovery certificate.
begin read only;
select jsonb_build_object(
  'database_version', current_setting('server_version'),
  'accounts', (select count(*) from auth.users),
  'profiles', (select count(*) from public.profiles),
  'registrations', (select count(*) from public.registrations),
  'products', (select count(*) from public.products),
  'published_products', (select count(*) from public.products where publication_status='PUBLISHED'),
  'carts', (select count(*) from public.carts),
  'cart_items', (select count(*) from public.cart_items),
  'orders', (select count(*) from public.orders),
  'order_items', (select count(*) from public.order_items),
  'access_grants', (select count(*) from public.access_grants),
  'pdf_licenses', (select count(*) from public.pdf_licenses),
  'pdf_license_events', (select count(*) from public.pdf_license_events),
  'pdf_download_logs', (select count(*) from public.pdf_download_logs),
  'admin_audit_events', (select count(*) from public.admin_audit_events),
  'admin_roles', (select count(*) from teorema_private.commerce_admins),
  'admin_invitations', (select count(*) from teorema_private.admin_profile_invitations),
  'cart_operations', (select count(*) from teorema_private.cart_operations),
  'request_limits', (select count(*) from teorema_private.request_limits),
  'admin_first_access_pending', (select count(*) from teorema_private.commerce_admins a
    join auth.users u on u.id=a.user_id where a.is_active and u.email_confirmed_at is null),
  'pending_uploads', (select count(*) from public.product_uploads where state='UPLOADING'),
  'validated_files', (select count(*) from public.product_files where validation_status='VALIDATED'),
  'missing_validated_objects', (select count(*) from public.product_files f where f.validation_status='VALIDATED'
    and not exists(select 1 from storage.objects o where o.bucket_id=f.bucket_id and o.name=f.object_key)),
  'buckets', (select jsonb_agg(jsonb_build_object('id',b.id,'public',b.public,
    'objects',(select count(*) from storage.objects o where o.bucket_id=b.id)) order by b.id) from storage.buckets b),
  'application_tables_without_rls', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','teorema_private') and c.relkind in ('r','p') and not c.relrowsecurity),
  'extensions', (select jsonb_agg(jsonb_build_object('name',extname,'version',extversion) order by extname) from pg_extension)
) as backup_inventory;
commit;
