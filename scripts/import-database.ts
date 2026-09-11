import { statSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client/web";
import type { Client, InValue, Transaction } from "@libsql/client";
import { getDatabaseLocation } from "../src/lib/database";
import { initializeDatabaseSchema } from "../src/lib/database-schema";

// Fixed identifiers only. Data values always travel through bound parameters.
const columns = {
  companies: ["id", "name", "purpose", "owner_user_id", "cfo_user_id", "request_id", "request_name", "created_at", "updated_at", "wallet_status", "wallet_address", "privy_wallet_id", "baseline_wallet_addresses"],
  invoices: ["id", "owner_id", "company_id", "created_at", "payload"],
  invoice_payments: ["invoice_id", "transaction_hash", "payload"],
  company_payouts: ["id", "company_id", "owner_user_id", "transaction_hash", "sender", "recipient", "amount", "receiver_name", "memo", "status", "created_at", "updated_at", "block_number", "confirmed_at"],
  invoice_payment_attempts: ["transaction_hash", "invoice_id", "status", "created_at", "updated_at"],
  invoice_payment_submissions: ["invoice_id", "transaction_hash", "created_at", "next_check_at", "attempts"],
  company_payout_submissions: ["id", "company_id", "owner_user_id", "transaction_hash", "sender", "recipient", "amount", "receiver_name", "memo", "created_at", "updated_at", "attempts", "next_check_at"],
} as const;
type ImportTable = keyof typeof columns;
const importTables = Object.keys(columns) as ImportTable[];
// Version 1 backups predate recovery tables. Existing version 2 rows must be
// copied exactly so pending broadcasts can resume without resending funds.
const recoveryTables = new Set<ImportTable>(["invoice_payment_attempts", "invoice_payment_submissions", "company_payout_submissions"]);
const targetTables = [...importTables, "wallet_export_approvals"] as const;
type TargetTable = typeof targetTables[number];

export class DatabaseImportError extends Error {}
export type ImportOptions = { source: string; apply: boolean };
export type DatabaseSnapshot = {
  rows: Record<ImportTable, InValue[][]>;
  counts: Record<ImportTable, number>;
  excludedExportApprovals: number;
};

export function parseImportOptions(args: string[]): ImportOptions {
  let source: string | undefined;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply" && !apply) apply = true;
    else if (arg === "--source" && !source && args[index + 1] && !args[index + 1].startsWith("--")) source = args[++index];
    else throw new DatabaseImportError("Usage: import-database.ts --source <SQLite backup> [--apply]");
  }
  if (!source) throw new DatabaseImportError("An explicit --source SQLite backup is required.");
  return { source: resolve(source), apply };
}

export function requireRemoteImportTarget(): { url: string; authToken: string } {
  const url = getDatabaseLocation();
  if (!/^(?:libsql|https):\/\//i.test(url)) {
    throw new DatabaseImportError("Import requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for a remote target. Local targets are not allowed.");
  }
  // getDatabaseLocation validates the scheme and rejects embedded credentials.
  return { url, authToken: process.env.TURSO_AUTH_TOKEN!.trim() };
}

/** Read a consistent SQLite snapshot without allowing any source writes. */
export function readDatabaseSnapshot(source: string): DatabaseSnapshot {
  try {
    if (!statSync(source).isFile()) throw new Error("Not a file");
  } catch { throw new DatabaseImportError("The source must be an existing SQLite backup file."); }
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(source, { readOnly: true });
    db.exec("BEGIN");
    const integrity = db.prepare("PRAGMA quick_check").all();
    if (integrity.length !== 1 || integrity[0].quick_check !== "ok") throw new DatabaseImportError("The source backup failed its SQLite integrity check.");
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
    const rows = {} as DatabaseSnapshot["rows"];
    const counts = {} as DatabaseSnapshot["counts"];
    for (const table of importTables) {
      if (!tables.has(table) && recoveryTables.has(table)) {
        rows[table] = [];
        counts[table] = 0;
        continue;
      }
      if (!tables.has(table)) throw new DatabaseImportError("The source backup is missing a required application table.");
      const actualColumns = db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name).sort();
      if (JSON.stringify(actualColumns) !== JSON.stringify([...columns[table]].sort())) {
        throw new DatabaseImportError("The source schema does not match this application version. No records were imported.");
      }
      const statement = db.prepare(`SELECT ${columns[table].join(", ")} FROM ${table}`);
      statement.setReadBigInts(true);
      rows[table] = statement.all().map(row => columns[table].map(column => row[column]));
      counts[table] = rows[table].length;
    }
    const excludedExportApprovals = tables.has("wallet_export_approvals")
      ? Number(db.prepare("SELECT COUNT(*) AS count FROM wallet_export_approvals").get()!.count) : 0;
    db.exec("COMMIT");
    return { rows, counts, excludedExportApprovals };
  } catch (error) {
    if (error instanceof DatabaseImportError) throw error;
    throw new DatabaseImportError("The source backup could not be read. No records were imported.");
  } finally { db?.close(); }
}

async function inspectTarget(client: Client | Transaction): Promise<Record<TargetTable, number>> {
  const tables = new Set((await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map(row => row.name));
  // Refuse an unrelated database even if its application table names happen to match.
  if ([...tables].some(table => typeof table !== "string" ||
    (!targetTables.includes(table as TargetTable) && table !== "snitch_schema_migrations" && !table.startsWith("sqlite_")))) {
    throw new DatabaseImportError("The target contains unrelated tables. Use a dedicated empty database.");
  }
  const counts = {} as Record<TargetTable, number>;
  for (const table of targetTables) {
    counts[table] = tables.has(table)
      ? Number((await client.execute(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0].count) : 0;
    if (!Number.isSafeInteger(counts[table]) || counts[table] < 0) throw new DatabaseImportError("The target record counts could not be verified.");
  }
  return counts;
}

function requireEmptyTarget(counts: Record<TargetTable, number>) {
  if (Object.values(counts).some(count => count > 0)) {
    throw new DatabaseImportError("The target already contains application records. Import refused; nothing was overwritten or merged.");
  }
}

/** The CLI validates the remote destination before constructing this client. */
export async function transferDatabaseSnapshot(snapshot: DatabaseSnapshot, client: Client, apply: boolean) {
  const before = await inspectTarget(client);
  requireEmptyTarget(before);
  if (!apply) {
    return { mode: "dry-run" as const, source: snapshot.counts, target: before, excludedExportApprovals: snapshot.excludedExportApprovals, targetEmpty: true };
  }

  await initializeDatabaseSchema(client, false, Symbol("database-import"));
  const transaction = await client.transaction("write");
  let commitStarted = false;
  try {
    // Recheck under the write lock: a deployment may have written since dry-run.
    requireEmptyTarget(await inspectTarget(transaction));
    for (const table of importTables) {
      const fields = columns[table];
      const sql = `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`;
      for (const row of snapshot.rows[table]) await transaction.execute({ sql, args: row });
    }
    const imported = await inspectTarget(transaction);
    if (importTables.some(table => imported[table] !== snapshot.counts[table]) || imported.wallet_export_approvals !== 0) {
      throw new DatabaseImportError("The imported record counts did not match the backup. The import was rolled back.");
    }
    commitStarted = true;
    await transaction.commit();
    return { mode: "applied" as const, source: snapshot.counts, target: imported, excludedExportApprovals: snapshot.excludedExportApprovals, targetEmpty: false };
  } catch (error) {
    if (!transaction.closed) await transaction.rollback().catch(() => undefined);
    if (commitStarted) throw new DatabaseImportError("The commit result could not be confirmed. Inspect target counts before retrying; the import may have completed.");
    if (error instanceof DatabaseImportError) throw error;
    throw new DatabaseImportError("The import could not be completed. Its record writes were rolled back; inspect the target before retrying.");
  } finally { transaction.close(); }
}

export async function runDatabaseImport(args: string[]) {
  const options = parseImportOptions(args);
  const target = requireRemoteImportTarget();
  // A local source path and a validated HTTPS/libSQL target cannot be the same database file.
  const snapshot = readDatabaseSnapshot(options.source);
  const client = createClient({ ...target, intMode: "bigint" });
  try {
    const result = await transferDatabaseSnapshot(snapshot, client, options.apply);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally { client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runDatabaseImport(process.argv.slice(2)).catch(error => {
    // Never print provider errors, SQL payloads, personal records, or credentials.
    process.stderr.write(`${error instanceof DatabaseImportError ? error.message : "Database import unavailable. Check the remote database configuration and access, then retry the dry-run."}\n`);
    process.exitCode = 1;
  });
}
