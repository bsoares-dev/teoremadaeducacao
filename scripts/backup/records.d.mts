type BackupRecord = { bytes: number; sha256: string; base64: string };
export function sha256(value: string | Buffer): string;
export function backupRecord(bytes: Buffer): BackupRecord;
export function readBackupRecord(entry: unknown): Buffer;
export function assertCoreTables(toc: string): void;
