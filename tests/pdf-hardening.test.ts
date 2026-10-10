import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { assertSupportedPdfEncryption } from "../lib/pdf-download/encryption";
import { PdfDownloadError, downloadStorageError } from "../lib/pdf-download/types";
import { pdfFilename, downloadInput } from "../lib/library-contract";
import { verifiedPdfSessionClaims, PdfSessionError } from "../lib/pdf-download/session-contract";
import { cartDatabase } from "../scripts/fixtures/cart-database.mjs";

test("unsupported encryption cannot silently return an unencrypted or original PDF", () => {
  assertSupportedPdfEncryption(undefined); assertSupportedPdfEncryption("false");
  for (const value of ["true", "TRUE", "0", "1", "", " false "]) {
    assert.throws(() => assertSupportedPdfEncryption(value), error => error instanceof PdfDownloadError &&
      error.status === 500 && error.code === "DOWNLOAD_FAILED" && !/qpdf|secret|stack/i.test(error.message));
  }
  const source = readFileSync(new URL("../lib/pdf-download/service.ts", import.meta.url), "utf8");
  assert.match(source, /assertSupportedPdfEncryption\(process.env.PDF_ENCRYPTION_ENABLED\)/);
  assert.ok(source.indexOf("assertSupportedPdfEncryption(process.env") > source.indexOf("prepare: context =>"), "Configuration failures use the existing tracked attempt");
});

test("Storage missing file is 404; outages and malformed diagnostics fail safely", () => {
  for (const statusCode of [404, "404"]) {
    const error = downloadStorageError({ statusCode, message: "private path, token, internal detail" });
    assert.equal(error.status, 404); assert.equal(error.code, "PDF_NOT_FOUND");
    assert.doesNotMatch(error.message, /path|token|internal/);
  }
  for (const cause of [null, undefined, new Error("secret"), { statusCode: 503 }, { statusCode: "404 token" }]) {
    assert.equal(downloadStorageError(cause).code, "DOWNLOAD_FAILED");
  }
  const source = readFileSync(new URL("../lib/pdf-download/repository.ts", import.meta.url), "utf8");
  assert.match(source, /throw downloadStorageError\(info.error\)/);
  assert.match(source, /throw downloadStorageError\(result.error\)/);
});

test("PDF filenames remain bounded attachment-safe and omit emails, UUIDs and paths", () => {
  assert.equal(pdfFilename("Débora França: práticas inclusivas"), "Debora-Franca-praticas-inclusivas.pdf");
  assert.equal(pdfFilename(""), "material-teorema.pdf");
  for (const input of ["../../arquivo", '"\r\nX-Injected: true', "Material jose@example.test " + randomUUID(), "a".repeat(500), "漢字😀"]) {
    const result = pdfFilename(input);
    assert.match(result, /^[a-zA-Z0-9-]{1,100}\.pdf$/);
    assert.doesNotMatch(result, /example|@|\.\.|\r|\n/);
  }
});

test("PDF requests cannot supply identity, license, payment approval or original URLs", () => {
  const valid = { productId: randomUUID() };
  assert.deepEqual(downloadInput.parse(valid), valid);
  for (const extra of [{ userId: randomUUID() }, { customerName: "Foreign owner" }, { customerEmail: "x@example.test" },
    { licenseCode: "LIC-" + "A".repeat(32) }, { paymentStatus: "CONFIRMADO" }, { originalUrl: "https://example.test/a.pdf" }]) {
    assert.equal(downloadInput.safeParse({ ...valid, ...extra }).success, false);
  }
  const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
  assert.match(auth, /supabase.auth.getUser\(\)/); assert.doesNotMatch(auth, /getSession\(\)/);
  const admin = readFileSync(new URL("../lib/supabaseAdmin.ts", import.meta.url), "utf8");
  assert.match(admin, /^import "server-only";/);
  assert.doesNotMatch(admin, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});

test("verified session claims bind owner, session UUID and token expiry without trusting cookie user metadata", () => {
  const user = randomUUID(), session = randomUUID(), now = Date.now();
  const claims = { sub: user, session_id: session, exp: Math.floor(now / 1000) + 600, user_metadata: { role: "admin" } };
  assert.deepEqual(verifiedPdfSessionClaims(claims, user, now), { userId: user, sessionId: session, expiresAt: claims.exp * 1000 });
  for (const invalid of [null, {}, { ...claims, sub: randomUUID() }, { ...claims, session_id: "invalid" }, { ...claims, exp: Math.floor(now / 1000) }]) {
    assert.throws(() => verifiedPdfSessionClaims(invalid, user, now), PdfSessionError);
  }
  assert.throws(() => verifiedPdfSessionClaims({ ...claims, session_id: undefined }, user, now), PdfSessionError);
  const server = readFileSync(new URL("../lib/pdf-download/session.ts", import.meta.url), "utf8");
  assert.match(server, /^import "server-only";/); assert.match(server, /auth.auth.getClaims\(\)/);
  assert.doesNotMatch(server, /getSession|JSON.parse|Buffer.from|console\./);
});

test("PDF session bridge is service-only, owner-bound, read-only and denies terminated/expired sessions", async () => {
  const { db, users, service } = await cartDatabase();
  const alice = users[1].id, bob = users[2].id, session = randomUUID();
  const active = (owner: string, id = session) => service(async tx => (await tx.query<{ value: boolean }>("select teorema_pdf_session_active($1,$2) value", [owner, id])).rows[0].value);
  try {
    assert.equal(await active(alice), false);
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [session, alice]);
    assert.equal(await active(alice), true); assert.equal(await active(bob), false);
    assert.equal(await active(alice, randomUUID()), false);
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [session]);
    assert.equal(await active(alice), false);
    await db.query("delete from auth.sessions where id=$1", [session]); assert.equal(await active(alice), false);
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      assert.equal((await db.query<{ allowed: boolean }>("select has_table_privilege($1,'auth.sessions','select') allowed", [role])).rows[0].allowed, false);
      if (role !== "service_role") {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query("select teorema_pdf_session_active($1,$2)", [alice, session]), /permission denied/);
        await db.exec("reset role");
      }
    }
    const fn = (await db.query<{ prosecdef: boolean; proconfig: string[] }>("select prosecdef,proconfig from pg_proc where proname='teorema_pdf_session_active'")).rows[0];
    assert.equal(fn.prosecdef, true); assert.ok(fn.proconfig.includes('search_path=""'));
    const source = readFileSync(new URL("../lib/pdf-download/service.ts", import.meta.url), "utf8");
    assert.ok(source.indexOf("await sessionCheck()") < source.lastIndexOf("await completeDownload(db"));
  } finally { await db.close(); }
});
