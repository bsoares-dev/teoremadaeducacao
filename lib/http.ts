import { NextResponse } from "next/server";

export function privateJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function readJson(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    throw new Error("Origem não permitida.");
  }
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") throw new Error("Formato inválido.");
  // Bound the actual streamed body, not just the optional Content-Length header.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Corpo vazio.");
  let length = 0;
  let body = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 10000) { await reader.cancel(); throw new Error("Requisição muito grande."); }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}
