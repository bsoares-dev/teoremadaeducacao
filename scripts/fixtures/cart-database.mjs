import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export async function cartDatabase({ legacyAuthTrigger = false } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,created_at timestamptz default now(),
      email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create table storage.buckets(id text primary key,name text,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant all on storage.objects,storage.buckets to service_role;`);
  if (legacyAuthTrigger) await db.exec(`
    create function public.handle_new_user() returns trigger language plpgsql security definer as $$
    begin
      insert into public.profiles(id,email,cpf,phone)
      values(new.id,new.email,new.raw_user_meta_data->>'cpf',new.raw_user_meta_data->>'phone');
      return new;
    end; $$;
    create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();`);
  const names = (await readdir("supabase/migrations")).filter(name => name.endsWith(".sql")).sort();
  for (const name of names.slice(0, 3)) await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
  const users = [
    { id: randomUUID(), email: "bernardozsoares11@gmail.com" },
    { id: randomUUID(), email: "alice@example.test" },
    { id: randomUUID(), email: "bob@example.test" },
  ];
  for (let i = 0; i < users.length; i++) {
    let cpf = `90000000${i + 1}`;
    for (let length = 9; length <= 10; length++) {
      const total = [...cpf].reduce((sum, digit, index) => sum + Number(digit) * (length + 1 - index), 0);
      cpf += String(((total * 10) % 11) % 10);
    }
    await db.query("insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())", [users[i].id, users[i].email, JSON.stringify({ cpf, phone: "48999999999" })]);
  }
  for (const name of names.slice(3)) await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
  await db.exec("insert into storage.buckets(id,name,public) values('teorema-pdfs','teorema-pdfs',false)");
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const service = callback => db.transaction(async tx => { await tx.exec("set local role service_role"); return callback(tx); });
  for (let i = 0; i < ids.length; i++) {
    await service(async tx => {
      await tx.query("insert into products(id,name,description,price,image_url,is_active,publication_status) values($1,$2,'Material sintético para testar o carrinho.',39.90,'',false,'DRAFT')", [ids[i], `Material de estudo ${i + 1}`]);
      const file = randomUUID(), key = `products/${ids[i]}/${file}.pdf`;
      await tx.query("insert into product_files(id,product_id,version,version_label,object_key,size_bytes,mime_type,sha256,validation_status,validated_at,is_current,uploaded_by) values($1,$2,1,'1.0',$3,100,'application/pdf',$4,'VALIDATED',now(),true,$5)", [file, ids[i], key, "a".repeat(64), users[0].id]);
      await tx.query("insert into storage.objects(bucket_id,name) values('teorema-pdfs',$1)", [key]);
      await tx.query("update products set is_active=true,publication_status='PUBLISHED' where id=$1", [ids[i]]);
    });
  }
  return { db, users, ids, service };
}
