export const BACKUP_MAX_BYTES: number;
export function validBackupPassphrase(value: unknown): value is string;
export function encryptBackup(plaintext: Buffer, passphrase: string): Promise<Buffer>;
export function decryptBackup(envelope: Buffer, passphrase: string): Promise<Buffer>;
