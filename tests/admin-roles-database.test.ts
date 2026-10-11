import { test } from "node:test";
import assert from "node:assert/strict";
import { cartDatabase } from "../scripts/fixtures/cart-database.mjs";

test("multiple administrators use private UUID grants, confirmation and revocation; clients cannot self-promote", async () => {
  const { db, users, service } = await cartDatabase();
  const [original, second, student] = users.map(user => user.id);
  const check = (id: string) => service(tx => tx.query<{ allowed: boolean }>("select public.teorema_admin_check($1) as allowed", [id]));
  try {
    assert.equal((await check(original)).rows[0].allowed, true);
    await assert.rejects(check(second), /Administrator required/);
    await db.query("update auth.users set email_confirmed_at=null where id=$1", [second]);
    await db.query("insert into teorema_private.commerce_admins(user_id) values($1)", [second]);
    await assert.rejects(check(second), /Confirmed account required/);
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [second]);
    assert.equal((await check(second)).rows[0].allowed, true);
    assert.equal((await check(original)).rows[0].allowed, true, "Original administrator remains authorized");
    await assert.rejects(check(student), /Administrator required/);
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(db.transaction(async tx => {
        await tx.exec(`set local role ${role}`);
        await tx.query("select * from teorema_private.commerce_admins");
      }), /permission denied/);
      await assert.rejects(db.transaction(async tx => {
        await tx.exec(`set local role ${role}`);
        await tx.query("insert into teorema_private.commerce_admins(user_id) values($1)", [student]);
      }), /permission denied/);
      await assert.rejects(db.transaction(async tx => {
        await tx.exec(`set local role ${role}`);
        await tx.query("select public.teorema_admin_check($1)", [second]);
      }), /permission denied/);
    }
    await db.query("update teorema_private.commerce_admins set is_active=false where user_id=$1", [second]);
    await assert.rejects(check(second), /Administrator required/);
    await db.query("update teorema_private.commerce_admins set is_active=true where user_id=$1", [second]);
    assert.equal((await check(second)).rows[0].allowed, true);
    await db.query("update auth.users set is_anonymous=true where id=$1", [second]);
    await assert.rejects(check(second), /Confirmed account required/);
  } finally { await db.close(); }
});
