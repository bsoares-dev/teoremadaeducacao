import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../supabase/migrations/20261003_accounts_catalog.sql", import.meta.url), "utf8");
const cartsMigration = readFileSync(new URL("../supabase/migrations/20261003_carts.sql", import.meta.url), "utf8");
const verification = readFileSync(new URL("../supabase/verify.sql", import.meta.url), "utf8");
const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";

async function setup(existingTrigger = false) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
  `);
  if (existingTrigger) await db.exec(`
    create table public.products(id uuid primary key default gen_random_uuid(), name text not null, description text, price numeric not null, image_url text, is_active boolean, created_at timestamptz not null default now());
    create policy existing_active_products on public.products for select to public using(is_active = true);
    insert into public.products(name,price,is_active) values('Existing hidden',10,false),('Existing draft',10,null);
    create table public.profiles(id uuid primary key references auth.users(id), email text, cpf text, phone text, created_at timestamptz default now());
    create function public.handle_new_user() returns trigger language plpgsql security definer as $$
    begin
      insert into public.profiles(id,email,cpf,phone) values(new.id,new.email,new.raw_user_meta_data->>'cpf',new.raw_user_meta_data->>'phone');
      return new;
    end $$;
    create trigger existing_profile after insert on auth.users for each row execute function public.handle_new_user();
    create policy old_open_select on public.profiles for select to authenticated using(true);
  `);
  await db.exec(migration);
  return db;
}

async function addUser(db: PGlite, id: string, cpf = "52998224725") {
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
    [id, "fixture@example.test", JSON.stringify({ cpf, phone: "48999999999" })]);
}

test("migration is repeatable; trigger validates identifiers; RLS isolates profiles", async () => {
  const db = await setup();
  try {
    await addUser(db, firstId); await addUser(db, secondId);
    await assert.rejects(addUser(db, "00000000-0000-4000-8000-000000000003", "11111111111"));
    await db.exec(migration);
    assert.equal((await db.query("select id from profiles")).rows.length, 2);
    await db.exec("set role anon");
    await assert.rejects(db.query("select id,cpf from public.profiles"));
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [firstId]);
    const own = await db.query<{ id: string }>("select id from profiles");
    assert.deepEqual(own.rows.map(r => r.id), [firstId]);
    await assert.rejects(db.query("update profiles set phone='48911111111'"));
    await assert.rejects(db.query("insert into products(name,description,price,image_url) values('forged','forged',1,'https://example.test/a.png')"));
    await db.exec("reset role; set role service_role");
    assert.equal((await db.query("select id from profiles")).rows.length, 2);
    await db.query("insert into products(name,description,price,image_url) values('PDF','Material de estudo',12.50,'https://example.test/a.png')");
    await assert.rejects(db.query("insert into products(name,description,price,image_url) values('bad','bad',-1,'https://example.test/a.png')"));
    await db.query("insert into products(name,description,price,image_url,is_active) values('hidden','Hidden material',10,'https://example.test/a.png',false),('draft','Draft material',10,'https://example.test/a.png',null)");
    await db.exec("reset role; create policy old_catalog_open on products for select to public using(true); set role service_role");
    assert.equal((await db.query("select id from products")).rows.length, 3);
    await db.exec("reset role; set role anon");
    assert.equal((await db.query("select name,price from products")).rows.length, 1);
    await db.exec("reset role; set role authenticated");
    assert.equal((await db.query("select name,price from products")).rows.length, 1);
  } finally { await db.close(); }
});

test("existing profile trigger is preserved; old broad SELECT policy cannot expose other users", async () => {
  const db = await setup(true);
  try {
    await db.exec(migration);
    assert.deepEqual((await db.query("select is_active from products order by name")).rows, [{ is_active: null }, { is_active: false }]);
    await addUser(db, firstId); await addUser(db, secondId);
    assert.equal((await db.query("select id from profiles")).rows.length, 2);
    const triggers = await db.query("select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal");
    assert.deepEqual(triggers.rows, [{ tgname: "existing_profile" }]);
    const config = await db.query<{ proconfig: string[] }>("select proconfig from pg_proc where oid='public.handle_new_user()'::regprocedure");
    assert.deepEqual(config.rows[0].proconfig, ['search_path=""']);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [firstId]);
    assert.equal((await db.query("select id from profiles")).rows.length, 1);
  } finally { await db.close(); }
});

async function setupCarts() {
  const db = await setup(true);
  await addUser(db, firstId); await addUser(db, secondId);
  await db.exec(`
    create table public.carts(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
      status text default 'OPEN',total_amount numeric(10,2) default 0,created_at timestamptz default now());
    create table public.cart_items(id uuid primary key default gen_random_uuid(),cart_id uuid not null references public.carts(id) on delete cascade,
      product_id uuid not null references public.products(id) on delete restrict,quantity integer not null check(quantity>0),unit_price numeric(10,2) not null,
      created_at timestamptz default now(),unique(cart_id,product_id));
    create table public.registrations(id text primary key, secret_extra text);
    grant all on public.carts,public.cart_items,public.registrations to anon,authenticated;
    grant update(status,total_amount) on public.carts to authenticated;
    grant insert(unit_price),update(unit_price) on public.cart_items to authenticated;
    grant select(secret_extra),update(secret_extra) on public.registrations to anon,authenticated;
    create policy "Usuários gerenciam seus próprios carrinhos" on carts for all to public using(auth.uid()=user_id);
    create policy "Usuários gerenciam itens dos seus carrinhos" on cart_items for all to public using(exists(select 1 from carts c where c.id=cart_id and c.user_id=auth.uid()));
    create policy old_wide_access on carts for all to public using(true) with check(true);
    create policy old_wide_access on cart_items for all to public using(true) with check(true);
    insert into carts(user_id,status,total_amount) values('${firstId}','LEGACY',-1);
  `);
  await db.exec(cartsMigration);
  return db;
}

test("cart migration preserves records and revokes table AND column grants; RPC access is server-only", async () => {
  const db = await setupCarts();
  try {
    await db.exec(migration);
    await db.exec(cartsMigration);
    assert.equal((await db.query("select id from carts where status='LEGACY' and total_amount=-1")).rows.length, 1);
    const report = await db.query<{verificacao:string;pendencias:number}>(verification);
    for (const row of report.rows.filter(r => /^(01|02|03|04|05|12)_/.test(r.verificacao))) {
      assert.equal(Number(row.pendencias),0,row.verificacao);
    }
    assert.equal(Number(report.rows.find(r => r.verificacao.startsWith('07_'))?.pendencias),1);
    const grants = await db.query(`select * from information_schema.column_privileges
      where table_schema='public' and table_name in ('profiles','products','registrations','carts','cart_items')
      and grantee in ('PUBLIC','anon','authenticated') and privilege_type in ('INSERT','UPDATE','REFERENCES')`);
    assert.equal(grants.rows.length, 0);
    await db.exec("set role anon");
    for (const table of ['profiles','registrations','carts','cart_items']) await assert.rejects(db.query(`select id from ${table}`));
    for (const role of ['anon','authenticated']) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(db.query("select public.teorema_get_or_create_cart($1)",[firstId]));
      await assert.rejects(db.query("select public.teorema_set_cart_item($1,$1,$1,1)",[firstId]));
      await assert.rejects(db.query("select public.teorema_prepare_cart($1,$1)",[firstId]));
      await assert.rejects(db.query("update carts set status='COMPLETED',total_amount=0"));
      await assert.rejects(db.query("update cart_items set unit_price=0.01"));
      await assert.rejects(db.query("delete from carts"));
    }
  } finally { await db.close(); }
});

test("cart migration also creates a fresh schema without uuid-ossp", async () => {
  const db = await setup();
  try {
    await db.exec(cartsMigration);
    await db.exec(cartsMigration);
    await addUser(db,firstId);
    await db.exec("set role service_role");
    assert.equal((await db.query("select public.teorema_get_or_create_cart($1)",[firstId])).rows.length,1);
  } finally { await db.close(); }
});

test("cart preparation rolls back repricing when another product is inactive; overflow leaves no item", async () => {
  const db = await setupCarts();
  try {
    await db.exec("set role service_role");
    const cart = (await db.query<{id:string}>("select public.teorema_get_or_create_cart($1) as id",[firstId])).rows[0].id;
    const p1='10000000-0000-4000-8000-000000000001';
    const p2='10000000-0000-4000-8000-000000000002';
    await db.query("insert into products(id,name,price,is_active) values($1,'First',10,true),($2,'Second',20,true)",[p1,p2]);
    for (const p of [p1,p2]) await db.query("select public.teorema_set_cart_item($1,$2,$3,1)",[firstId,cart,p]);
    await db.query("update products set price=15 where id=$1",[p1]);
    await db.query("update products set is_active=false where id=$1",[p2]);
    await assert.rejects(db.query("select public.teorema_prepare_cart($1,$2)",[firstId,cart]));
    const prices=await db.query<{unit_price:string}>("select unit_price from cart_items where cart_id=$1 order by product_id",[cart]);
    assert.deepEqual(prices.rows.map(r=>Number(r.unit_price)),[10,20]);
    assert.deepEqual((await db.query("select status,total_amount from carts where id=$1",[cart])).rows,[{status:'OPEN',total_amount:'30.00'}]);
    await db.query("update products set price=1000000 where id=$1",[p1]);
    await assert.rejects(db.query("select public.teorema_set_cart_item($1,$2,$3,1000)",[firstId,cart,p1]));
    assert.equal(Number((await db.query<{quantity:number}>("select quantity from cart_items where cart_id=$1 and product_id=$2",[cart,p1])).rows[0].quantity),1);
  } finally { await db.close(); }
});

test("unexpected cart foreign key aborts migration without changing existing data", async () => {
  const db = await setupCarts();
  try {
    await db.exec("alter table public.carts drop constraint carts_user_id_fkey");
    await assert.rejects(db.exec(cartsMigration),/Unexpected\/missing FK/);
    await db.exec("rollback");
    assert.equal((await db.query("select id from carts where status='LEGACY' and total_amount=-1")).rows.length,1);
  } finally { await db.close(); }
});

test("cart server operations validate ownership, price, state and quantities; clients read only own rows", async () => {
  const db = await setupCarts();
  try {
    await db.exec("set role service_role");
    const create = async (id: string) => (await db.query<{id:string}>("select public.teorema_get_or_create_cart($1) as id",[id])).rows[0].id;
    const firstCart = await create(firstId); const secondCart = await create(secondId);
    assert.equal(await create(firstId), firstCart);
    const product = (await db.query<{id:string}>("insert into products(name,description,price,is_active) values('PDF','Test',12.50,true) returning id")).rows[0].id;
    const setItem = (user: string, cart: string, quantity: number | null) => db.query<{amount:string}>(
      "select public.teorema_set_cart_item($1,$2,$3,$4) as amount",[user,cart,product,quantity]);
    await assert.rejects(setItem(secondId,firstCart,1));
    for (const n of [-1,1001,null]) await assert.rejects(setItem(firstId,firstCart,n));
    assert.equal(Number((await setItem(firstId,firstCart,2)).rows[0].amount),25);
    await setItem(secondId,secondCart,1);
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[firstId]);
    const visible = await db.query<{user_id:string}>("select user_id from carts");
    assert.ok(visible.rows.every(r => r.user_id===firstId));
    assert.equal((await db.query("select id from cart_items")).rows.length,1);
    // Even accidental future grants cannot override the restrictive policies.
    await db.exec("reset role; grant all on carts,cart_items to authenticated; set role authenticated");
    assert.equal((await db.query("update carts set status='COMPLETED' returning id")).rows.length,0);
    assert.equal((await db.query("update cart_items set unit_price=0.01 returning id")).rows.length,0);
    await assert.rejects(db.query("insert into cart_items(cart_id,product_id,quantity,unit_price) values($1,$2,1,0.01)",[firstCart,product]));
    await db.exec("reset role; set role service_role");
    await db.query("update products set price=15 where id=$1",[product]);
    assert.equal(Number((await db.query<{unit_price:string}>("select unit_price from cart_items where cart_id=$1",[firstCart])).rows[0].unit_price),12.5);
    await assert.rejects(db.query("select public.teorema_prepare_cart($1,$2)",[secondId,firstCart]));
    const prepared = await db.query<{amount:string}>("select public.teorema_prepare_cart($1,$2) as amount",[firstId,firstCart]);
    assert.equal(Number(prepared.rows[0].amount),30);
    assert.equal((await db.query<{status:string}>("select status from carts where id=$1",[firstCart])).rows[0].status,'SENT_TO_WHATSAPP');
    await assert.rejects(setItem(firstId,firstCart,1));
    await assert.rejects(db.query("select public.teorema_prepare_cart($1,$2)",[firstId,firstCart]));
    await db.query("update products set is_active=false where id=$1",[product]);
    await assert.rejects(setItem(secondId,secondCart,2));
    await assert.rejects(db.query("select public.teorema_prepare_cart($1,$2)",[secondId,secondCart]));
    assert.equal(Number((await setItem(secondId,secondCart,0)).rows[0].amount),0);
    await assert.rejects(db.query("select public.teorema_prepare_cart($1,$2)",[secondId,secondCart]));
    await assert.rejects(db.query("insert into carts(user_id,status) values($1,'FORGED')",[firstId]));
    await assert.rejects(db.query("insert into cart_items(cart_id,product_id,quantity,unit_price) values($1,$2,1,-1)",[secondCart,product]));
  } finally { await db.close(); }
});
