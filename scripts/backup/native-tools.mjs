import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { databaseBackupConnectionConfigured } from "./readiness.mjs";
import { BACKUP_MAX_BYTES } from "./encryption.mjs";

const run = promisify(execFile);
export function postgresTools(env) {
  const base = env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "CodeCommerce", "Tools", "PostgreSQL-17.11-4", "pgsql", "bin");
  const binary = name => base && process.platform === "win32" ? path.join(base, name + ".exe") : name;
  return { dump: env.TEOREMA_PG_DUMP_BIN || binary("pg_dump"),
    roles: env.TEOREMA_PG_DUMPALL_BIN || binary("pg_dumpall"),
    restore: env.TEOREMA_PG_RESTORE_BIN || binary("pg_restore"),
    sql: env.TEOREMA_PSQL_BIN || binary("psql") };
}

export function systemEnvironment(env) {
  const systemNames = new Set(["SYSTEMROOT", "WINDIR", "PATH", "COMSPEC", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA"]);
  return Object.fromEntries(Object.entries(env).filter(([name]) => systemNames.has(name.toUpperCase())));
}

export function postgresEnvironment(value, env) {
  if (!databaseBackupConnectionConfigured(value)) throw new Error("BACKUP_CONNECTION_INVALID");
  const connection = new URL(value);
  const result = systemEnvironment(env);
  return Object.assign(result, { PGHOST: connection.hostname, PGPORT: "5432", PGUSER: decodeURIComponent(connection.username),
    PGDATABASE: "postgres", PGPASSWORD: decodeURIComponent(connection.password), PGSSLMODE: connection.searchParams.get("sslmode") || "require",
    PGCONNECT_TIMEOUT: "12", PGAPPNAME: "teorema-backup-readonly", LC_ALL: "C", LANG: "C",
    PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=60000" });
}

export async function runPostgres(binary, args, env, errorCode = "BACKUP_POSTGRES_FAILED") {
  try {
    const { stdout } = await run(binary, args, { env, encoding: "buffer", windowsHide: true,
      timeout: 120000, maxBuffer: BACKUP_MAX_BYTES });
    return stdout;
  } catch { throw new Error(errorCode); }
}

export async function readOnlyQuery(binary, sql, env) {
  const output = await runPostgres(binary, ["-X", "-w", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], env);
  try { return JSON.parse(output.toString("utf8").trim()); }
  catch { throw new Error("BACKUP_INVENTORY_INVALID"); }
  finally { output.fill(0); }
}

// Reads the archive from stdin without a plaintext file or database connection.
// This is archive inspection, NOT an actual restoration.
export function inspectArchive(binary, archive, env) {
  return new Promise((resolve, reject) => {
    const safeEnv = systemEnvironment(env);
    const child = spawn(binary, ["--list"], { env: safeEnv, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks = []; let size = 0, failed = false;
    const fail = () => { failed = true; reject(new Error("BACKUP_ARCHIVE_INVALID")); };
    const timer = setTimeout(() => { child.kill(); fail(); }, 30000);
    child.on("error", fail); child.stdin.on("error", fail);
    child.stderr.resume();
    child.stdout.on("data", chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) { child.kill(); fail(); } else chunks.push(chunk); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0 || failed) { fail(); return; }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    child.stdin.end(archive);
  });
}
