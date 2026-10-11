import type path from "node:path";

export const BACKUP_PROJECT_REF: string;
export const BACKUP_PROJECT_URL: string;
export function databaseBackupConnectionConfigured(value: string | undefined): boolean;
export function backupDirectoryOutsideWorkspace(directory: string | undefined, workspace: string, syncedRoots?: string[], flavor?: typeof path): boolean;
export function backupReadinessSummary(input: {
  connection: boolean; privateDirectory: boolean; pgDump: boolean; pgRestore: boolean; psql: boolean; remoteReadable: boolean;
}): {
  connectionConfigured: boolean; privateDirectoryCandidate: boolean;
  pgDumpAvailable: boolean; pgRestoreAvailable: boolean; psqlAvailable: boolean; remoteInventoryReadable: boolean;
  nativeExportPrerequisitesPresent: boolean; databaseBackupCreated: false; storageBackupCreated: false;
  isolatedRecoveryVerified: false; commercialReleaseApprovedByThisCheck: false;
};
