/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS worker, traced into the server bundle. */
/* A separate bounded worker prevents malformed PDFs from blocking the web process.
 * This is a conservative structural policy, not an antivirus or a DRM guarantee. */
const { parentPort, workerData } = require('node:worker_threads');
const { PDFDocument, PDFDict, PDFArray, PDFName, PDFRawStream, PDFInvalidObject } = require('pdf-lib');
const denied = new Set(['JavaScript', 'JS', 'OpenAction', 'AA', 'Launch', 'EmbeddedFiles', 'EmbeddedFile',
  'Filespec', 'RichMedia', 'XFA', 'AcroForm', 'Encrypt', 'GoToR', 'GoToE', 'SubmitForm', 'ImportData',
  'URI', 'Sound', 'Movie', 'Rendition']);

async function validate(bytes) {
  if (bytes.length < 20 || bytes.length > 20971520 || !/^%PDF-[12]\.\d/.test(Buffer.from(bytes.subarray(0, 8)).toString('ascii'))
    || !/%%EOF\s*$/.test(Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString('latin1'))) {
    throw new Error('Assinatura ou término do PDF inválido.');
  }
  const document = await PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false });
  if (document.isEncrypted) throw new Error('PDF protegido por senha não é aceito.');
  const objects = document.context.enumerateIndirectObjects();
  if (objects.length > 100000) throw new Error('PDF excede a complexidade permitida.');
  const stack = objects.map(entry => entry[1]);
  stack.push(document.catalog);
  const visited = new Set();
  let count = 0;
  while (stack.length) {
    const object = stack.pop();
    if (!object || visited.has(object)) continue;
    visited.add(object);
    if (++count > 300000) throw new Error('PDF excede a complexidade permitida.');
    if (object instanceof PDFInvalidObject) throw new Error('PDF contém objetos inválidos.');
    if (object instanceof PDFName && denied.has(object.decodeText())) throw new Error('PDF contém ações, links externos, anexos ou conteúdo interativo não permitido.');
    if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) { stack.push(key, value); }
    } else if (object instanceof PDFArray) {
      for (let i = 0; i < object.size(); i++) stack.push(object.get(i));
    } else if (object instanceof PDFRawStream) stack.push(object.dict);
  }
  const pages = document.getPageCount();
  if (pages < 1 || pages > 5000) throw new Error('PDF deve conter entre 1 e 5.000 páginas.');
  return { pages };
}
validate(new Uint8Array(workerData.bytes)).then(result => parentPort.postMessage({ result }))
  .catch(() => parentPort.postMessage({ error: 'PDF inválido ou não permitido. Exporte um PDF estático, sem senha, anexos, formulários, scripts ou links externos.' }));
