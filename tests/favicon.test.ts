import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const source = new URL("../assets/brand/favicon-te.svg", import.meta.url);

test("static Next.js PNG icons are square and match the brand source", async () => {
  for (const [filename, size] of [["icon.png", 192], ["apple-icon.png", 180]] as const) {
    const bytes = await readFile(new URL(`../app/${filename}`, import.meta.url));
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    const expected = await sharp(await readFile(source), { density: 384 }).resize(size, size).png().toBuffer();
    assert.deepEqual(bytes, expected, "Regenerate the committed icons after changing the vector source");
  }
});

test("favicon ICO contains valid frames for tabs and Google, with no truncated entries", async () => {
  const bytes = await readFile(new URL("../app/favicon.ico", import.meta.url));
  const sizes = [16, 32, 48, 96, 192, 256];
  assert.equal(bytes.readUInt16LE(0), 0);
  assert.equal(bytes.readUInt16LE(2), 1);
  assert.equal(bytes.readUInt16LE(4), sizes.length);
  let nextOffset = 6 + sizes.length * 16;
  for (let index = 0; index < sizes.length; index++) {
    const entry = 6 + index * 16;
    const size = bytes[entry] || 256;
    assert.equal(size, sizes[index]);
    assert.equal(bytes[entry + 1] || 256, size);
    assert.equal(bytes.readUInt16LE(entry + 4), 1);
    assert.equal(bytes.readUInt16LE(entry + 6), 32);
    const length = bytes.readUInt32LE(entry + 8);
    const offset = bytes.readUInt32LE(entry + 12);
    assert.equal(offset, nextOffset);
    assert.ok(length > 0 && offset + length <= bytes.length);
    const metadata = await sharp(bytes.subarray(offset, offset + length)).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    nextOffset += length;
  }
  assert.equal(nextOffset, bytes.length);
});
