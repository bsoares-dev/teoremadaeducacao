import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { cartDatabase } from "../scripts/fixtures/cart-database.mjs";
import { generateLicenseCode } from "../lib/pdf-licenses/code";
import { downloadContextSchema, PdfDownloadError, type DownloadContext } from "../lib/pdf-download/types";
import { parseDownloadLimit } from "../lib/pdf-download/limits";
import { trackedDownload } from "../lib/pdf-download/tracked";
import { licenseList, licenseHistory, pendingLicenseDecision, parseLicenseDecision, licenseFilters } from "../lib/admin-pdf-contract";

test("PDF limit configuration is explicit, bounded and fails closed", () => {
  assert.equal(parseDownloadLimit(undefined), 0); assert.equal(parseDownloadLimit("0"), 0); assert.equal(parseDownloadLimit("3"), 3);
  for (const bad of ["-1", " 3 ", "false", "1.5", "Infinity", "01", "1000001"]) assert.throws(() => parseDownloadLimit(bad), PdfDownloadError);
});
test("tracked generation never exposes bytes before durable authorization; failure/unknown commit releases no response", async () => {
  const context = {} as DownloadContext, result = { bytes: new Uint8Array([1]), filename: "material.pdf", version: 1 }, steps: string[] = [];
  const dependencies = { begin: async () => { steps.push("begin"); return context; }, prepare: async () => { steps.push("prepare"); return result; },
    finish: async (_context: DownloadContext, error?: PdfDownloadError) => { steps.push(error ? "failure" : "success"); } };
  assert.equal(await trackedDownload(dependencies), result); assert.deepEqual(steps, ["begin", "prepare", "success"]);
  for (const failure of [new PdfDownloadError("LICENSE_REVOKED"), new Error("Sensitive Storage diagnostic")]) {
    steps.length = 0;
    await assert.rejects(trackedDownload({ ...dependencies, prepare: async () => { throw failure; } }), PdfDownloadError);
    assert.deepEqual(steps, ["begin", "failure"]);
  }
  await assert.rejects(trackedDownload({ ...dependencies, finish: async () => { throw new PdfDownloadError("DOWNLOAD_FAILED"); } }), PdfDownloadError);
  await assert.rejects(trackedDownload({ ...dependencies, prepare: async () => { throw new Error("internal"); }, finish: async () => { throw new Error("DB offline"); } }), PdfDownloadError);
});
test("admin contracts reject forged identity, malformed recovery and invalid filters", () => {
  const operation = { licenseId: randomUUID(), decision: { state: "revoked", reason: "Revisão sintética", operationId: randomUUID(), expectedUpdatedAt: new Date().toISOString() } };
  assert.deepEqual(parseLicenseDecision(JSON.stringify(operation)), operation); assert.equal(parseLicenseDecision(null), null);
  assert.throws(() => parseLicenseDecision("{broken")); assert.throws(() => parseLicenseDecision("a".repeat(5001)));
  assert.equal(pendingLicenseDecision.safeParse({ ...operation, actorId: randomUUID() }).success, false);
  assert.equal(pendingLicenseDecision.safeParse({ ...operation, decision: { ...operation.decision, userId: randomUUID() } }).success, false);
  assert.throws(() => licenseFilters(new URL("https://example.test/?status=PAID")));
  assert.throws(() => licenseFilters(new URL("https://example.test/?page=100001")));
  assert.equal(licenseFilters(new URL("https://example.test/?email=Alice%40example.test")).email, "alice@example.test");
});

test("PDF ledger SQL: atomic quota, lifetime count, expiration, owner isolation and audited admin recovery", async t => {
  const { db, users, ids, service } = await cartDatabase();
  const admin = users[0].id, alice = users[1].id, bob = users[2].id;
  type Outcome = { ok: boolean; error_code?: string | null; context?: DownloadContext };
  const reserve = (owner = alice, product = ids[0], limit = 0, attempt = randomUUID()) => service(async tx => ({ attempt,
    ...((await tx.query<{ value: Outcome }>("select teorema_begin_pdf_download($1,$2,$3,$4,$5) value", [owner, product, attempt, generateLicenseCode(), limit])).rows[0].value) }));
  const finish = (attempt: string, name: string | null = "José Gonçalves", failure: string | null = null, owner = alice) => service(async tx =>
    (await tx.query<{ value: Outcome }>("select teorema_finish_pdf_download($1,$2,$3,$4) value", [owner, attempt, name, failure])).rows[0].value);
  const list = (actor = admin, page = 1) => service(async tx => licenseList.parse({
    ...(await tx.query<{ value: object }>("select teorema_admin_pdf_licenses($1,$2,null,null,null) value", [actor, page])).rows[0].value, maxDownloads: 0 }));
  const decide = (id: string, state: string, expected: string, operation = randomUUID(), actor = admin) => service(tx => tx.query(
    "select teorema_set_pdf_license_state($1,$2,$3,'Revisão administrativa sintética',$4,$5)", [actor, id, state, operation, expected]));
  let licenseId = "";
  try {
    await t.test("denied and missing products commit safe events but no reservation/license", async () => {
      assert.equal((await reserve()).error_code, "ACCESS_DENIED"); assert.equal((await reserve(alice, randomUUID())).error_code, "PDF_NOT_FOUND");
      assert.equal((await db.query<{ n: number }>("select count(*)::int n from pdf_download_logs")).rows[0].n, 0);
      assert.equal((await db.query<{ n: number }>("select count(*)::int n from pdf_license_events where event='PDF_DOWNLOAD_DENIED'")).rows[0].n, 2);
    });
    await service(async tx => {
      const cart = (await tx.query<{ value: { cart: { id: string } } }>("select teorema_sync_cart($1,$2,null,0,$3,'{}') value", [alice, randomUUID(), [ids[0]]])).rows[0].value.cart;
      const order = (await tx.query<{ value: string }>("select teorema_create_order($1,$2,$3,39.9,$4) value", [alice, cart.id, randomUUID(), JSON.stringify({ [ids[0]]: 39.9 })])).rows[0].value;
      await tx.query("select teorema_confirm_order($1,$2)", [admin, order]);
      await tx.query("select teorema_update_profile_name($1,'José Gonçalves')", [alice]);
    });
    await t.test("simultaneous requests reserve only quota slots and reuse one license", async () => {
      const requests = await Promise.all(Array.from({ length: 12 }, () => reserve(alice, ids[0], 2)));
      const allowed = requests.filter(r => r.ok), denied = requests.filter(r => !r.ok);
      assert.equal(allowed.length, 2); assert.ok(denied.every(r => r.error_code === "DOWNLOAD_LIMIT_REACHED"));
      const context = downloadContextSchema.parse(allowed[0].context); licenseId = context.license.id;
      assert.equal(downloadContextSchema.parse(allowed[1].context).license.id, licenseId);
      assert.equal((await reserve(alice, ids[0], 0, allowed[0].attempt)).error_code, "DOWNLOAD_FAILED", "No duplicate attempt replay");
      assert.equal((await finish(allowed[0].attempt)).ok, true); assert.equal((await finish(allowed[0].attempt)).ok, true, "Completion is idempotent");
      assert.equal((await finish(allowed[1].attempt, "José Gonçalves", "DOWNLOAD_FAILED")).error_code, "DOWNLOAD_FAILED");
      const retry = await reserve(alice, ids[0], 2); assert.equal(retry.ok, true); assert.equal((await finish(retry.attempt)).ok, true);
      assert.equal((await reserve(alice, ids[0], 2)).error_code, "DOWNLOAD_LIMIT_REACHED");
      const row = (await list()).items[0]; assert.equal(row.downloads, 2); assert.ok(row.lastDownload); assert.equal(row.code, context.license.license_code);
      assert.equal((await db.query<{ n: number }>("select count(*)::int n from pdf_license_events where event='LICENSE_CREATED'")).rows[0].n, 1);
    });
    await t.test("zero is unlimited; foreign attempts cannot finish; generation updates do not count", async () => {
      const first = await reserve(); assert.equal(first.ok, true);
      assert.equal((await finish(first.attempt, "José Gonçalves", null, bob)).error_code, "ACCESS_DENIED");
      assert.equal((await finish(first.attempt, "André Luís")).error_code, "MATERIAL_UPDATED");
      const second = await reserve(); assert.equal((await finish(second.attempt)).ok, true);
      assert.equal((await list()).items[0].downloads, 3);
    });
    await t.test("revocation during generation blocks delivery; restore keeps code/count; stale and old retries cannot reapply", async () => {
      const inFlight = await reserve(), before = (await list()).items[0], operation = randomUUID();
      await decide(licenseId, "revoked", before.updatedAt, operation);
      assert.equal((await finish(inFlight.attempt)).error_code, "LICENSE_REVOKED");
      assert.equal((await reserve()).error_code, "LICENSE_REVOKED");
      const revoked = (await list()).items[0]; assert.equal(revoked.status, "revoked"); assert.equal(revoked.downloads, 3);
      await assert.rejects(decide(licenseId, "active", before.updatedAt), { code: "40001" });
      await assert.rejects(decide(licenseId, "active", revoked.updatedAt, randomUUID(), bob), { code: "42501" });
      await decide(licenseId, "active", revoked.updatedAt);
      await decide(licenseId, "revoked", before.updatedAt, operation); // Old recovered revocation must not revoke twice.
      const restored = (await list()).items[0]; assert.equal(restored.status, "active"); assert.equal(restored.code, before.code); assert.equal(restored.downloads, 3);
      await assert.rejects(decide(licenseId, "active", before.updatedAt, operation), { code: "23514" });
      assert.equal((await reserve(alice, ids[0], 3)).error_code, "DOWNLOAD_LIMIT_REACHED", "Reactivation does not reset lifetime counter");
      const history = await service(async tx => licenseHistory.parse((await tx.query<{ value: unknown }>("select teorema_admin_pdf_history($1,$2,1) value", [admin, licenseId])).rows[0].value));
      assert.ok(history.items.some(e => e.event === "LICENSE_REVOKED" && e.actor_email === users[0].email));
      assert.ok(history.items.some(e => e.event === "PDF_DOWNLOAD_DENIED" && e.error_code === "LICENSE_REVOKED"));
      assert.equal((await list(admin, 2)).items.length, 0);
    });
    await t.test("expired reservation releases quota but cannot complete late", async () => {
      const old = await reserve(alice, ids[0], 4);
      // Isolated fixture clock travel only. Production records are immutable.
      await db.exec("alter table pdf_download_logs disable trigger pdf_log_guard");
      await db.query("update pdf_download_logs set started_at=clock_timestamp()-interval '180 seconds',expires_at=clock_timestamp()-interval '30 seconds' where id=$1", [old.attempt]);
      await db.exec("alter table pdf_download_logs enable trigger pdf_log_guard");
      const replacement = await reserve(alice, ids[0], 4); assert.equal(replacement.ok, true);
      assert.equal((await finish(old.attempt)).error_code, "ATTEMPT_EXPIRED"); assert.equal((await finish(replacement.attempt)).ok, true);
      assert.equal((await list()).items[0].downloads, 4);
    });
    await t.test("inactive access prevents license reactivation and administrative impersonation", async () => {
      const row = (await list()).items[0]; await decide(licenseId, "revoked", row.updatedAt);
      const grant = (await db.query<{ id: string }>("select id from access_grants where user_id=$1 and product_id=$2", [alice, ids[0]])).rows[0].id;
      await service(tx => tx.query("select teorema_set_access_state($1,$2,'REVOGADO','Revisão sintética do acesso',$3)", [admin, grant, randomUUID()]));
      await assert.rejects(decide(licenseId, "active", (await list()).items[0].updatedAt), { code: "42501" });
      await assert.rejects(list(bob), { code: "42501" });
    });
    await t.test("RLS/grants block third-party logs, critical columns, writes and all client RPCs", async () => {
      const functions = ["teorema_begin_pdf_download", "teorema_finish_pdf_download", "teorema_set_pdf_license_state", "teorema_admin_pdf_licenses", "teorema_admin_pdf_history"];
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query("select * from pdf_download_logs"), /permission denied/);
        await assert.rejects(db.query("select teorema_admin_pdf_licenses($1,1,null,null,null)", [admin]), /permission denied/);
        await db.exec("reset role");
      }
      for (const owner of [alice, bob]) {
        await db.exec("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
        const rows = await db.query<{ user_id: string }>("select id,user_id from pdf_download_logs");
        assert.ok(rows.rows.every(r => r.user_id === owner)); if (owner === bob) assert.equal(rows.rows.length, 0);
        await assert.rejects(db.query("insert into pdf_license_events(user_id,event) values($1,'PDF_DOWNLOAD_DENIED')", [owner]), /permission denied/);
        await db.exec("reset role");
      }
      const privileges = await db.query<{ name: string; service: boolean; anon: boolean; authenticated: boolean; prosecdef: boolean; proconfig: string[] }>("select proname name,has_function_privilege('service_role',oid,'execute') service,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') authenticated,prosecdef,proconfig from pg_proc where proname=any($1)", [functions]);
      assert.equal(privileges.rows.length, 5); assert.ok(privileges.rows.every(f => f.service && !f.anon && !f.authenticated && !f.prosecdef && f.proconfig.includes('search_path=""')));
      const terminal = (await db.query<{ id: string }>("select id from pdf_download_logs where success limit 1")).rows[0].id;
      await assert.rejects(service(tx => tx.query("update pdf_download_logs set success=false,state='FAILED',error_code='DOWNLOAD_FAILED' where id=$1", [terminal])), { code: "23514" });
      await assert.rejects(service(tx => tx.query("delete from pdf_license_events")), /permission denied/);
    });
  } finally { await db.close(); }
});
test("new admin endpoints authorize server-side, preserve gates and never accept actor from JSON", () => {
  for (const path of ["../app/api/admin/pdf-licenses/route.ts", "../app/api/admin/pdf-licenses/[id]/route.ts"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8"); assert.match(source, /await commerceAdmin\(\)/); assert.match(source, /privateJson/);
  }
  const repo = readFileSync(new URL("../lib/pdf-licenses/admin-repository.ts", import.meta.url), "utf8");
  assert.match(repo, /^import "server-only"/); assert.doesNotMatch(repo, /console\.|NEXT_PUBLIC.*KEY|@ts-ignore/);
  const directory = new URL("../supabase/migrations/", import.meta.url), migration = readdirSync(directory).find(name => name.endsWith("_teorema_pdf_download_controls.sql"));
  assert.ok(migration);
  const sql = readFileSync(new URL(migration, directory), "utf8");
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('commerce:'/); assert.match(sql, /p_max_downloads>0 and used>=p_max_downloads/);
});
