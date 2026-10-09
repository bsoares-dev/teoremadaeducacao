import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullNameSchema, profileNameUpdateSchema } from "../lib/profile-name-schema";
import { signupSchema } from "../lib/schemas";
import { cartDatabase } from "../scripts/fixtures/cart-database.mjs";
import type { Transaction } from "@electric-sql/pglite";

test("student name composes Unicode without stripping accents or changing spelling", () => {
  for (const name of ["João da Silva", "José Gonçalves", "André Luís", "Débora França", "Jean-Luc D’Ávila"]) {
    assert.equal(fullNameSchema.parse(`  ${name}  `), name);
  }
  assert.equal(fullNameSchema.parse("Jose\u0301   Gonc\u0327alves"), "José Gonçalves");
  for (const name of ["", " ", "A", "12345", "João 123", "<script>alert()</script>", "João\nSilva", "\tJoão Silva", "João\u202eSilva", "A".repeat(151)]) {
    assert.equal(fullNameSchema.safeParse(name).success, false, JSON.stringify(name));
  }
});

test("signup requires name; profile edits accept only name, not owner/permissions/identifiers", () => {
  const signup = { email: "student@example.test", password: "example123", cpf: "52998224725", phone: "48999999999" };
  assert.equal(signupSchema.safeParse(signup).success, false);
  assert.equal(signupSchema.parse({ ...signup, fullName: "João da Silva" }).fullName, "João da Silva");
  assert.deepEqual(profileNameUpdateSchema.parse({ fullName: " Débora  França " }), { fullName: "Débora França" });
  for (const extra of [{ userId: randomUUID() }, { id: randomUUID() }, { email: "admin@example.test" }, { cpf: "52998224725" }, { phone: "48999999999" }, { role: "admin" }, { full_name: "Other name" }]) {
    assert.equal(profileNameUpdateSchema.safeParse({ fullName: "João da Silva", ...extra }).success, false);
  }
});

for (const legacyAuthTrigger of [false, true]) {
  test(`student name migration preserves data and ownership (${legacyAuthTrigger ? "existing Supabase trigger" : "fresh-project trigger"})`, async t => {
    const { db, users, service } = await cartDatabase({ legacyAuthTrigger });
    const alice = users[1].id, bob = users[2].id;
    const save = (id: string, name: string | null) => service((tx: Transaction) => tx.query<{ value: { fullName: string } }>(
      "select teorema_update_profile_name($1,$2) as value", [id, name]));
    try {
      await t.test("old accounts remain unnamed; names round-trip with accents without modifying other data", async () => {
        const before = (await db.query("select id,email,cpf,phone,created_at from profiles order by id")).rows;
        assert.equal((await db.query<{ n: number }>("select count(*)::int n from profiles where full_name is null")).rows[0].n, 3);
        for (const name of ["João da Silva", "José Gonçalves", "André Luís", "Débora França"]) {
          assert.equal((await save(alice, `  ${name}  `)).rows[0].value.fullName, name);
        }
        assert.equal((await save(alice, "Jose\u0301   Gonc\u0327alves")).rows[0].value.fullName, "José Gonçalves");
        assert.deepEqual((await db.query("select id,email,cpf,phone,created_at from profiles order by id")).rows, before);
        assert.equal((await db.query<{ full_name: string | null }>("select full_name from profiles where id=$1", [bob])).rows[0].full_name, null);
        for (const invalid of [null, "", "A", "A".repeat(151), "12345", "<script>", "João\nSilva"]) {
          await assert.rejects(save(alice, invalid), invalid === null ? { code: "22023" } : { code: "23514" });
        }
      });
      await t.test("existing Auth trigger atomically creates named profiles; legacy signup stays compatible", async () => {
        const id = randomUUID();
        await db.query("insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,'named@example.test',$2,now())", [id, JSON.stringify({ full_name: "  Débora   França ", cpf: "52998224725", phone: "48999999999" })]);
        assert.equal((await db.query<{ full_name: string | null }>("select full_name from profiles where id=$1", [id])).rows[0].full_name, "Débora França");
        const legacyId = randomUUID();
        await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'legacy@example.test',$2)", [legacyId, JSON.stringify({ cpf: "11144477735", phone: "48999999999" })]);
        assert.equal((await db.query<{ full_name: string | null }>("select full_name from profiles where id=$1", [legacyId])).rows[0].full_name, null);
        await assert.rejects(save(legacyId, "Nome não confirmado"), { code: "42501" });
        const badId = randomUUID();
        await assert.rejects(db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'bad@example.test',$2)", [badId, JSON.stringify({ full_name: "123", cpf: "52998224725", phone: "48999999999" })]), { code: "23514" });
        assert.equal((await db.query<{ n: number }>("select count(*)::int n from auth.users where id=$1", [badId])).rows[0].n, 0);
        assert.equal((await db.query<{ n: number }>("select count(*)::int n from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal")).rows[0].n, 1);
      });
      await t.test("RLS allows only own name reads; clients cannot write name or call privileged RPC", async () => {
        await db.transaction(async tx => {
          await tx.exec("set local role authenticated");
          await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [alice]);
          const rows = (await tx.query<{ id: string; full_name: string }>("select id,full_name from profiles")).rows;
          assert.deepEqual(rows, [{ id: alice, full_name: "José Gonçalves" }]);
        });
        const client = (role: "anon" | "authenticated", query: string, args: string[]) => db.transaction(async tx => {
          await tx.exec(`set local role ${role}`);
          await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [alice]);
          return tx.query(query, args);
        });
        await assert.rejects(client("anon", "select full_name from profiles", []), { code: "42501" });
        for (const role of ["anon", "authenticated"] as const) {
          await assert.rejects(client(role, "update profiles set full_name='Foreign name' where id=$1", [bob]), { code: "42501" });
          await assert.rejects(client(role, "select teorema_update_profile_name($1,'Foreign name')", [bob]), { code: "42501" });
        }
        await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [bob]);
        await assert.rejects(save(bob, "Blocked Account"), { code: "42501" });
        await db.query("update auth.users set banned_until=null,is_anonymous=true where id=$1", [bob]);
        await assert.rejects(save(bob, "Anonymous Account"), { code: "42501" });
        await assert.rejects(db.query("select teorema_update_profile_name($1,'Untrusted caller')", [alice]), { code: "42501" });
      });
    } finally { await db.close(); }
  });
}
