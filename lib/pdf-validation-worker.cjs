/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS worker, traced into the server bundle. */
/* A separate bounded worker prevents malformed PDFs from blocking the web process.
 * This is a conservative structural policy, not an antivirus or a DRM guarantee. */
const { parentPort, workerData } = require('node:worker_threads');
const { PDFDocument, PDFDict, PDFArray, PDFName, PDFString, PDFHexString, PDFRawStream, PDFInvalidObject } = require('pdf-lib');
// Normal links, AcroForm fields and view/navigation actions are compatible with
// watermarking. Keep executable actions, attachments and dynamic XFA blocked.
const denied = new Set(['JavaScript', 'JS', 'Launch', 'EmbeddedFiles', 'EmbeddedFile',
  'Filespec', 'RichMedia', 'XFA', 'Encrypt', 'GoToR', 'GoToE', 'SubmitForm', 'ImportData',
  'Sound', 'Movie', 'Rendition']);
const messages = {
  PDF_INVALID: 'Não foi possível abrir este PDF. Exporte o arquivo novamente em PDF e reenvie.',
  PDF_PASSWORD: 'Este PDF tem proteção por senha. Exporte uma cópia sem senha e reenvie.',
  PDF_UNSAFE: 'Este PDF contém scripts, anexos ou ações não suportadas. Exporte uma cópia sem esses recursos.',
  PDF_COMPLEX: 'Este PDF excede a complexidade suportada. Divida o material em arquivos menores.',
};
function invalid(code) { const error = new Error(messages[code]); error.code = code; throw error; }

async function validate(bytes) {
  if (bytes.length < 20 || bytes.length > 20971520 || !/^%PDF-[12]\.\d/.test(Buffer.from(bytes.subarray(0, 8)).toString('ascii'))
    || !/%%EOF\s*$/.test(Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString('latin1'))) {
    invalid('PDF_INVALID');
  }
  let document;
  try { document = await PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false }); }
  catch (error) { invalid(error instanceof Error && error.message.includes('encrypted') ? 'PDF_PASSWORD' : 'PDF_INVALID'); }
  if (document.isEncrypted) invalid('PDF_PASSWORD');
  const objects = document.context.enumerateIndirectObjects();
  if (objects.length > 100000) invalid('PDF_COMPLEX');
  const stack = objects.map(entry => entry[1]);
  stack.push(document.catalog);
  const visited = new Set();
  let count = 0;
  while (stack.length) {
    const object = stack.pop();
    if (!object || visited.has(object)) continue;
    visited.add(object);
    if (++count > 300000) invalid('PDF_COMPLEX');
    if (object instanceof PDFInvalidObject) invalid('PDF_INVALID');
    if (object instanceof PDFName && denied.has(object.decodeText())) invalid('PDF_UNSAFE');
    if (object instanceof PDFDict) {
      const action = object.lookup(PDFName.of('S'));
      if (action instanceof PDFName && action.decodeText() === 'URI') {
        const uri = object.lookup(PDFName.of('URI'));
        if (!(uri instanceof PDFString || uri instanceof PDFHexString)
          || !/^(https?:\/\/|mailto:|tel:)/i.test(uri.decodeText().trim())
          || /[\x00-\x1f\x7f]/.test(uri.decodeText())) invalid('PDF_UNSAFE');
      }
      for (const [key, value] of object.entries()) { stack.push(key, value); }
    } else if (object instanceof PDFArray) {
      for (let i = 0; i < object.size(); i++) stack.push(object.get(i));
    } else if (object instanceof PDFRawStream) stack.push(object.dict);
  }
  const pages = document.getPageCount();
  if (pages < 1 || pages > 5000) invalid('PDF_COMPLEX');
  return { pages };
}
validate(new Uint8Array(workerData.bytes)).then(result => parentPort.postMessage({ result }))
  .catch(error => {
    const code = Object.hasOwn(messages, error?.code) ? error.code : 'PDF_INVALID';
    parentPort.postMessage({ error: messages[code], code });
  });
