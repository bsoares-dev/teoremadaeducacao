import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Transaction } from "@electric-sql/pglite";
import { downloadInput, pdfFilename, libraryPage } from "../lib/library-contract";
// Shared fixture runs the full migration set on an isolated PostgreSQL engine.
import { cartDatabase } from "../scripts/fixtures/cart-database.mjs";

test("download contract rejects forged identities/paths, unsafe URLs and unsafe filenames", () => {
  const product = randomUUID();
  assert.deepEqual(downloadInput.parse({ productId: product }), { productId: product });
  for (const input of [{ productId: product, userId: randomUUID() }, { productId: product, path: "other.pdf" }, { productId: "../etc" }]) assert.equal(downloadInput.safeParse(input).success, false);
  assert.equal(pdfFilename('Ação / leitura\r\n<script>.pdf'), "Acao-leitura-script-pdf.pdf");
  assert.equal(pdfFilename("🚫"), "material-teorema.pdf");
  assert.equal(pdfFilename(`joao@example.test ${randomUUID()}`), "material-teorema.pdf");
});

test("library is scoped, unique per product, follows current version and keeps other valid purchase origins", async () => {
  const { db, users, ids, service } = await cartDatabase();
  const read = (owner: string, page = 1) => service(async (tx: Transaction) => libraryPage.parse((await tx.query<{value: unknown}>("select teorema_read_library($1,$2) as value", [owner, page])).rows[0].value));
  const order = async (owner: string, products: string[]) => service(async (tx: Transaction) => {
    const cart = (await tx.query<{ value: { cart: { id: string } } }>("select teorema_sync_cart($1,$2,null,0,$3,'{}') as value", [owner, randomUUID(), products])).rows[0].value.cart;
    return (await tx.query<{ value: string }>("select teorema_create_order($1,$2,$3,$4,$5) as value", [owner, cart.id, randomUUID(), products.length * 39.9, JSON.stringify(Object.fromEntries(products.map(id => [id, 39.9])))])).rows[0].value;
  });
  try {
    assert.equal((await read(users[1].id)).total, 0);
    const pending = await order(users[1].id, [ids[0], ids[1]]);
    const state = await read(users[1].id); assert.equal(state.total, 2); assert.ok(state.items.every(i => i.state === "PENDENTE" && !i.available && !i.version));
    assert.equal((await read(users[2].id)).total, 0);
    await service(tx => tx.query("select teorema_confirm_order($1,$2)", [users[0].id, pending]));
    assert.ok((await read(users[1].id)).items.every(i => i.state === "ATIVO" && i.version === 1 && i.available));
    const newFile = randomUUID(), newKey = `products/${ids[0]}/${newFile}.pdf`;
    await service(async tx => {
      await tx.query("update product_files set is_current=false where product_id=$1", [ids[0]]);
      await tx.query("insert into product_files(id,product_id,version,version_label,object_key,size_bytes,mime_type,sha256,validation_status,validated_at,is_current,uploaded_by) values($1,$2,2,'2.0',$3,100,'application/pdf',$4,'VALIDATED',now(),true,$5)", [newFile, ids[0], newKey, "b".repeat(64), users[0].id]);
      await tx.query("insert into storage.objects(bucket_id,name) values('teorema-pdfs',$1)", [newKey]);
    });
    assert.equal((await read(users[1].id)).items.find(i => i.productId === ids[0])?.version, 2);
    assert.equal((await service(tx => tx.query<{ value: { file_id: string } }>("select teorema_resolve_pdf($1,$2) as value", [users[1].id, ids[0]]))).rows[0].value.file_id, newFile);
    await db.query("delete from storage.objects where name=$1", [newKey]);
    assert.equal((await read(users[1].id)).items.find(i => i.productId === ids[0])?.available, false);
    await assert.rejects(service(tx => tx.query("select teorema_resolve_pdf($1,$2)", [users[1].id, ids[0]])), /unavailable/);
    await db.query("insert into storage.objects(bucket_id,name) values('teorema-pdfs',$1)", [newKey]);
    await service(tx => tx.query("update products set is_active=false,publication_status='UNPUBLISHED' where id=$1", [ids[0]]));
    assert.equal((await read(users[1].id)).items.find(i => i.productId === ids[0])?.available, true);
    const grant = (await db.query<{ id: string }>("select id from access_grants where user_id=$1 and product_id=$2", [users[1].id, ids[0]])).rows[0].id;
    await service(tx => tx.query("select teorema_set_access_state($1,$2,'REVOGADO','Motivo de teste',$3)", [users[0].id, grant, randomUUID()]));
    assert.equal((await read(users[1].id)).items.find(i => i.productId === ids[0])?.state, "REVOGADO");
    await service(tx => tx.query("update products set is_active=true,publication_status='PUBLISHED' where id=$1", [ids[0]]));
    const next = await order(users[1].id, [ids[0]]);
    assert.equal((await read(users[1].id)).items.find(i => i.productId === ids[0])?.state, "PENDENTE");
    await service(tx => tx.query("select teorema_confirm_order($1,$2)", [users[0].id, next]));
    assert.equal((await read(users[1].id)).items.find(i => i.productId === ids[0])?.state, "ATIVO");
    assert.equal((await read(users[1].id)).total, 2);
    await service(tx => tx.query("select teorema_set_access_state($1,$2,'REVOGADO','Mesmo acesso antigo',$3)", [users[0].id, grant, randomUUID()]));
    assert.equal((await read(users[1].id)).items.find(i => i.productId === ids[0])?.state, "ATIVO");
    const canceled = await order(users[1].id, [ids[2]]);
    await service(tx => tx.query("select teorema_cancel_order($1,$2,'Cancelamento sintético')", [users[0].id, canceled]));
    assert.equal((await read(users[1].id, 2)).items.length, 0);
    await assert.rejects(read(users[1].id, 0), /Invalid library page/);
    assert.equal((await read(users[1].id)).total, 2, "Canceled-only material is not in the library");
    await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [users[1].id]);
    await assert.rejects(read(users[1].id), { code: "42501" });
    await db.query("update auth.users set banned_until=null,email_confirmed_at=null where id=$1", [users[1].id]);
    await assert.rejects(read(users[1].id), { code: "42501" });
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [users[1].id]);
    const raw = JSON.stringify((await service(tx => tx.query<{ value: unknown }>("select teorema_read_library($1,1) as value", [users[1].id]))).rows[0].value);
    assert.doesNotMatch(raw, /object_key|bucket_id|sha256|granted_by|reason|email|cpf|token/);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select teorema_read_library($1,1)", [users[1].id]), /permission denied/);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select teorema_read_library($1,1)", [users[1].id]), /permission denied/);
  } finally { await db.close(); }
});

test("library pagination returns at most 20 unique materials and preserves the full total", async () => {
  const { db, users, ids, service } = await cartDatabase();
  try {
    const products = [...ids];
    for (let i = 0; i < 18; i++) {
      const id = randomUUID(), file = randomUUID(), key = `products/${id}/${file}.pdf`; products.push(id);
      await service(async tx => {
        await tx.query("insert into products(id,name,description,price,image_url,is_active,publication_status) values($1,$2,'Material sintético para testar paginação.',39.9,'',false,'DRAFT')", [id, `Material paginado ${i}`]);
        await tx.query("insert into product_files(id,product_id,version,version_label,object_key,size_bytes,mime_type,sha256,validation_status,validated_at,is_current,uploaded_by) values($1,$2,1,'1.0',$3,100,'application/pdf',$4,'VALIDATED',now(),true,$5)", [file, id, key, "a".repeat(64), users[0].id]);
        await tx.query("insert into storage.objects(bucket_id,name) values('teorema-pdfs',$1)", [key]);
        await tx.query("update products set is_active=true,publication_status='PUBLISHED' where id=$1", [id]);
      });
    }
    await service(async tx => {
      const cart = (await tx.query<{ value: { cart: { id: string } } }>("select teorema_sync_cart($1,$2,null,0,$3,'{}') as value", [users[1].id, randomUUID(), products])).rows[0].value.cart;
      await tx.query("select teorema_create_order($1,$2,$3,$4,$5)", [users[1].id, cart.id, randomUUID(), 837.9, JSON.stringify(Object.fromEntries(products.map(id => [id, 39.9])))]);
    });
    const read = (page: number) => service(async tx => libraryPage.parse((await tx.query<{ value: unknown }>("select teorema_read_library($1,$2) as value", [users[1].id, page])).rows[0].value));
    const first = await read(1), second = await read(2);
    assert.equal(first.total, 21); assert.equal(second.total, 21);
    assert.equal(first.items.length, 20); assert.equal(second.items.length, 1);
    assert.equal(new Set([...first.items, ...second.items].map(i => i.productId)).size, 21);
  } finally { await db.close(); }
});
