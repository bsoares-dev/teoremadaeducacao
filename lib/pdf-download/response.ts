import type { PersonalizedDownload } from "./types";

export function personalizedPdfResponse(download: PersonalizedDownload): Response {
  let bytes: Uint8Array | null = download.bytes, offset = 0;
  // Pull one bounded chunk at a time. Streaming avoids Vercel's buffered body
  // limit without returning an original Storage URL or persisting a copy.
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!bytes || offset >= bytes.byteLength) { bytes = null; controller.close(); return; }
      const end = Math.min(offset + 64 * 1024, bytes.byteLength);
      controller.enqueue(bytes.subarray(offset, end)); offset = end;
    },
    cancel() { bytes = null; },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${download.filename}"`,
    "Cache-Control": "private, no-store",
    "Vercel-CDN-Cache-Control": "no-store", "CDN-Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
    "X-Material-Version": String(download.version),
  } });
}
