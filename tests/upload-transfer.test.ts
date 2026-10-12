import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transferUpload } from "../lib/upload-transfer";

class FakeRequest {
  static latest: FakeRequest;
  status = 200; responseText = ""; timeout = 0;
  method = ""; url = ""; body: Blob | null = null;
  headers: Record<string, string> = {};
  upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  onload?: () => void; onerror?: () => void; ontimeout?: () => void; onabort?: () => void;
  constructor() { FakeRequest.latest = this; }
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(key: string, value: string) { this.headers[key] = value; }
  send(body: Blob) { this.body = body; }
  abort() { this.onabort?.(); }
}

test("signed upload sends bytes directly, reports progress, and never enables overwrite", async t => {
  const previous = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = FakeRequest as unknown as typeof XMLHttpRequest;
  t.after(() => { globalThis.XMLHttpRequest = previous; });
  const bytes = new Blob(["%PDF-1.7 synthetic"]), progress: number[] = [];
  const url = "https://project.supabase.co/storage/v1/object/upload/sign/private/test?token=opaque-test";
  const done = transferUpload(bytes, url, "application/pdf", n => progress.push(n), new AbortController().signal);
  const request = FakeRequest.latest;
  assert.equal(request.method, "PUT"); assert.equal(request.url, url); assert.equal(request.body, bytes);
  assert.deepEqual(request.headers, { "Content-Type": "application/pdf", "Cache-Control": "max-age=0", "x-upsert": "false" });
  request.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 }); request.onload?.();
  await done; assert.deepEqual(progress, [50, 100]);
});

test("transfer failures are actionable and never expose Storage internals or signatures", async t => {
  const previous = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = FakeRequest as unknown as typeof XMLHttpRequest;
  t.after(() => { globalThis.XMLHttpRequest = previous; });
  for (const status of [400, 401, 403, 413, 500]) {
    const done = transferUpload(new Blob(["x"]), "https://example.test?token=SECRET", "application/pdf", () => {}, new AbortController().signal);
    const request = FakeRequest.latest; request.status = status; request.responseText = '{"error":"secret internal token"}'; request.onload?.();
    await assert.rejects(done, error => error instanceof Error && !/secret|token|internal|http/i.test(error.message));
  }
  for (const event of ["onerror", "ontimeout", "onabort"] as const) {
    const done = transferUpload(new Blob(["x"]), "https://example.test", "application/pdf", () => {}, new AbortController().signal);
    FakeRequest.latest[event]?.(); await assert.rejects(done);
  }
});

test("retry of already stored bytes can finish without overwriting, and unmount aborts", async t => {
  const previous = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = FakeRequest as unknown as typeof XMLHttpRequest;
  t.after(() => { globalThis.XMLHttpRequest = previous; });
  for (const status of [400, 409]) {
    const done = transferUpload(new Blob(["x"]), "https://example.test", "application/pdf", () => {}, new AbortController().signal);
    FakeRequest.latest.status = status; FakeRequest.latest.responseText = '{"error":"Duplicate"}'; FakeRequest.latest.onload?.(); await done;
  }
  const controller = new AbortController();
  const done = transferUpload(new Blob(["x"]), "https://example.test", "application/pdf", () => {}, controller.signal);
  controller.abort(); await assert.rejects(done, /cancelado/);
  await assert.rejects(transferUpload(new Blob(["x"]), "https://example.test", "application/pdf", () => {}, controller.signal), /cancelado/);
  assert.equal(FakeRequest.latest.body, null);
});

test("automatic upload finalization remains protected; temporary PDF errors do not reject the file", () => {
  const client = readFileSync(new URL("../app/admin/products-manager.tsx", import.meta.url), "utf8");
  assert.ok(client.indexOf("await transferUpload(") < client.indexOf("await finalize(detail.product.id, ticket.uploadId)"));
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY|tus\.Upload|createSignedUrl|getPublicUrl/);
  const server = readFileSync(new URL("../app/api/admin/products/[id]/uploads/[uploadId]/route.ts", import.meta.url), "utf8");
  assert.match(server, /await productAdmin\(\)/); assert.match(server, /await validatePdf\(bytes\)/);
  assert.ok(server.includes("!(error instanceof PdfValidationError)"));
  assert.ok(server.indexOf("new PdfProcessingError().message, 503") < server.lastIndexOf('db.rpc("teorema_reject_upload"'));
});
