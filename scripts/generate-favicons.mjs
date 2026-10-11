// Static assets only: no runtime font lookup, network call, or new dependency.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = await readFile(new URL("../assets/brand/favicon-te.svg", import.meta.url));
const render = size => sharp(source, { density: 384 }).resize(size, size).png().toBuffer();

for (const [filename, size] of [["icon.png", 192], ["apple-icon.png", 180]]) {
  const path = new URL(`../app/${filename}`, import.meta.url);
  await writeFile(path, await render(size));
  console.log(`${fileURLToPath(path)}: ${size}x${size}`);
}

// ICO directory plus PNG frames, supported by modern browsers. The largest
// frame also provides a crisp square icon above Google's recommended minimum.
const sizes = [16, 32, 48, 96, 192, 256];
const frames = await Promise.all(sizes.map(render));
const directory = Buffer.alloc(6 + frames.length * 16);
directory.writeUInt16LE(1, 2); // ICO, not cursor.
directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index] === 256 ? 0 : sizes[index];
  directory[entry + 1] = directory[entry];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(new URL("../app/favicon.ico", import.meta.url), Buffer.concat([directory, ...frames]));
console.log(`app/favicon.ico: ${sizes.join(", ")} px`);
