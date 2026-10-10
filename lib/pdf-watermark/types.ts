export type PdfWatermarkConfig = Readonly<{
  showCustomerName: boolean;
  showCustomerEmail: boolean;
  maskCustomerEmail: boolean;
}>;

// Values must come from the authenticated server/database, never a request body.
// This renderer does not grant access, create licenses or consult payment status.
export type PdfPersonalizationInput = {
  original: Uint8Array;
  customerName: string | null;
  customerEmail: string | null;
  licenseCode: string;
  product: { name: string };
};

export type PdfWatermarkErrorCode = "INVALID_INPUT" | "CONFIG_INVALID" | "PDF_INVALID"
  | "PDF_TOO_LARGE" | "PAGE_UNSUPPORTED" | "FONT_UNAVAILABLE" | "UNSUPPORTED_CHARACTER" | "GENERATION_FAILED";

const messages: Record<PdfWatermarkErrorCode, string> = {
  INVALID_INPUT: "Não foi possível identificar os dados da cópia licenciada.",
  CONFIG_INVALID: "A personalização do material está temporariamente indisponível.",
  PDF_INVALID: "Este PDF não pôde ser processado. O arquivo deve ser estático e sem senha.",
  PDF_TOO_LARGE: "O PDF excede o tamanho permitido.",
  PAGE_UNSUPPORTED: "Este PDF possui uma página que não permite identificação legível.",
  FONT_UNAVAILABLE: "A fonte de personalização está temporariamente indisponível.",
  UNSUPPORTED_CHARACTER: "A fonte não suporta um dos caracteres da identificação.",
  GENERATION_FAILED: "Não foi possível gerar o PDF personalizado.",
};

export class PdfWatermarkError extends Error {
  constructor(public readonly code: PdfWatermarkErrorCode) {
    super(messages[code]);
    this.name = "PdfWatermarkError";
  }
}
