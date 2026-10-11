import path from "node:path";

export const BACKUP_PROJECT_REF = "urgzsaftoiebsjkgyhsg";
export const BACKUP_PROJECT_URL = `https://${BACKUP_PROJECT_REF}.supabase.co`;

// Validate without returning the URL, password, user name or driver diagnostics.
export function databaseBackupConnectionConfigured(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const direct = url.hostname === `db.${BACKUP_PROJECT_REF}.supabase.co` &&
      ["postgres", `postgres.${BACKUP_PROJECT_REF}`].includes(user);
    const pooler = /^aws-[\da-z-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
      user === `postgres.${BACKUP_PROJECT_REF}`;
    return ["postgres:", "postgresql:"].includes(url.protocol) && (direct || pooler) &&
      (!url.port || url.port === "5432") && url.pathname === "/postgres" &&
      Boolean(password) && !/^(\[[^\]]+\]|<[^>]+>|SENHA_CODIFICADA)$/.test(password) && !url.hash &&
      [...url.searchParams.keys()].every(key => key === "sslmode") &&
      (!url.searchParams.has("sslmode") || ["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode")));
  } catch { return false; }
}

// A lexical check only. The operator must also check ACLs, links and encryption
// before writing any data. No export/restore is performed by this module.
export function backupDirectoryOutsideWorkspace(directory, workspace, syncedRoots = [], flavor = path) {
  if (!directory || !flavor.isAbsolute(directory) || !flavor.isAbsolute(workspace)) return false;
  const target = flavor.resolve(directory);
  if (target === flavor.parse(target).root) return false;
  const contains = (parent, child) => {
    const relative = flavor.relative(flavor.resolve(parent), child);
    return relative === "" || (!relative.startsWith(`..${flavor.sep}`) && relative !== ".." && !flavor.isAbsolute(relative));
  };
  if (contains(workspace, target) || contains(target, flavor.resolve(workspace))) return false;
  return !syncedRoots.filter(Boolean).some(root => contains(root, target) || contains(target, flavor.resolve(root)));
}

export function backupReadinessSummary({ connection, privateDirectory, pgDump, pgRestore, psql, remoteReadable }) {
  return {
    connectionConfigured: Boolean(connection), privateDirectoryCandidate: Boolean(privateDirectory),
    pgDumpAvailable: Boolean(pgDump), pgRestoreAvailable: Boolean(pgRestore), psqlAvailable: Boolean(psql),
    remoteInventoryReadable: Boolean(remoteReadable),
    nativeExportPrerequisitesPresent: Boolean(connection && privateDirectory && pgDump && pgRestore && psql && remoteReadable),
    // A preflight is not a backup and must never be used as commercial acceptance.
    databaseBackupCreated: false, storageBackupCreated: false, isolatedRecoveryVerified: false,
    commercialReleaseApprovedByThisCheck: false,
  };
}
