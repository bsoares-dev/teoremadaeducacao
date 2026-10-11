import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { cartDatabase } from "../scripts/fixtures/cart-database.mjs";

for (const legacyAuthTrigger of [false, true]) {
  test(`controlled admin profile enrollment preserves student validation and UUID authorization (${legacyAuthTrigger ? "existing" : "fresh"} Auth trigger)`, async () => {
    const { db, users, service } = await cartDatabase({ legacyAuthTrigger });
    const email = "invited-admin@example.test", id = randomUUID();
    const marker = { teorema_profile_origin: "controlled_admin_invitation" };
    // Real createUser order: initial Auth/profile INSERT, then trusted metadata UPDATE, then COMMIT.
    const insert = (uid: string, address: string, userData: object = {}, appData: object = {}) =>
      db.transaction(async tx => {
        await tx.query("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,'{}')",
          [uid, address, JSON.stringify(userData)]);
        await tx.query("update auth.users set raw_app_meta_data=$2 where id=$1", [uid, JSON.stringify(appData)]);
      });
    try {
      await db.query("insert into teorema_private.admin_profile_invitations(user_id,authorized_email) values($1,$2)", [id, email]);
      await assert.rejects(insert(randomUUID(), "student@example.test"), /Invalid CPF/);
      await assert.rejects(insert(randomUUID(), email, marker), /Invalid CPF/, "Email and editable metadata cannot enroll a student");
      await assert.rejects(insert(id, email, marker), /Controlled invitation required/, "Even the reserved UUID requires trusted Auth metadata at COMMIT");
      await assert.rejects(insert(id, "wrong@example.test", {}, marker), /Invalid CPF/);
      await assert.rejects(insert(randomUUID(), email, {}, marker), /Invalid CPF/, "Trusted marker alone is not an exception");
      await assert.rejects(insert(id, email, { cpf: "11111111111" }, marker), /Invalid CPF/);
      await assert.rejects(insert(id, email, { phone: "123" }, marker), /Invalid phone/);
      await assert.rejects(insert(id, email, { cpf: "invalid" }, marker), /Invalid CPF/);
      assert.equal((await db.query<{ used: boolean }>("select provisioned_at is not null as used from teorema_private.admin_profile_invitations where user_id=$1", [id])).rows[0].used, false, "Failed creation rolls enrollment back");

      const attempts = await Promise.allSettled([insert(id, email, {}, marker), insert(id, email, {}, marker)]);
      assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
      assert.deepEqual((await db.query("select cpf,phone from profiles where id=$1", [id])).rows, [{ cpf: null, phone: null }]);
      assert.equal((await db.query<{ used: boolean }>("select provisioned_at is not null as used from teorema_private.admin_profile_invitations where user_id=$1", [id])).rows[0].used, true);
      assert.equal((await db.query("select user_id from teorema_private.commerce_admins where user_id=$1", [id])).rows.length, 0, "Profile exception never grants admin");
      await db.query("insert into teorema_private.commerce_admins(user_id) values($1)", [id]);
      await assert.rejects(service(tx => tx.query("select public.teorema_admin_check($1)", [id])), /Confirmed account required/);
      await db.query("update auth.users set email_confirmed_at=now() where id=$1", [id]);
      assert.equal((await service(tx => tx.query<{ allowed: boolean }>("select public.teorema_admin_check($1) as allowed", [id]))).rows[0].allowed, true);
      assert.equal((await service(tx => tx.query<{ allowed: boolean }>("select public.teorema_admin_check($1) as allowed", [users[0].id]))).rows[0].allowed, true);
      await service(tx => tx.query("update profiles set phone=null,cpf=null where id=$1", [id]));
      await assert.rejects(service(tx => tx.query("update profiles set cpf='11111111111' where id=$1", [id])), /Invalid CPF/);
      await assert.rejects(service(tx => tx.query("update profiles set phone=null where id=$1", [users[1].id])), /Invalid phone/);
      await assert.rejects(insert(randomUUID(), email, {}, marker), /Invalid CPF/, "Reservation cannot be reused by a different UUID");

      const expired = randomUUID();
      await db.query("insert into teorema_private.admin_profile_invitations(user_id,authorized_email,created_at,expires_at) values($1,'expired@example.test',now()-interval '2 hours',now()-interval '1 hour')", [expired]);
      await assert.rejects(insert(expired, "expired@example.test", {}, marker), /Invalid CPF/);
      for (const role of ["anon", "authenticated", "service_role"]) {
        await assert.rejects(db.transaction(async tx => {
          await tx.exec(`set local role ${role}`);
          await tx.query("select teorema_private.verify_admin_profile_origin()");
        }), /permission denied/);
        await assert.rejects(db.transaction(async tx => {
          await tx.exec(`set local role ${role}`);
          await tx.query("insert into teorema_private.admin_profile_invitations(user_id,authorized_email) values($1,'forged@example.test')", [randomUUID()]);
        }), /permission denied/);
        await assert.rejects(db.transaction(async tx => {
          await tx.exec(`set local role ${role}`);
          await tx.query("update teorema_private.admin_profile_invitations set provisioned_at=now() where user_id=$1", [expired]);
        }), /permission denied/);
        if (role !== "service_role") {
          await assert.rejects(db.transaction(async tx => {
            await tx.exec(`set local role ${role}`);
            await tx.query("select * from teorema_private.admin_profile_invitations");
          }), /permission denied/);
        }
      }
      await assert.rejects(db.transaction(async tx => {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
        await tx.query("update profiles set cpf=null where id=$1", [id]);
      }), /permission denied/);
      const audit = await db.query<{ issues: number }>(await readFile("supabase/admin-profile-verify.sql", "utf8"));
      assert.ok(audit.rows.every(row => Number(row.issues) === 0), "Aggregate audit recognizes only controlled exceptions");
    } finally { await db.close(); }
  });
}
