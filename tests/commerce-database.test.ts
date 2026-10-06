import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { CartResult, CartSnapshot } from "../lib/cart-contract";

const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const baseline = ["20261004005128_teorema_accounts_catalog_security", "20261004005139_teorema_carts_security", "20261004005326_teorema_catalog_policy_cleanup"];
const commerce = sql("20261005004458_teorema_pdf_orders_access");
const verification = readFileSync(new URL("../supabase/verify-commerce.sql", import.meta.url), "utf8");
const adminProducts = sql("20261005235705_teorema_admin_product_uploads");
const cartSync = sql("20261006155743_teorema_cart_sync");
const admin = "00000000-0000-4000-8000-000000000010";
const alice = "00000000-0000-4000-8000-000000000011";
const bob = "00000000-0000-4000-8000-000000000012";
const unconfirmed = "00000000-0000-4000-8000-000000000013";
const pdf1 = "10000000-0000-4000-8000-000000000001";
const pdf2 = "10000000-0000-4000-8000-000000000002";
const prices = { [pdf1]: 39.90, [pdf2]: 29.90 };

test("stage 5: atomic cart merge, ownership, revisions, retries and current prices", async t => {
  const db = await setup();
  const read = async (owner = alice) => (await db.query<{ value: CartSnapshot }>("select teorema_read_cart($1) as value", [owner])).rows[0].value;
  const sync = async (owner: string, snapshot: CartSnapshot, add: string[] = [], remove: string[] = [], op = randomUUID()) =>
    (await db.query<{ value: CartResult }>("select teorema_sync_cart($1,$2,$3,$4,$5,$6) as value", [owner, op, snapshot.id, snapshot.revision, add, remove])).rows[0].value;
  let initial: CartSnapshot, first: CartResult;
  const firstKey = randomUUID();
  try {
    await seed(db);
    await db.exec("reset role"); await db.exec(adminProducts); await db.exec(cartSync); await db.exec("set role service_role");
    await t.test("reading does not create a cart; merging two IDs stores one unit and exact cents", async () => {
      initial = await read(); assert.equal(initial.id, null); assert.equal(initial.totalCents, 0);
      first = await sync(alice, initial, [pdf1, pdf2, pdf1], [], firstKey);
      assert.equal(first.cart.items.length, 2); assert.equal(first.cart.totalCents, 6980);
      assert.deepEqual(first.acceptedIds, [pdf1, pdf2]);
      assert.deepEqual((await db.query("select quantity from cart_items")).rows, [{ quantity: 1 }, { quantity: 1 }]);
      assert.equal((await read(bob)).items.length, 0);
    });
    await t.test("lost-response retry returns latest cart without resurrecting a removed item", async () => {
      const removed = await sync(alice, first.cart, [], [pdf1]);
      const replay = await sync(alice, initial, [pdf1, pdf2, pdf1], [], firstKey);
      assert.equal(replay.cart.revision, removed.cart.revision);
      assert.deepEqual(replay.cart.items.map(item => item.id), [pdf2]);
      await assert.rejects(sync(alice, initial, [pdf1], [], firstKey), /Operation key reused/);
      await assert.rejects(sync(alice, first.cart, [], [pdf2]), /Cart changed/);
      await assert.rejects(sync(bob, removed.cart, [], [pdf2]), /Cart changed/);
    });
    await t.test("reprice uses catalog cents and exposes previous price; no write on read", async () => {
      await db.query("update products set price=29.91 where id=$1", [pdf2]);
      const current = await read();
      assert.equal(current.totalCents, 2991); assert.equal(current.items[0].priceChanged, true);
      assert.equal(current.items[0].previousPriceCents, 2990);
      await db.query("update products set is_active=false,publication_status='UNPUBLISHED' where id=$1", [pdf2]);
      const blocked = await read(); assert.equal(blocked.hasBlockedItems, true); assert.equal(blocked.totalCents, 0);
      const rejected = await sync(alice, blocked, [pdf2, randomUUID()]);
      assert.equal(rejected.rejected.length, 2); assert.equal(rejected.acceptedIds.length, 0);
      await sync(alice, rejected.cart, [], [pdf2]);
      await db.query("update products set price=29.90,is_active=true,publication_status='PUBLISHED' where id=$1", [pdf2]);
    });
    await t.test("confirmed account required and acquired PDFs cannot be merged again", async () => {
      await assert.rejects(read(unconfirmed), /Confirmed account/);
      const merged = await sync(alice, await read(), [pdf1, pdf2]);
      const purchased = await order(db, alice, merged.cart.id!);
      await db.query("select teorema_confirm_order($1,$2)", [admin, purchased]);
      const result = await sync(alice, await read(), [pdf1, pdf2]);
      assert.deepEqual(result.rejected.map(item => item.reason), ["owned", "owned"]);
      assert.equal(result.cart.items.length, 0);
    });
    await t.test("50-item limit preserves stored selection and returns excess IDs explicitly", async () => {
      const extra = Array.from({ length: 51 }, () => randomUUID());
      for (const id of extra) {
        await db.query("insert into products(id,name,description,price,image_url,is_active,publication_status) values($1,'Fixture','Synthetic material',0.01,'https://example.test/cover.jpg',false,'DRAFT')", [id]);
        await file(db, id);
        await db.query("update products set is_active=true,publication_status='PUBLISHED' where id=$1", [id]);
      }
      const start = await sync(bob, await read(bob), extra.slice(0, 49));
      const overflow = await sync(bob, start.cart, extra.slice(49));
      assert.equal(overflow.cart.items.length, 50); assert.equal(overflow.cart.totalCents, 50);
      assert.deepEqual(overflow.rejected, [{ id: extra[50], reason: "limit" }]);
      assert.equal(overflow.acceptedIds.length, 1);
      await assert.rejects(sync(bob, overflow.cart, extra), /Invalid selection/);
    });
    await t.test("clients cannot call RPCs or inspect retry journal; legacy writers retired", async () => {
      await assert.rejects(db.query("select teorema_set_cart_item($1,$2,$3,2)", [bob, (await read(bob)).id, pdf1]), /permission denied/);
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`reset role; set role ${role}`);
        const visible = await db.query("select id,name,description,price,image_url from products where is_active=true");
        assert.ok(visible.rows.length > 0);
        await assert.rejects(db.exec("select id from products where publication_status='PUBLISHED'"), /permission denied/);
        await assert.rejects(read(bob), /permission denied/);
        await assert.rejects(db.exec("select * from teorema_private.cart_operations"), /permission denied/);
      }
      await client(db, alice);
      assert.equal((await db.query("select id from cart_items")).rows.length, 2); // Purchased historical cart, own rows only.
    });
  } finally { await db.close(); }
});

test("stage 5 migration refuses conflicting legacy carts without changing data", async () => {
  const db = await setup();
  try {
    await seed(db); const c = await cart(db);
    await db.query("select teorema_set_cart_item($1,$2,$3,2)", [alice, c, pdf1]);
    await db.exec("reset role"); await db.exec(adminProducts);
    await assert.rejects(db.exec(cartSync), /Review legacy open carts/);
    await db.exec("rollback");
    assert.equal((await db.query<{ quantity: number }>("select quantity from cart_items where product_id=$1", [pdf1])).rows[0].quantity, 2);
    assert.equal((await db.query("select 1 from information_schema.columns where table_name='carts' and column_name='revision'")).rows.length, 0);
  } finally { await db.close(); }
});

async function setup(options: { migrate?: boolean; eligibleAdmin?: boolean } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,created_at timestamptz default now(),
      email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create table storage.buckets(id text primary key,name text,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    -- Broad platform fixture to verify our restrictive managed-bucket policy wins.
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant all on storage.buckets,storage.objects to service_role;
    grant all on storage.objects to anon,authenticated;
    create policy legacy_storage_open on storage.objects for all to public using(true) with check(true);
    -- Match audited legacy column nullability/types and CPF uniqueness, not just a fresh app schema.
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,
      email text not null,cpf varchar(14) unique,phone varchar(20),created_at timestamptz not null default now());
    create table public.products(id uuid primary key default gen_random_uuid(),name text not null,description text,
      price numeric not null,image_url text,is_active boolean default true,created_at timestamptz not null default now());
    create function public.handle_new_user() returns trigger language plpgsql security definer as $$
    begin insert into public.profiles(id,email,cpf,phone)
      values(new.id,new.email,new.raw_user_meta_data->>'cpf',new.raw_user_meta_data->>'phone'); return new; end $$;
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
  `);
  for (const name of baseline) await db.exec(sql(name));
  let fixtureNumber = 1;
  for (const [id, email, confirmed] of [
    [admin, "bernardozsoares11@gmail.com", options.eligibleAdmin !== false],
    [alice, "alice@example.test", true], [bob, "bob@example.test", true], [unconfirmed, "pending@example.test", false],
  ] as const) {
    await db.query("insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,$4)",
      [id, email, JSON.stringify({ cpf: syntheticCpf(fixtureNumber++), phone: "48999999999" }), confirmed ? "2026-10-04T12:00:00Z" : null]);
  }
  if (options.migrate !== false) {
    await db.exec(commerce);
    await db.exec(sql("20261005004940_teorema_commerce_fk_indexes"));
  }
  await db.exec("set role service_role");
  return db;
}

function syntheticCpf(seed: number) {
  let digits = `900000${seed.toString().padStart(3, "0")}`;
  for (const length of [9, 10]) {
    const sum = [...digits].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    digits += String(((sum * 10) % 11) % 10);
  }
  return digits;
}

async function file(db: PGlite, product: string, version = 1, current = true) {
  const id = randomUUID();
  const key = `products/${product}/${id}.pdf`;
  await db.query(`insert into product_files(id,product_id,version,version_label,object_key,size_bytes,mime_type,sha256,
    validation_status,validated_at,is_current,uploaded_by) values($1,$2,$3,$4,$5,1024,'application/pdf',$6,'VALIDATED',now(),$7,$8)`,
    [id, product, version, `${version}.0`, key, "a".repeat(64), current, admin]);
  await db.query("insert into storage.objects(bucket_id,name) values('teorema-pdfs',$1)", [key]);
  return { id, key };
}

async function seed(db: PGlite) {
  await db.exec(`insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('teorema-pdfs','teorema-pdfs',false,20971520,array['application/pdf']),
      ('teorema-covers','teorema-covers',true,5242880,array['image/jpeg','image/png','image/webp']),
      ('unrelated','unrelated',false,null,null);`);
  await db.query("insert into products(id,name,description,price,image_url,is_active) values($1,'Caderno inclusivo','PDF de teste',39.90,'https://example.test/cover1.jpg',true),($2,'Planejamento','PDF de teste',29.90,'https://example.test/cover2.jpg',true)", [pdf1, pdf2]);
  await file(db, pdf1); await file(db, pdf2);
  await db.exec("insert into storage.objects(bucket_id,name) values('teorema-covers','cover.jpg'),('unrelated','safe.txt')");
}

async function cart(db: PGlite, owner = alice, products = [pdf1, pdf2]) {
  const id = (await db.query<{ id: string }>("select teorema_get_or_create_cart($1) as id", [owner])).rows[0].id;
  for (const p of products) await db.query("select teorema_set_cart_item($1,$2,$3,1)", [owner, id, p]);
  return id;
}

async function order(db: PGlite, owner: string, cartId: string, key: string = randomUUID(), expected: Record<string, number> = prices) {
  const total = Object.values(expected).reduce((a, b) => a + b, 0).toFixed(2);
  return (await db.query<{ id: string }>("select teorema_create_order($1,$2,$3,$4,$5) as id",
    [owner, cartId, key, total, JSON.stringify(expected)])).rows[0].id;
}

async function client(db: PGlite, id: string) {
  await db.exec("reset role; set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}

test("stage 3: drafts, safe publication, immutable versions, authorization and retries", async t => {
  const db = await setup();
  const product = randomUUID();
  const digest = "b".repeat(64);
  let pdfUpload = "";
  async function reserve(kind: "PDF" | "COVER", id: string = randomUUID()) {
    await db.query("select teorema_reserve_upload($1,$2,$3,$4,$5,$6,$7,$8)",
      [admin, product, id, kind, kind === "PDF" ? "material.pdf" : "capa.png", 1024,
        kind === "PDF" ? "application/pdf" : "image/png", "Revisão"]);
    return id;
  }
  async function finish(id: string, kind: "PDF" | "COVER") {
    const bucket = kind === "PDF" ? "teorema-pdfs" : "teorema-covers";
    const key = `products/${product}/${id}.${kind === "PDF" ? "pdf" : "webp"}`;
    await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [bucket, key]);
    await db.query("select teorema_finish_upload($1,$2,$3,$4)", [admin, id, digest,
      kind === "COVER" ? `https://example.test/storage/v1/object/public/${bucket}/${key}` : null]);
  }
  async function revision() {
    return (await db.query<{ revision: number }>("select revision from products where id=$1", [product])).rows[0].revision;
  }
  try {
    await db.exec("reset role"); await db.exec(adminProducts); await db.exec("set role service_role");
    await db.exec(`insert into storage.buckets(id,name,public) values
      ('teorema-pdfs','teorema-pdfs',false),('teorema-covers','teorema-covers',true),('teorema-uploads','teorema-uploads',false)`);

    await t.test("new products remain drafts and create retries do not duplicate audit", async () => {
      const values = [admin, product, 0, "Material de teste", "Descrição sintética do material", "39.90"];
      await db.query("select teorema_save_product($1,$2,$3,$4,$5,$6)", values);
      await db.query("select teorema_save_product($1,$2,$3,$4,$5,$6)", values);
      const row = (await db.query<{ is_active: boolean; publication_status: string }>("select is_active,publication_status from products where id=$1", [product])).rows[0];
      assert.equal(row.is_active, false); assert.equal(row.publication_status, "DRAFT");
      assert.equal((await db.query<{ count: number }>("select count(*)::int as count from admin_audit_events where entity_id=$1", [product])).rows[0].count, 1);
      await assert.rejects(db.query("select teorema_set_product_state($1,$2,'PUBLISHED',$3,$4)", [admin, product, await revision(), randomUUID()]), /Validated PDF and cover/);
      await assert.rejects(db.query("select teorema_save_product($1,$2,1,'Bad product','Synthetic description',2)", [alice, product]), /Administrator required/);
    });

    await t.test("reserving does not validate; missing final object cannot be published", async () => {
      pdfUpload = await reserve("PDF");
      await reserve("PDF", pdfUpload);
      assert.equal((await db.query<{ count: number }>("select count(*)::int as count from product_files where product_id=$1", [product])).rows[0].count, 1);
      await assert.rejects(db.query("select teorema_finish_upload($1,$2,$3,null)", [admin, pdfUpload, digest]), /Private final object missing/);
      await finish(pdfUpload, "PDF");
      await db.query("select teorema_finish_upload($1,$2,$3,null)", [admin, pdfUpload, digest]);
      await assert.rejects(db.query("select teorema_reject_upload($1,$2,'Invalid content')", [admin, pdfUpload]), /Validated history/);
      await assert.rejects(db.query("select teorema_set_product_state($1,$2,'PUBLISHED',$3,$4)", [admin, product, await revision(), randomUUID()]), /Validated PDF and cover/);
    });

    await t.test("validated cover enables explicit publication and stale revisions fail", async () => {
      await finish(await reserve("COVER"), "COVER");
      const oldRevision = await revision();
      const operation = randomUUID();
      await db.query("select teorema_set_product_state($1,$2,'PUBLISHED',$3,$4)", [admin, product, oldRevision, operation]);
      await db.query("select teorema_set_product_state($1,$2,'PUBLISHED',$3,$4)", [admin, product, oldRevision, operation]);
      assert.equal((await db.query<{ is_active: boolean }>("select is_active from products where id=$1", [product])).rows[0].is_active, true);
      await assert.rejects(db.query("select teorema_save_product($1,$2,$3,'Changed name','Changed description',12)", [admin, product, oldRevision]), /Product changed/);
    });

    await t.test("replacement preserves purchased version and stale upload cannot downgrade", async () => {
      const cartId = await cart(db, alice, [product]);
      const orderId = await order(db, alice, cartId, randomUUID(), { [product]: 39.90 });
      await db.query("select teorema_confirm_order($1,$2)", [admin, orderId]);
      const older = await reserve("PDF"), newer = await reserve("PDF");
      await finish(newer, "PDF");
      await assert.rejects(finish(older, "PDF"), /Newer version already current/);
      const files = (await db.query<{ id: string; is_current: boolean; validation_status: string }>("select id,is_current,validation_status from product_files where product_id=$1 order by version", [product])).rows;
      assert.equal(files[0].id, pdfUpload); assert.equal(files[0].is_current, false);
      assert.equal(files[0].validation_status, "VALIDATED"); assert.equal(files[2].is_current, true);
      assert.equal((await db.query<{ purchased_file_id: string }>("select purchased_file_id from order_items where order_id=$1", [orderId])).rows[0].purchased_file_id, pdfUpload);
      const resolved = (await db.query<{ data: { file_id: string } }>("select teorema_resolve_pdf($1,$2) as data", [alice, product])).rows[0].data;
      assert.ok(JSON.stringify(resolved).includes(newer));
      await db.query("select teorema_reject_upload($1,$2,'Stale upload canceled')", [admin, older]);
      await assert.rejects(db.query("update product_uploads set state='VALIDATED' where id=$1", [older]), /immutable/);
    });

    await t.test("unpublishing and archiving preserve access and historical files", async () => {
      await db.query("select teorema_set_product_state($1,$2,'UNPUBLISHED',$3,$4)", [admin, product, await revision(), randomUUID()]);
      await db.query("select teorema_resolve_pdf($1,$2)", [alice, product]);
      await db.query("select teorema_set_product_state($1,$2,'ARCHIVED',$3,$4)", [admin, product, await revision(), randomUUID()]);
      await db.query("select teorema_resolve_pdf($1,$2)", [alice, product]);
      await assert.rejects(reserve("PDF"), /Archived product/);
      await assert.rejects(db.query("delete from product_files where id=$1", [pdfUpload]), /permission denied|cannot be deleted/);
      await assert.rejects(db.query("delete from products where id=$1", [product]), /permission denied/);
    });

    await t.test("students cannot read reservations, invoke admin RPCs or write staging", async () => {
      await client(db, bob);
      await assert.rejects(db.query("select * from product_uploads"), /permission denied/);
      await assert.rejects(db.query("select teorema_admin_check($1)", [admin]), /permission denied/);
      await assert.rejects(db.query("select teorema_save_product($1,$2,0,'Injected','Injected description',1)", [admin, randomUUID()]), /permission denied/);
      await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('teorema-uploads','injected')"), /row-level security/);
      assert.equal((await db.query("select id from storage.objects where bucket_id='teorema-pdfs'")).rows.length, 0);
    });
  } finally { await db.close(); }
});

test("Auth eligibility works without granting service_role access to auth.users and the helper remains server-only", async () => {
  const db = await setup();
  try {
    assert.equal((await db.query<{ allowed: boolean }>("select has_table_privilege('service_role','auth.users','SELECT') as allowed")).rows[0].allowed, false);
    await assert.rejects(db.query('select id from auth.users'), /permission denied/);
    await db.query('select teorema_private.commerce_assert_user($1)', [alice]);
    await assert.rejects(db.query('select teorema_private.commerce_assert_user($1)', [unconfirmed]), /Confirmed account/);
    await client(db, alice);
    await assert.rejects(db.query('select teorema_private.commerce_assert_user($1)', [bob]), /permission denied/);
    await db.exec('reset role');
    await assert.rejects(db.query('select teorema_private.commerce_assert_user($1)', [alice]), /Trusted server/);
    await db.exec('set role service_role');
    await assert.rejects(db.query('update teorema_private.commerce_admins set is_active=false'), /permission denied/);
  } finally { await db.close(); }
});

test("commerce creates atomic snapshots, retries never duplicate orders, and grants every PDF only at confirmation", async () => {
  const db = await setup();
  try {
    await seed(db);
    const c = await cart(db); const key = randomUUID(); const o = await order(db, alice, c, key);
    assert.equal(await order(db, alice, c, key), o);
    assert.equal(await order(db, alice, c, randomUUID()), o);
    assert.equal((await db.query("select * from orders")).rows.length, 1);
    assert.equal((await db.query("select * from access_grants")).rows.length, 0);
    await assert.rejects(db.query("select teorema_resolve_pdf($1,$2)", [alice, pdf1]), /not authorized/);
    await db.query("update products set name='Título novo',price=60,is_active=false where id=$1", [pdf1]);
    assert.equal((await db.query<{ product_name: string }>("select product_name from order_items where order_id=$1 and product_id=$2", [o, pdf1])).rows[0].product_name, "Caderno inclusivo");
    assert.equal((await db.query<{ total_amount: string }>("select total_amount from orders where id=$1", [o])).rows[0].total_amount, "69.80");
    await assert.rejects(db.query("select teorema_confirm_order($1,$2)", [bob, o]), /Administrator required/);
    await db.query("select teorema_confirm_order($1,$2)", [admin, o]);
    await db.query("select teorema_confirm_order($1,$2)", [admin, o]);
    assert.equal((await db.query("select * from access_grants where state='ATIVO'")).rows.length, 2);
    assert.equal((await db.query("select * from admin_audit_events where action='ORDER_CONFIRMED'")).rows.length, 1);
    assert.equal((await db.query("select teorema_resolve_pdf($1,$2)", [alice, pdf1])).rows.length, 1); // unpublish != revoke
    await assert.rejects(db.query("select teorema_resolve_pdf($1,$2)", [bob, pdf1]), /not authorized/);
    await assert.rejects(db.query("select teorema_cancel_order($1,$2,'Teste cancelamento')", [admin, o]));
  } finally { await db.close(); }
});

test("checkout rejects missing account, wrong owner, forged price, offsetting price changes, duplicate units and missing PDFs without partial writes", async () => {
  const db = await setup();
  try {
    await seed(db); const c = await cart(db); const key = randomUUID();
    await assert.rejects(order(db, bob, c, key), /Cart unavailable/);
    await assert.rejects(order(db, unconfirmed, c, key), /Confirmed account/);
    await assert.rejects(order(db, alice, c, key, { [pdf1]: 0.01, [pdf2]: 0.01 }), /Prices changed/);
    await db.query("update products set price=price+case when id=$1 then 1 else -1 end", [pdf1]);
    await assert.rejects(order(db, alice, c, key), /Prices changed/); // unchanged total is not enough
    await db.query("update products set price=case when id=$1 then 39.90 else 29.90 end", [pdf1]);
    await db.query("select teorema_set_cart_item($1,$2,$3,2)", [alice, c, pdf1]);
    await assert.rejects(order(db, alice, c, key), /One unit/);
    await db.query("select teorema_set_cart_item($1,$2,$3,1)", [alice, c, pdf1]);
    await db.query("update product_files set is_current=false where product_id=$1", [pdf1]);
    await assert.rejects(order(db, alice, c, key), /PDF unavailable/);
    assert.equal((await db.query("select * from orders")).rows.length, 0);
    assert.equal((await db.query<{ status: string }>("select status from carts where id=$1", [c])).rows[0].status, "OPEN");
    assert.equal((await db.query("select * from order_items")).rows.length, 0);
  } finally { await db.close(); }
});

test("RLS isolates two customers; anonymous and authenticated cannot forge orders/access nor read private paths/history, even with future broad grants", async () => {
  const db = await setup();
  try {
    await seed(db); await order(db, alice, await cart(db)); await order(db, bob, await cart(db, bob));
    await db.exec("reset role; set role anon");
    for (const t of ["orders", "order_items", "access_grants", "product_files", "admin_audit_events"]) await assert.rejects(db.query(`select id from ${t}`));
    await client(db, alice);
    assert.deepEqual((await db.query("select user_id from orders")).rows, [{ user_id: alice }]);
    assert.equal((await db.query("select id from order_items")).rows.length, 2);
    await assert.rejects(db.query("select idempotency_key,cancellation_reason from orders"));
    await assert.rejects(db.query("select purchased_file_id from order_items"));
    await assert.rejects(db.query("select object_key from product_files"));
    await assert.rejects(db.query("select teorema_confirm_order($1,$1)", [admin]));
    await assert.rejects(db.query("select teorema_create_order($1,$1,$1,1,'{}')", [alice]));
    await assert.rejects(db.query("select teorema_cancel_order($1,$1,'Teste')", [admin]));
    await assert.rejects(db.query("select teorema_set_access_state($1,$1,'ATIVO','Teste',$1)", [admin]));
    await assert.rejects(db.query("select teorema_resolve_pdf($1,$2)", [alice, pdf1]));
    await assert.rejects(db.query("select * from teorema_private.commerce_admins"));
    await db.exec("reset role");
    for (const t of ["orders", "order_items", "access_grants", "product_files", "admin_audit_events"]) {
      await db.exec(`grant all on ${t} to anon,authenticated; create policy accidental_open on ${t} for all to public using(true) with check(true);`);
    }
    await client(db, alice);
    assert.deepEqual((await db.query("select user_id from orders")).rows, [{ user_id: alice }]);
    assert.equal((await db.query("select object_key from product_files")).rows.length, 0);
    assert.equal((await db.query("select * from admin_audit_events")).rows.length, 0);
    for (const t of ["orders", "order_items", "access_grants", "product_files", "admin_audit_events"]) {
      assert.equal((await db.query(`delete from ${t} returning id`)).rows.length, 0);
    }
    assert.equal((await db.query("update orders set status='CONFIRMADO' returning id")).rows.length, 0);
    await assert.rejects(db.query("insert into orders(user_id,source_cart_id,idempotency_key,total_amount) values($1,$1,$1,1)", [alice]));
    await db.exec("reset role; set role anon");
    assert.equal((await db.query("select id from orders")).rows.length, 0);
    assert.equal((await db.query("select id from product_files")).rows.length, 0);
  } finally { await db.close(); }
});

test("Storage guards deny list/read/upload/update/delete on managed buckets without disturbing unrelated buckets", async () => {
  const db = await setup();
  try {
    await seed(db);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      assert.deepEqual((await db.query("select bucket_id from storage.objects")).rows, [{ bucket_id: "unrelated" }]);
      for (const bucket of ["teorema-pdfs", "teorema-covers"]) {
        await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values($1,'forged.pdf')", [bucket]));
        assert.equal((await db.query("update storage.objects set name='forged.pdf' where bucket_id=$1 returning id", [bucket])).rows.length, 0);
        assert.equal((await db.query("delete from storage.objects where bucket_id=$1 returning id", [bucket])).rows.length, 0);
      }
    }
  } finally { await db.close(); }
});

test("revocation is reasoned/audited, stale retries do not re-revoke after restore, and updates resolve the current version", async () => {
  const db = await setup();
  try {
    await seed(db); const o = await order(db, alice, await cart(db)); await db.query("select teorema_confirm_order($1,$2)", [admin, o]);
    const g = (await db.query<{ id: string }>("select id from access_grants where user_id=$1 and product_id=$2", [alice, pdf1])).rows[0].id;
    const revokeOp = randomUUID(); const restoreOp = randomUUID();
    const action = (state: string, reason: string, op: string) => db.query("select teorema_set_access_state($1,$2,$3,$4,$5)", [admin, g, state, reason, op]);
    await assert.rejects(action("REVOGADO", "", revokeOp), /Invalid access/);
    await action("REVOGADO", "Decisão de teste", revokeOp); await action("REVOGADO", "Decisão de teste", revokeOp);
    await assert.rejects(db.query("select teorema_resolve_pdf($1,$2)", [alice, pdf1]), /not authorized/);
    await action("ATIVO", "Restabelecido em teste", restoreOp);
    await action("REVOGADO", "Decisão de teste", revokeOp); // old retry: no mutation
    assert.equal((await db.query<{ state: string }>("select state from access_grants where id=$1", [g])).rows[0].state, "ATIVO");
    await assert.rejects(action("ATIVO", "Outra decisão", revokeOp), /Operation key/);
    await db.query("update product_files set is_current=false where product_id=$1", [pdf1]);
    const v2 = await file(db, pdf1, 2);
    const resolved = (await db.query<{ result: { version: number; object_key: string } }>("select teorema_resolve_pdf($1,$2) as result", [alice, pdf1])).rows[0].result;
    assert.equal(resolved.version, 2); assert.equal(resolved.object_key, v2.key);
    assert.equal((await db.query("select id from product_files where product_id=$1", [pdf1])).rows.length, 2);
    assert.equal((await db.query("select id from admin_audit_events where entity_id=$1", [g])).rows.length, 2);
    await db.query("delete from storage.objects where name=$1", [v2.key]);
    await assert.rejects(db.query("select teorema_resolve_pdf($1,$2)", [alice, pdf1]), /PDF unavailable/);
    assert.equal((await db.query<{ state: string }>("select state from access_grants where id=$1", [g])).rows[0].state, "ATIVO");
  } finally { await db.close(); }
});

test("one valid grant survives revocation of a different purchase origin; cancellation never grants files", async () => {
  const db = await setup();
  try {
    await seed(db); const first = await order(db, alice, await cart(db, alice, [pdf1]), randomUUID(), { [pdf1]: 39.9 });
    await db.query("select teorema_confirm_order($1,$2)", [admin, first]);
    const g1 = (await db.query<{ id: string }>("select id from access_grants")).rows[0].id;
    const c2 = await cart(db, alice, [pdf1]);
    await assert.rejects(order(db, alice, c2, randomUUID(), { [pdf1]: 39.9 }), /already authorized/);
    await db.query("select teorema_set_access_state($1,$2,'REVOGADO','Decisão de teste',$3)", [admin, g1, randomUUID()]);
    const second = await order(db, alice, c2, randomUUID(), { [pdf1]: 39.9 });
    await db.query("select teorema_confirm_order($1,$2)", [admin, second]);
    await db.query("select teorema_set_access_state($1,$2,'ATIVO','Decisão de teste',$3)", [admin, g1, randomUUID()]);
    await db.query("select teorema_set_access_state($1,$2,'REVOGADO','Nova decisão teste',$3)", [admin, g1, randomUUID()]);
    assert.equal((await db.query("select teorema_resolve_pdf($1,$2)", [alice, pdf1])).rows.length, 1);
    const pending = await order(db, bob, await cart(db, bob));
    await db.query("select teorema_cancel_order($1,$2,'Cliente desistiu em teste')", [admin, pending]);
    await db.query("select teorema_cancel_order($1,$2,'Cliente desistiu em teste')", [admin, pending]);
    await assert.rejects(db.query("select teorema_confirm_order($1,$2)", [admin, pending]), /cannot be confirmed/);
    assert.equal((await db.query("select id from access_grants where user_id=$1", [bob])).rows.length, 0);
    assert.equal((await db.query("select id from admin_audit_events where action='ORDER_CANCELED'")).rows.length, 1);
  } finally { await db.close(); }
});

test("constraints preserve historical rows and enforce matching origins, immutable files/snapshots and all-or-nothing confirmation", async () => {
  const db = await setup();
  try {
    await seed(db); const o = await order(db, alice, await cart(db));
    await assert.rejects(db.query("update orders set total_amount=0.01 where id=$1", [o]), /snapshot is immutable/);
    await assert.rejects(db.query("update order_items set unit_price=0.01 where order_id=$1", [o]), /immutable/);
    await assert.rejects(db.query("update product_files set object_key='public.pdf'"), /immutable/);
    await assert.rejects(db.query("update orders set status='CONFIRMADO',confirmed_by=$1,confirmed_at=now() where id=$2", [admin, o]), /grant every item/);
    assert.equal((await db.query<{ status: string }>("select status from orders where id=$1", [o])).rows[0].status, "AGUARDANDO_CONFIRMACAO");
    const item = (await db.query<{ id: string }>("select id from order_items where order_id=$1 and product_id=$2", [o, pdf1])).rows[0].id;
    await assert.rejects(db.query("insert into access_grants(order_item_id,user_id,product_id,granted_by) values($1,$2,$3,$4)", [item, alice, pdf1, admin]), /confirmed order/);
    await db.query("select teorema_confirm_order($1,$2)", [admin, o]);
    await assert.rejects(db.query("update access_grants set user_id=$1", [bob]), /origin is immutable/);
    await db.exec("reset role");
    await assert.rejects(db.query("delete from orders where id=$1", [o]), /cannot be deleted/);
    await assert.rejects(db.query("delete from profiles where id=$1", [alice]));
    await assert.rejects(db.query("delete from product_files"), /cannot be deleted/);
    await assert.rejects(db.query("update admin_audit_events set action='ORDER_CANCELED'"), /immutable/);
  } finally { await db.close(); }
});

test("migration aborts atomically for a public PDF bucket and grants no admin fallback for an unconfirmed admin", async () => {
  const db = await setup({ migrate: false });
  try {
    await db.exec("insert into storage.buckets(id,name,public) values('teorema-pdfs','teorema-pdfs',true); reset role");
    await assert.rejects(db.exec(commerce), /PDF bucket is public/); await db.exec("rollback");
    assert.equal((await db.query<{ relation: string | null }>("select to_regclass('public.orders') as relation")).rows[0].relation, null);
    assert.equal((await db.query<{ n: number }>("select count(*)::int as n from profiles")).rows[0].n, 4);
  } finally { await db.close(); }
  const noAdmin = await setup({ eligibleAdmin: false });
  try {
    assert.equal((await noAdmin.query("select * from teorema_private.commerce_admins")).rows.length, 0);
    await assert.rejects(noAdmin.query("select teorema_confirm_order($1,$2)", [admin, randomUUID()]), /Confirmed account/);
    await assert.rejects(noAdmin.query("insert into teorema_private.commerce_admins(user_id) values($1)", [bob]));
  } finally { await noAdmin.close(); }
});

test("aggregate verification distinguishes configuration readiness and checks every security/integrity invariant", async () => {
  const db = await setup();
  try {
    const start = verification.indexOf("select '01_");
    assert.ok(start > 0);
    await db.exec(verification.slice(0, start));
    const report = async () => {
      await db.exec('reset role');
      try { return await db.query<{ verificacao: string; categoria: string; pendencias: number }>(verification.slice(start)); }
      finally { await db.exec('set role service_role'); }
    };
    assert.equal(Number((await report()).rows.find(r => r.verificacao.startsWith("13_"))?.pendencias), 1);
    await seed(db);
    const o = await order(db, alice, await cart(db));
    await db.query("select teorema_confirm_order($1,$2)", [admin, o]);
    for (const row of (await report()).rows) assert.equal(Number(row.pendencias), 0, row.verificacao);
  } finally { await db.close(); }
});

test("file metadata rejects non-admin uploads, oversize/mime/path/hash errors, duplicate current versions and inconsistent access origins", async () => {
  const db = await setup();
  try {
    await seed(db);
    const invalid = (field: string, value: unknown) => {
      const fields = ["size_bytes", "mime_type", "object_key", "sha256", "uploaded_by"];
      assert.ok(fields.includes(field));
      const id = randomUUID();
      const values: Record<string, unknown> = { size_bytes: 1024, mime_type: "application/pdf", object_key: `products/${pdf1}/${id}.pdf`, sha256: "b".repeat(64), uploaded_by: admin };
      values[field] = value;
      return db.query(`insert into product_files(id,product_id,version,version_label,size_bytes,mime_type,object_key,sha256,
        validation_status,validated_at,uploaded_by) values($1,$2,2,'2.0',$3,$4,$5,$6,'VALIDATED',now(),$7)`,
        [id, pdf1, values.size_bytes, values.mime_type, values.object_key, values.sha256, values.uploaded_by]);
    };
    for (const [field, value] of [["size_bytes", 20971521], ["mime_type", "text/html"], ["object_key", "../secret.pdf"], ["sha256", "invalid"], ["uploaded_by", bob]] as const) await assert.rejects(invalid(field, value));
    await assert.rejects(file(db, pdf1, 2), /unique/);
    const o = await order(db, alice, await cart(db));
    await db.query("select teorema_confirm_order($1,$2)", [admin, o]);
    const item = (await db.query<{ id: string }>("select id from order_items where order_id=$1 and product_id=$2", [o, pdf1])).rows[0].id;
    await assert.rejects(db.query("insert into access_grants(order_item_id,user_id,product_id,granted_by) values($1,$2,$3,$4)", [item, bob, pdf1, admin]));
    const nextCart = await cart(db);
    const key = (await db.query<{ idempotency_key: string }>("select idempotency_key from orders where id=$1", [o])).rows[0].idempotency_key;
    await assert.rejects(order(db, alice, nextCart, key), /Idempotency key/);
    await db.exec('reset role');
    await db.query("update auth.users set raw_user_meta_data=raw_user_meta_data||$1::jsonb where id=$2", [JSON.stringify({ role: "admin", email: "bernardozsoares11@gmail.com" }), bob]);
    await db.exec('set role service_role');
    await assert.rejects(db.query("select teorema_confirm_order($1,$2)", [bob, o]), /Administrator required/);
    await db.exec('reset role');
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [alice]);
    await db.exec('set role service_role');
    await assert.rejects(db.query("select teorema_resolve_pdf($1,$2)", [alice, pdf1]), /Confirmed account/);
  } finally { await db.close(); }
});
