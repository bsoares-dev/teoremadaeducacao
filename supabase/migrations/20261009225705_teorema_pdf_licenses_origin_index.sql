-- Cover every column of the composite origin FK; no existing commerce object
-- is changed. Keep the first applied migration immutable.
create index pdf_licenses_item_owner_idx
  on public.pdf_licenses(order_item_id,user_id,product_id);
