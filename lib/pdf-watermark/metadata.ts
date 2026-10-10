import type { PDFDocument } from "pdf-lib";

export function setPdfMetadata(document: PDFDocument, productName: string, licenseCode: string): void {
  document.setTitle(productName);
  document.setSubject(`Licensed copy: ${licenseCode}`);
  document.setKeywords(["licensed", licenseCode]);
  // Do not add customer name, email, CPF, order/user IDs or secrets to metadata.
}
