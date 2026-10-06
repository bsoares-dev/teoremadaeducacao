-- Cover the full composite foreign keys reported by the live Supabase advisor.
-- Additive; no data, permission or existing-index removal.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
create index order_items_order_owner_fk_idx on public.order_items(order_id,user_id);
create index order_items_file_product_fk_idx on public.order_items(purchased_file_id,product_id);
create index access_grants_origin_fk_idx on public.access_grants(order_item_id,user_id,product_id);
commit;
