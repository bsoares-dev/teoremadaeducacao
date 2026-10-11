import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { BACKUP_PROJECT_REF, databaseBackupConnectionConfigured, backupDirectoryOutsideWorkspace, backupReadinessSummary } from "../scripts/backup/readiness.mjs";
import { cartDatabase } from "../scripts/fixtures/cart-database.mjs";

test("backup connection binds this project/session port and rejects explicitly disabled TLS", () => {
  const direct = `postgresql://postgres:synthetic@db.${BACKUP_PROJECT_REF}.supabase.co:5432/postgres`;
  const session = `postgresql://postgres.${BACKUP_PROJECT_REF}:synthetic@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;
  assert.equal(databaseBackupConnectionConfigured(direct), true);
  assert.equal(databaseBackupConnectionConfigured(session + "?sslmode=verify-full"), true);
  for (const value of [undefined, "bad", direct.replace(":synthetic", ""), direct.replace(BACKUP_PROJECT_REF, "otherproject"),
    direct.replace("postgresql:", "https:"), session.replace("5432", "6543"), direct + "?sslmode=disable",
    direct + "?options=-c%20statement_timeout=0", direct + "#fragment", direct.replace("/postgres", "/otherdb"),
    session.replace(`postgres.${BACKUP_PROJECT_REF}`, "postgres.otherproject"), direct.replace("synthetic", "[YOUR-PASSWORD]"),
    direct.replace("synthetic", "%3CYOUR_PASSWORD%3E")]) {
    assert.equal(databaseBackupConnectionConfigured(value), false);
  }
});

test("private backup directory rejects workspace, broad roots and OneDrive while allowing a separate local folder", () => {
  const workspace = "C:\\Users\\test\\OneDrive\\Teorema";
  const synced = ["C:\\Users\\test\\OneDrive"];
  const check = (directory: string) => backupDirectoryOutsideWorkspace(directory, workspace, synced, path.win32);
  assert.equal(check("C:\\Users\\test\\AppData\\Local\\CodeCommerce\\TeoremaBackups"), true);
  for (const value of ["", "relative", "C:\\", workspace, workspace + "\\.data", "C:\\Users\\test",
    "C:\\Users\\test\\OneDrive\\Other", "c:\\users\\test\\onedrive\\teorema\\backup"]) assert.equal(check(value), false);
  assert.equal(backupDirectoryOutsideWorkspace("/private/backup", "/workspace/project", [], path.posix), true);
  assert.equal(backupDirectoryOutsideWorkspace("/workspace/project/../project/data", "/workspace/project", [], path.posix), false);
});

test("preflight cannot attest backup, recovery or commercial approval even with every prerequisite present", () => {
  const input = { connection: true, privateDirectory: true, pgDump: true, pgRestore: true, psql: true, remoteReadable: true };
  const summary = backupReadinessSummary(input);
  assert.equal(summary.nativeExportPrerequisitesPresent, true);
  for (const key of ["databaseBackupCreated", "storageBackupCreated", "isolatedRecoveryVerified", "commercialReleaseApprovedByThisCheck"] as const)
    assert.equal(summary[key], false);
  for (const key of Object.keys(input)) assert.equal(backupReadinessSummary({ ...input, [key]: false }).nativeExportPrerequisitesPresent, false);
});

test("read-only SQL inventory distinguishes unfinished uploads from missing validated files", async () => {
  const { db, users, ids } = await cartDatabase();
  try {
    // Legacy table is outside the commerce fixture; create it only in this test.
    await db.exec("create table public.registrations(id uuid primary key); alter table public.registrations enable row level security;");
    await db.query("insert into public.product_uploads(id,product_id,uploaded_by,kind,original_name,expected_size,mime_type) values($1,$2,$3,'PDF','synthetic.pdf',100,'application/pdf')", [randomUUID(), ids[0], users[0].id]);
    const sql = readFileSync(new URL("../supabase/backup-inventory.sql", import.meta.url), "utf8");
    assert.match(sql, /begin read only;/i);
    assert.doesNotMatch(sql, /\b(insert|update|delete|drop|alter|create|truncate)\b/i);
    const results = await db.exec(sql);
    const inventory = results.find(result => result.rows.length)?.rows[0].backup_inventory as {
      validated_files: number; missing_validated_objects: number; accounts: number; pending_uploads: number;
    };
    assert.equal(inventory.accounts, 3);
    assert.equal(inventory.validated_files, 3);
    assert.equal(inventory.missing_validated_objects, 0);
    assert.equal(inventory.pending_uploads, 1);
    await db.exec("delete from storage.objects where id=(select id from storage.objects limit 1)");
    const after = await db.exec(sql);
    const checked = after.find(result => result.rows.length)?.rows[0].backup_inventory as typeof inventory;
    assert.equal(checked.pending_uploads, 1);
    assert.equal(checked.missing_validated_objects, 1);
  } finally { await db.close(); }
});
