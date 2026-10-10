import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream, degrees } from "pdf-lib";
import { generateLicenseCode } from "../lib/pdf-licenses/code";
import { PDF_LIMIT } from "../lib/uploads";
import { parseWatermarkConfig, DEFAULT_WATERMARK_CONFIG } from "../lib/pdf-watermark/config";
import { maskEmail, prepareWatermarkIdentity } from "../lib/pdf-watermark/identity";
import { getWatermarkPosition, getPageGeometry } from "../lib/pdf-watermark/layout";
import { embedWatermarkFont, assertFontSupports } from "../lib/pdf-watermark/font";
import { renderPersonalizedPdf } from "../lib/pdf-watermark/personalize";
import { PdfWatermarkError, type PdfPersonalizationInput } from "../lib/pdf-watermark/types";

const licenseCode = `LIC-${"4C9A10D8B721F209".repeat(2)}`;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const hasCode = (code: string) => (error: unknown) => error instanceof PdfWatermarkError && error.code === code;

async function original(sizes: [number, number][] = [[595.28, 841.89]]) {
  const document = await PDFDocument.create();
  for (const size of sizes) document.addPage(size);
  document.setAuthor("Teorema da Educação");
  return document.save();
}
function input(bytes: Uint8Array, name = "João da Silva"): PdfPersonalizationInput {
  return { original: bytes, customerName: name, customerEmail: "joao.silva@gmail.com", licenseCode,
    product: { name: "Práticas inclusivas - revisão" } };
}

// Inspect the actual saved PDF, its embedded ToUnicode mapping and each page's
// text operators. A mocked drawText call would not prove marks survived saving.
function watermarks(document: PDFDocument, pageIndex: number): string[] {
  const page = document.getPage(pageIndex);
  const fonts = page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
  const maps = new Map<string, Map<string, string>>();
  for (const [key, ref] of fonts.entries()) {
    const font = document.context.lookup(ref, PDFDict);
    if (!font.lookup(PDFName.of("BaseFont"), PDFName).decodeText().includes("NotoSans")) continue;
    const cmapStream = font.lookup(PDFName.of("ToUnicode"));
    assert.ok(cmapStream instanceof PDFRawStream);
    const cmap = decodePDFRawStream(cmapStream).decode();
    const mapping = new Map<string, string>();
    const text = Buffer.from(cmap).toString("ascii");
    for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const pair of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
        const bytes = Buffer.from(pair[2], "hex");
        let value = "";
        for (let i = 0; i < bytes.length; i += 2) value += String.fromCharCode(bytes.readUInt16BE(i));
        mapping.set(pair[1].toUpperCase().padStart(4, "0"), value);
      }
    }
    maps.set(key.decodeText(), mapping);
  }
  const contents = page.node.lookup(PDFName.of("Contents"));
  const streams = contents instanceof PDFArray
    ? contents.asArray().map(ref => document.context.lookup(ref)) : [contents];
  const result: string[] = [];
  for (const stream of streams) {
    assert.ok(stream instanceof PDFRawStream);
    const text = Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii");
    for (const section of text.matchAll(/\/([^\s]+) [\d.]+ Tf([\s\S]*?)ET/g)) {
      const mapping = maps.get(section[1]);
      if (!mapping) continue;
      for (const match of section[2].matchAll(/<([0-9a-f]+)> Tj/gi)) {
        result.push((match[1].match(/.{4}/g) ?? []).map(key => mapping.get(key.toUpperCase()) ?? "?").join(""));
      }
    }
  }
  return result;
}

test("email masking preserves only a bounded prefix, validates email and defaults to privacy", () => {
  assert.equal(maskEmail("joao.silva@gmail.com"), "jo***@gmail.com");
  assert.equal(maskEmail("a@example.com"), "***@example.com");
  assert.equal(maskEmail("ab@example.com"), "a***@example.com");
  for (const value of ["", "not-email", "a@b@c.com", "alice@example.com\nsecret"]) {
    assert.throws(() => maskEmail(value), hasCode("INVALID_INPUT"));
  }
});

test("server watermark flags have safe defaults and reject ambiguous truthy values", () => {
  assert.deepEqual(parseWatermarkConfig({}), DEFAULT_WATERMARK_CONFIG);
  assert.deepEqual(parseWatermarkConfig({ PDF_SHOW_CUSTOMER_NAME: "false", PDF_SHOW_CUSTOMER_EMAIL: "false",
    PDF_MASK_CUSTOMER_EMAIL: "true" }), { showCustomerName: false, showCustomerEmail: false, maskCustomerEmail: true });
  for (const value of ["", "0", "1", "TRUE", "false\n", "unexpected"]) {
    assert.throws(() => parseWatermarkConfig({ PDF_MASK_CUSTOMER_EMAIL: value }), hasCode("CONFIG_INVALID"));
  }
});

test("identity uses canonical normalized names and existing opaque license format", () => {
  const base = input(new Uint8Array());
  const identity = prepareWatermarkIdentity({ ...base, customerName: "  Joa\u0303o   da Silva  " }, DEFAULT_WATERMARK_CONFIG);
  assert.equal(identity.visibleText, `Licenciado para João da Silva • jo***@gmail.com • ${licenseCode}`);
  assert.equal(identity.diagonalText, `João da Silva • ${licenseCode}`);
  for (const change of [{ customerName: null }, { customerName: "<script>" }, { licenseCode: "LIC-123" },
    { customerEmail: null }, { customerEmail: "invalid" }, { product: { name: "Material\nsecret" } }]) {
    assert.throws(() => prepareWatermarkIdentity({ ...base, ...change }, DEFAULT_WATERMARK_CONFIG), hasCode("INVALID_INPUT"));
  }
});

test("marker positions are deterministic, license-dependent and cycle all four locations", () => {
  const sequence = Array.from({ length: 12 }, (_, index) => getWatermarkPosition(licenseCode, index));
  assert.deepEqual(sequence, Array.from({ length: 12 }, (_, index) => getWatermarkPosition(licenseCode, index)));
  assert.equal(new Set(sequence.slice(0, 4)).size, 4);
  assert.equal(sequence[0], sequence[4]);
  const starts = Array.from({ length: 50 }, () => getWatermarkPosition(generateLicenseCode(), 0));
  assert.ok(new Set(starts).size > 1);
  for (const index of [-1, 0.5, NaN, Infinity]) assert.throws(() => getWatermarkPosition(licenseCode, index), hasCode("INVALID_INPUT"));
});

test("saved PDF has three watermark layers on every page, preserves size and original bytes", async () => {
  const sizes: [number, number][] = [[595.28, 841.89], [841.89, 595.28], [400, 600]];
  const bytes = await original(sizes), before = hash(bytes);
  const output = await renderPersonalizedPdf(input(bytes));
  assert.ok(output instanceof Uint8Array);
  assert.equal(hash(bytes), before);
  const document = await PDFDocument.load(output);
  assert.equal(document.getPageCount(), sizes.length);
  for (const [index, size] of sizes.entries()) {
    assert.deepEqual(document.getPage(index).getSize(), { width: size[0], height: size[1] });
    assert.deepEqual(watermarks(document, index), [
      `Licenciado para João da Silva • jo***@gmail.com • ${licenseCode}`,
      `João da Silva • ${licenseCode}`, licenseCode,
    ]);
  }
  assert.equal(document.getTitle(), "Práticas inclusivas - revisão");
  assert.equal(document.getAuthor(), "Teorema da Educação");
  assert.equal(document.getSubject(), `Licensed copy: ${licenseCode}`);
  assert.equal(document.getKeywords(), `licensed ${licenseCode}`);
  assert.doesNotMatch(JSON.stringify([document.getTitle(), document.getSubject(), document.getKeywords(), document.getAuthor()]),
    /João|joao.silva|gmail|52998224725/);
});

test("embedded font preserves Portuguese accents and Unicode beyond WinAnsi", async () => {
  const bytes = await original();
  for (const name of ["João da Silva", "José Gonçalves", "André Luís", "Débora França", "Łukasz Željko", "Ольга Иванова"]) {
    const document = await PDFDocument.load(await renderPersonalizedPdf(input(bytes, name)));
    assert.ok(watermarks(document, 0).some(text => text === `${name} • ${licenseCode}`), name);
  }
});

test("rotation and offset CropBox keep marks inside visible page without changing source boxes", async () => {
  const source = await PDFDocument.create();
  for (const angle of [0, 90, 180, 270]) {
    const page = source.addPage([700, 900]);
    page.setCropBox(50, 80, 500, 700); page.setRotation(degrees(angle));
    assert.deepEqual(getPageGeometry(page).width, angle % 180 === 0 ? 500 : 700);
  }
  const document = await PDFDocument.load(await renderPersonalizedPdf(input(await source.save())));
  for (const [index, page] of document.getPages().entries()) {
    assert.deepEqual(page.getCropBox(), { x: 50, y: 80, width: 500, height: 700 });
    assert.equal(page.getRotation().angle, index * 90);
    assert.equal(watermarks(document, index).length, 3);
  }
});

test("long names wrap without removing characters or truncating license codes", async () => {
  const name = "José " + "Gonçalves ".repeat(14).trim();
  const document = await PDFDocument.load(await renderPersonalizedPdf(input(await original([[300, 400]]), name)));
  const texts = watermarks(document, 0);
  const visible = texts.slice(0, -2).join("");
  assert.equal(visible, `Licenciado para ${name} • jo***@gmail.com • ${licenseCode}`);
  assert.equal(texts.at(-1), licenseCode);
});

test("disabling identity fields removes them from all drawn text, but never removes license", async () => {
  const bytes = await original();
  const config = { showCustomerName: false, showCustomerEmail: false, maskCustomerEmail: true };
  const document = await PDFDocument.load(await renderPersonalizedPdf({ ...input(bytes), customerName: null, customerEmail: null }, config));
  const texts = watermarks(document, 0);
  assert.deepEqual(texts, [`Licenciado para ${licenseCode}`, licenseCode, licenseCode]);
  const unmasked = await renderPersonalizedPdf(input(bytes), { ...DEFAULT_WATERMARK_CONFIG, maskCustomerEmail: false });
  assert.ok(watermarks(await PDFDocument.load(unmasked), 0)[0].includes("joao.silva@gmail.com"));
});

test("parallel/repeated renders reuse provided license and never share customer data", async () => {
  const bytes = await original();
  const names = ["João da Silva", "Débora França", "José Gonçalves", "André Luís"];
  const outputs = await Promise.all(names.map(name => renderPersonalizedPdf(input(bytes, name))));
  for (const [index, output] of outputs.entries()) {
    const text = watermarks(await PDFDocument.load(output), 0).join(" ");
    assert.ok(text.includes(names[index])); assert.equal(text.split(licenseCode).length - 1, 3);
    for (const other of names.filter((_, j) => j !== index)) assert.ok(!text.includes(other));
  }
  assert.deepEqual(watermarks(await PDFDocument.load(outputs[0]), 0),
    watermarks(await PDFDocument.load(await renderPersonalizedPdf(input(bytes))), 0));
});

test("invalid, truncated, encrypted or active-content PDFs fail closed; errors are sanitized", async () => {
  const bytes = await original();
  for (const invalid of [new Uint8Array(), new TextEncoder().encode("%PDF-1.7 invalid secret %%EOF"),
    new TextEncoder().encode("<html>secret</html>"), bytes.subarray(0, bytes.length - 20)]) {
    await assert.rejects(renderPersonalizedPdf(input(invalid)), hasCode("PDF_INVALID"));
  }
  await assert.rejects(renderPersonalizedPdf(input(new Uint8Array(PDF_LIMIT + 1))), hasCode("PDF_TOO_LARGE"));
  const unsafe = await PDFDocument.create(); unsafe.addPage(); unsafe.addJavaScript("test", "app.alert('secret')");
  await assert.rejects(renderPersonalizedPdf(input(await unsafe.save())), hasCode("PDF_INVALID"));
  const encrypted = await PDFDocument.create(); encrypted.addPage();
  encrypted.context.trailerInfo.Encrypt = encrypted.context.register(encrypted.context.obj({ Filter: "Standard", V: 4 }));
  await assert.rejects(renderPersonalizedPdf(input(await encrypted.save())), hasCode("PDF_INVALID"));
  const tiny = await original([[20, 20]]);
  await assert.rejects(renderPersonalizedPdf(input(tiny)), hasCode("PAGE_UNSUPPORTED"));
  assert.doesNotMatch(new PdfWatermarkError("GENERATION_FAILED").message, /secret|stack|supabase|C:\\/);
});

test("unsupported glyphs and unavailable embedding fail explicitly, not by stripping accents", async () => {
  const document = await PDFDocument.create();
  const font = await embedWatermarkFont(document);
  assert.doesNotThrow(() => assertFontSupports(font, ["João • José • André • Débora"]));
  assert.throws(() => assertFontSupports(font, ["王小明"]), hasCode("UNSUPPORTED_CHARACTER"));
  const badDocument = await PDFDocument.create();
  const method = mock.method(badDocument, "embedFont", () => { throw new Error("private internal path"); });
  try { await assert.rejects(embedWatermarkFont(badDocument), hasCode("FONT_UNAVAILABLE")); }
  finally { method.mock.restore(); }
});

test("renderer remains isolated and server-only entry point exposes no original URL or credentials", () => {
  const source = readFileSync(new URL("../lib/pdf-watermark/service.ts", import.meta.url), "utf8");
  assert.match(source, /^import "server-only";/);
  assert.doesNotMatch(source, /getPublicUrl|createSignedUrl|SUPABASE|NEXT_PUBLIC|console\.|@ts-ignore/);
  const engine = readFileSync(new URL("../lib/pdf-watermark/personalize.ts", import.meta.url), "utf8");
  assert.doesNotMatch(engine, /fetch\(|writeFile|Math.random|generateLicenseCode|userId|paymentStatus/);
  const asset = readFileSync(new URL("../assets/pdf/NotoSans-Regular.ttf", import.meta.url));
  assert.equal(hash(asset), "b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5");
});
