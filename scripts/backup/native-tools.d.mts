type BackupEnvironment = Record<string, string | undefined>;
export function systemEnvironment(env: BackupEnvironment): BackupEnvironment;
export function postgresTools(env: BackupEnvironment): { dump: string; roles: string; restore: string; sql: string };
export function postgresEnvironment(value: string | undefined, env: BackupEnvironment): BackupEnvironment;
export function runPostgres(binary: string, args: string[], env: BackupEnvironment, errorCode?: string): Promise<Buffer>;
export function readOnlyQuery(binary: string, sql: string, env: BackupEnvironment): Promise<unknown>;
export function inspectArchive(binary: string, archive: Buffer, env: BackupEnvironment): Promise<string>;
