import { PdfDownloadError } from "./types";

export function parseDownloadLimit(value: string | undefined): number {
  if (value === undefined || value === "") return 0;
  if (!/^(0|[1-9][0-9]{0,6})$/.test(value) || Number(value) > 1000000) throw new PdfDownloadError("DOWNLOAD_FAILED");
  return Number(value);
}
