// Read-only HTTP smoke: page metadata -> public icon -> exact committed bytes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const base = new URL(process.argv[2] || "http://127.0.0.1:3100");
assert.ok(["http:", "https:"].includes(base.protocol));
const request = url => fetch(url, { signal: AbortSignal.timeout(20000) });
const response = await request(base);
assert.equal(response.status, 200, "The home page must be publicly reachable");
const html = await response.text();
const links = [...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) => ({
  rel: tag.match(/\brel="([^"]+)"/)?.[1],
  href: tag.match(/\bhref="([^"]+)"/)?.[1],
  sizes: tag.match(/\bsizes="([^"]+)"/)?.[1],
}));
const expected = [
  { filename: "favicon.ico", rel: "icon", sizes: "256x256" },
  { filename: "icon.png", rel: "icon", sizes: "192x192" },
  { filename: "apple-icon.png", rel: "apple-touch-icon", sizes: "180x180" },
];
for (const { filename, rel, sizes } of expected) {
  const link = links.find(item => item.rel === rel && item.href && new URL(item.href, base).pathname === `/${filename}`);
  assert.ok(link, `Missing link for ${filename}`);
  assert.equal(link.sizes, sizes);
  const url = new URL(link.href, base);
  assert.equal(url.origin, base.origin, "No external icon dependency");
  const icon = await request(url);
  assert.equal(icon.status, 200, filename);
  assert.match(icon.headers.get("content-type") || "", /^image\//);
  assert.doesNotMatch(icon.headers.get("cache-control") || "", /private|no-store/);
  assert.doesNotMatch(icon.headers.get("x-robots-tag") || "", /noindex/i);
  const actual = Buffer.from(await icon.arrayBuffer());
  const committed = await readFile(new URL(`../app/${filename}`, import.meta.url));
  const digest = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest(actual), digest(committed), `Published ${filename} must match the reviewed asset`);
  console.log(`PASS ${filename}: HTTP 200, ${sizes}, metadata and bytes match`);
}
