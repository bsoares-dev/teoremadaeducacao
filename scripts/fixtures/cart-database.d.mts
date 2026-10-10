import type { PGlite, Transaction } from "@electric-sql/pglite";
export function cartDatabase(options?: { legacyAuthTrigger?: boolean; pdfBytes?: Uint8Array | null }): Promise<{
  db: PGlite;
  users: { id: string; email: string }[];
  ids: string[];
  service: <T>(callback: (tx: Transaction) => Promise<T>) => Promise<T>;
}>;
