import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { cartDatabase } from "../scripts/fixtures/cart-database.mjs";
import { generateLicenseCode } from "../lib/pdf-licenses/code";
import { downloadContextSchema, PdfDownloadError, downloadDbError, type DownloadContext } from "../lib/pdf-download/types";
import { preparePersonalizedDownload, type DownloadDependencies } from "../lib/pdf-download/prepare";
import { personalizedPdfResponse } from "../lib/pdf-download/response";
import { readPersonalizedResponse } from "../lib/library-contract";
import { renderPersonalizedPdf } from "../lib/pdf-watermark/personalize";

const errorCode = (code: string) => (error: unknown) => error instanceof PdfDownloadError && error.code === code;
function context(bytes: Uint8Array): DownloadContext {
  const product = randomUUID(), file = randomUUID(), now = new Date().toISOString();
  return {
    file: { file_id: file, bucket_id: "teorema-pdfs", object_key: `products/${product}/${file}.pdf`, version: 1, version_label: "1.0", size_bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") },
    license: { id: randomUUID(), user_id: randomUUID(), product_id: product, order_id: randomUUID(), order_item_id: randomUUID(), license_code: generateLicenseCode(), status: "active", created_at: now, updated_at: now, revoked_at: null },
    full_name: "José Gonçalves", product_name: "Práticas inclusivas",
  };
}

test("personalized download returns PDF bytes only, rechecks exact license and keeps original unchanged", async () => {
  const doc = await PDFDocument.create(); doc.addPage([595, 842]); doc.addPage([842, 595]);
  const original = await doc.save(), initialHash = createHash("sha256").update(original).digest("hex"), record = context(original);
  const checks: (string | undefined)[] = [];
  const dependencies: DownloadDependencies = { context: async license => { checks.push(license); return record; }, original: async () => original, personalize: renderPersonalizedPdf, showCustomerName: true };
  const download = await preparePersonalizedDownload("jose@example.test", new AbortController().signal, dependencies);
  assert.deepEqual(checks, [undefined, record.license.id]);
  assert.notEqual(createHash("sha256").update(download.bytes).digest("hex"), initialHash);
  assert.equal(createHash("sha256").update(original).digest("hex"), initialHash);
  const loaded = await PDFDocument.load(download.bytes);
  assert.equal(loaded.getPageCount(), 2); assert.equal(loaded.getSubject(), `Licensed copy: ${record.license.license_code}`);
  assert.deepEqual(Object.keys(download).sort(), ["bytes", "filename", "version"]);
  const response = personalizedPdfResponse(download);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.equal(response.headers.has("content-length"), false, "Body is streamed, not buffered by the route");
  const received = await readPersonalizedResponse(response);
  assert.equal(received.filename, "Praticas-inclusivas.pdf");
  assert.deepEqual(new Uint8Array(await received.blob.arrayBuffer()), download.bytes);
});

test("download fails closed for revocation/updates during generation, corrupt original, missing name, storage and generation errors", async () => {
  const bytes = new Uint8Array([1, 2, 3]), record = context(bytes), signal = new AbortController().signal;
  const defaults: DownloadDependencies = { context: async () => record, original: async () => bytes, personalize: async () => new Uint8Array([4, 5]), showCustomerName: true };
  await assert.rejects(preparePersonalizedDownload("user@example.test", signal, { ...defaults, context: async () => ({ ...record, full_name: null }) }), errorCode("CUSTOMER_NAME_REQUIRED"));
  await preparePersonalizedDownload("user@example.test", signal, { ...defaults, showCustomerName: false, context: async () => ({ ...record, full_name: null }) });
  await assert.rejects(preparePersonalizedDownload("user@example.test", signal, { ...defaults, original: async () => new Uint8Array([1, 2, 4]) }), errorCode("DOWNLOAD_FAILED"));
  for (const changes of [
    { license: { ...record.license, status: "revoked" as const, revoked_at: new Date().toISOString() } },
    { file: { ...record.file, file_id: randomUUID() } },
    { full_name: "André Luís" },
  ]) {
    await assert.rejects(preparePersonalizedDownload("user@example.test", signal, { ...defaults, context: async id => id ? { ...record, ...changes } : record }), errorCode("license" in changes ? "LICENSE_REVOKED" : "MATERIAL_UPDATED"));
  }
  for (const failing of ["original", "personalize"] as const) {
    await assert.rejects(preparePersonalizedDownload("user@example.test", signal, { ...defaults, [failing]: async () => { throw new Error("Storage token or internal diagnostics"); } }), errorCode("DOWNLOAD_FAILED"));
  }
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(preparePersonalizedDownload(null, aborted.signal, defaults), errorCode("DOWNLOAD_FAILED"));
  assert.throws(() => downloadDbError({ code: "42501", message: "PDF license revoked" }), errorCode("LICENSE_REVOKED"));
  assert.throws(() => downloadDbError({ code: "P0002", message: "Internal object path" }), errorCode("PDF_NOT_FOUND"));
  assert.throws(() => downloadDbError({ code: "08006", message: "secret diagnostic" }), errorCode("DOWNLOAD_FAILED"));
});

test("browser contract rejects original URL tickets, unsafe headers and empty PDF; streaming supports bodies over 4.5 MB", async () => {
  await assert.rejects(readPersonalizedResponse(Response.json({ url: "https://example.test/original.pdf" })), /inválida/);
  await assert.rejects(readPersonalizedResponse(new Response(new Uint8Array([1]), { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="../private.pdf"' } })), /inválida/);
  await assert.rejects(readPersonalizedResponse(personalizedPdfResponse({ bytes: new Uint8Array(), filename: "material.pdf", version: 1 })), /vazio/);
  const bytes = new Uint8Array(5 * 1024 * 1024).fill(65);
  const result = await readPersonalizedResponse(personalizedPdfResponse({ bytes, filename: "material.pdf", version: 2 }));
  assert.equal(result.blob.size, bytes.length);
});

test("protected PDF paths never sign originals; credentials/generation remain server-only and commercial gates remain", () => {
  for (const path of ["../lib/pdf-download/repository.ts", "../lib/pdf-download/service.ts"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /^import "server-only";/); assert.doesNotMatch(source, /getPublicUrl|createSignedUrl|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY|console\.|@ts-ignore/);
  }
  const client = readFileSync(new URL("../app/meus-materiais/library.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(client, /validateDownloadUrl|supabaseAdmin|pdf-download\/service|ticket\.url/);
  const auth = readFileSync(new URL("../lib/library.ts", import.meta.url), "utf8");
  assert.match(auth, /cartPreviewEnabled\(process.env\)/); assert.match(auth, /getAuth\(\)/);
  const route = readFileSync(new URL("../app/api/library/download/route.ts", import.meta.url), "utf8");
  assert.match(route, /consumeRequest\(db, user.id, "PDF_DOWNLOAD"\)/);
  assert.match(route, /personalizedPdfResponse/);
});

test("download context SQL: confirmed purchase, stable concurrent license, revoked/foreign origins, current private file and RPC privileges", async t => {
  const { db, users, ids, service } = await cartDatabase();
  const alice = users[1].id, bob = users[2].id, admin = users[0].id;
  const prepare = (owner: string, product: string, license: string | null = null) => service(async tx => downloadContextSchema.parse((await tx.query<{ value: unknown }>("select teorema_prepare_pdf_download($1,$2,$3,$4) as value", [owner, product, generateLicenseCode(), license])).rows[0].value));
  const order = () => service(async tx => {
    const cart = (await tx.query<{ value: { cart: { id: string } } }>("select teorema_sync_cart($1,$2,null,0,$3,'{}') as value", [alice, randomUUID(), [ids[0]]])).rows[0].value.cart;
    return (await tx.query<{ value: string }>("select teorema_create_order($1,$2,$3,39.9,$4) as value", [alice, cart.id, randomUUID(), JSON.stringify({ [ids[0]]: 39.9 })])).rows[0].value;
  });
  try {
    const purchased = await order();
    await assert.rejects(prepare(alice, ids[0]), { code: "42501" });
    await assert.rejects(prepare(alice, randomUUID()), { code: "P0002" });
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from pdf_licenses")).rows[0].n, 0);
    await service(tx => tx.query("select teorema_confirm_order($1,$2)", [admin, purchased]));
    await service(tx => tx.query("select teorema_update_profile_name($1,'José Gonçalves')", [alice]));
    const requests = await Promise.all(Array.from({ length: 8 }, () => prepare(alice, ids[0]))), first = requests[0];
    assert.ok(requests.every(result => result.license.id === first.license.id && result.license.license_code === first.license.license_code));
    assert.equal(first.full_name, "José Gonçalves"); assert.equal(first.license.order_id, purchased);
    assert.equal((await prepare(alice, ids[0], first.license.id)).license.id, first.license.id);
    await assert.rejects(prepare(bob, ids[0], first.license.id), { code: "42501" });
    await t.test("private/missing original fails without any alternate public path", async () => {
      await db.query("update storage.buckets set public=true where id='teorema-pdfs'");
      await assert.rejects(prepare(alice, ids[0]), { code: "23514" });
      await db.query("update storage.buckets set public=false where id='teorema-pdfs'");
      await db.query("delete from storage.objects where name=$1", [first.file.object_key]);
      await assert.rejects(prepare(alice, ids[0]), { code: "23514" });
      await db.query("insert into storage.objects(bucket_id,name) values('teorema-pdfs',$1)", [first.file.object_key]);
    });
    await service(tx => tx.query("update pdf_licenses set status='revoked' where id=$1", [first.license.id]));
    await assert.rejects(prepare(alice, ids[0]), /PDF license revoked/);
    await assert.rejects(prepare(alice, ids[0], first.license.id), /PDF license revoked/);
    const grant = (await db.query<{ id: string }>("select id from access_grants where order_item_id=$1", [first.license.order_item_id])).rows[0].id;
    await service(tx => tx.query("select teorema_set_access_state($1,$2,'REVOGADO','Synthetic revocation',$3)", [admin, grant, randomUUID()]));
    const otherPurchase = await order(); await service(tx => tx.query("select teorema_confirm_order($1,$2)", [admin, otherPurchase]));
    const other = await prepare(alice, ids[0]);
    assert.equal(other.license.order_id, otherPurchase); assert.notEqual(other.license.id, first.license.id);
    await assert.rejects(prepare(alice, ids[0], first.license.id), { code: "42501" });
    await service(tx => tx.query("update products set is_active=false,publication_status='UNPUBLISHED' where id=$1", [ids[0]]));
    assert.equal((await prepare(alice, ids[0])).license.id, other.license.id, "Unpublish is not revocation");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select teorema_prepare_pdf_download($1,$2,$3,null)", [alice, ids[0], generateLicenseCode()]), /permission denied/);
      await db.exec("reset role");
    }
    const fn = (await db.query<{ prosecdef: boolean; proconfig: string[] }>("select prosecdef,proconfig from pg_proc where proname='teorema_prepare_pdf_download'")).rows[0];
    assert.equal(fn.prosecdef, false); assert.ok(fn.proconfig.includes('search_path=""'));
  } finally { await db.close(); }
});
