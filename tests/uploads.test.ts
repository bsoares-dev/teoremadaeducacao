import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { PDFDocument, PDFName, PDFString, PDFDict } from "pdf-lib";
import sharp from "sharp";
import { uploadSchema, readBounded, PDF_LIMIT, stagingKey, finalKey } from "../lib/uploads";
import { validatePdf, validateCover } from "../lib/file-validation";

test("upload schema checks actual supported metadata and bounded paths", () => {
  const id = randomUUID();
  const valid = { id, kind: "PDF", name: "a.pdf", size: 1024, mime: "application/pdf", versionLabel: "v1" };
  assert.equal(uploadSchema.safeParse(valid).success, true);
  for (const change of [{ name: "a.exe" }, { name: "../a.pdf" }, { size: PDF_LIMIT + 1 }, { mime: "text/html" }, { size: 0 }, { extra: true }]) {
    assert.equal(uploadSchema.safeParse({ ...valid, ...change }).success, false);
  }
  assert.equal(finalKey({ id, product_id: id, kind: "PDF" }), `products/${id}/${id}.pdf`);
  assert.equal(stagingKey({ id, product_id: id }), `incoming/${id}/${id}`);
});

test("stream reader bounds actual bytes even without Content-Length", async () => {
  assert.equal((await readBounded(new Response(new Uint8Array([1, 2])), 2)).length, 2);
  await assert.rejects(readBounded(new Response(new Uint8Array(3)), 2), /limite/);
  await assert.rejects(readBounded(new Response(new Uint8Array(3), { headers: { "Content-Length": "999" } }), 2), /limite/);
});

test("PDF validator accepts static PDF and rejects disguised/truncated bytes", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage();
  const bytes = await pdf.save();
  assert.equal((await validatePdf(bytes)).pages, 1);
  await assert.rejects(validatePdf(new TextEncoder().encode("%PDF-1.7 this is not a document %%EOF")));
  await assert.rejects(validatePdf(bytes.subarray(0, bytes.length - 20)));
  await assert.rejects(validatePdf(new TextEncoder().encode("<html>not PDF</html>")));
});

test("PDF worker preserves typed bytes when bundler metadata is present", { timeout: 15000 }, async t => {
  const pdf = await PDFDocument.create(); pdf.addPage();
  const bytes = await pdf.save();
  const worker = new Worker(new URL("../lib/pdf-validation-worker.cjs", import.meta.url), {
    workerData: { bytes, __turbopack_globals__: {} },
  });
  t.after(async () => { await worker.terminate(); });
  const result = await new Promise<unknown>((resolve, reject) => {
    worker.once("message", resolve); worker.once("error", reject);
  });
  assert.deepEqual(result, { result: { pages: 1 } });
});

test("PDF validator rejects compressed JavaScript, attachments and escaped action names", async () => {
  const js = await PDFDocument.create(); js.addPage(); js.addJavaScript("unsafe", "app.alert('test')");
  await assert.rejects(validatePdf(await js.save()), /não permitido|inválido/);
  const attached = await PDFDocument.create(); attached.addPage(); await attached.attach(new Uint8Array([1]), "payload.txt");
  await assert.rejects(validatePdf(await attached.save()), /não permitido|inválido/);
  const action = await PDFDocument.create(); action.addPage();
  action.catalog.set(PDFName.of("OpenAction"), action.context.obj({ S: "JavaScript", JS: PDFString.of("unsafe") }) as PDFDict);
  const raw = Buffer.from(await action.save({ useObjectStreams: false })).toString("latin1").replace("/OpenAction", "/Open#41ction");
  await assert.rejects(validatePdf(Buffer.from(raw, "latin1")), /não permitido|inválido/);
});

test("cover validation decodes and re-encodes WebP and rejects HTML/MIME mismatch", async () => {
  const png = await sharp({ create: { width: 40, height: 50, channels: 3, background: "#0f2840" } }).png().toBuffer();
  const cover = await validateCover(png, "image/png");
  assert.equal((await sharp(cover).metadata()).format, "webp");
  await assert.rejects(validateCover(png, "image/jpeg"));
  await assert.rejects(validateCover(new TextEncoder().encode("<svg></svg>"), "image/png"));
});
