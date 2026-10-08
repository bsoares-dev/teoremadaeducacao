import type { PGlite, Transaction } from "@electric-sql/pglite";
export function cartDatabase(): Promise<{
  db: PGlite;
  users: { id: string; email: string }[];
  ids: string[];
  service: <T>(callback: (tx: Transaction) => Promise<T>) => Promise<T>;
}>;
