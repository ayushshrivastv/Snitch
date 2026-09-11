import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import { createClient } from "@libsql/client";
import { DatabaseImportError, parseImportOptions, readDatabaseSnapshot, transferDatabaseSnapshot } from "../scripts/import-database";
import { initializeDatabaseSchema } from "../src/lib/database-schema";

const directory = mkdtempSync(join(tmpdir(), "snitch-import-tests-"));
after(() => rmSync(directory, { recursive: true, force: true }));
let sourceIndex = 0;

function fixtureSource(includeRecovery = false) {
  const source = join(directory, `${sourceIndex++}.sqlite`);
  const db = new DatabaseSync(source);
  const records: Record<string, Record<string, string | bigint>> = {
    companies: { id: "company-id", name: "Company 'exact' name", purpose: "company", owner_user_id: "owner-id", cfo_user_id: "cfo-id", request_id: "request-id", request_name: "Original request", created_at: "2026-09-10T00:00:00.000Z", updated_at: "2026-09-11T00:00:00.000Z", wallet_status: "ready", wallet_address: "0x1234", privy_wallet_id: "wallet-id", baseline_wallet_addresses: "[\"baseline\"]" },
    invoices: { id: "invoice-id", owner_id: "owner-id", company_id: "company-id", created_at: "2026-09-11T00:00:00.000Z", payload: '{"amount":"0.000000000000000001","memo":"exact value"}' },
    invoice_payments: { invoice_id: "invoice-id", transaction_hash: "0xabc", payload: '{"amount":"0.000000000000000001"}' },
    company_payouts: { id: "payout-id", company_id: "company-id", owner_user_id: "owner-id", transaction_hash: "0xdef", sender: "0x1234", recipient: "0x5678", amount: "0.000000000000000002", receiver_name: "Receiver", memo: "Exact note", status: "Succeeded", created_at: "2026-09-10T00:00:00.000Z", updated_at: "2026-09-11T00:00:00.000Z", block_number: BigInt("9007199254740993"), confirmed_at: "2026-09-11T00:00:00.000Z" },
  };
  if (includeRecovery) Object.assign(records, {
    invoice_payment_attempts: { transaction_hash: "0x123", invoice_id: "invoice-id", status: "Incomplete", created_at: "2026-09-11T00:00:00.000Z", updated_at: "2026-09-11T00:00:01.000Z" },
    invoice_payment_submissions: { invoice_id: "invoice-id", transaction_hash: "0x456", created_at: "2026-09-11T00:00:00.000Z", next_check_at: "2026-09-11T00:05:00.000Z", attempts: BigInt(3) },
    company_payout_submissions: { id: "submitted-payout", company_id: "company-id", owner_user_id: "owner-id", transaction_hash: "0x789", sender: "0x1234", recipient: "0x5678", amount: "0.000000000000000003", receiver_name: "Pending receiver", memo: "Pending note", created_at: "2026-09-11T00:00:00.000Z", updated_at: "2026-09-11T00:00:01.000Z", attempts: BigInt(2), next_check_at: "2026-09-11T00:01:00.000Z" },
  });
  for (const [table, row] of Object.entries(records)) {
    const fields = Object.keys(row);
    db.exec(`CREATE TABLE ${table} (${fields.map(field => `${field} ${["block_number", "attempts"].includes(field) ? "INTEGER" : "TEXT"}`).join(", ")})`);
    db.prepare(`INSERT INTO ${table} VALUES (${fields.map(() => "?").join(", ")})`).run(...Object.values(row));
  }
  db.exec("CREATE TABLE wallet_export_approvals (id TEXT); INSERT INTO wallet_export_approvals VALUES ('never-copy-this-approval')");
  db.close();
  return { source, records };
}

test("import requires an explicit backup and apply flag, rejecting unknown arguments", () => {
  assert.throws(() => parseImportOptions([]), /explicit --source/);
  for (const args of [["--apply"], ["--source"], ["--source", "backup", "--overwrite"], ["--source", "backup", "--apply", "--apply"]]) {
    assert.throws(() => parseImportOptions(args), DatabaseImportError);
  }
  assert.equal(parseImportOptions(["--source", "backup"]).apply, false);
  assert.equal(parseImportOptions(["--source", "backup", "--apply"]).apply, true);
});

test("dry-run preserves the source bytes and does not initialize target tables", async () => {
  const { source } = fixtureSource();
  const digest = () => createHash("sha256").update(readFileSync(source)).digest("hex");
  const before = digest();
  const snapshot = readDatabaseSnapshot(source);
  assert.equal(digest(), before);
  const client = createClient({ url: ":memory:" });
  try {
    const result = await transferDatabaseSnapshot(snapshot, client, false);
    assert.equal(result.mode, "dry-run");
    assert.deepEqual(result.source, { companies: 1, invoices: 1, invoice_payments: 1, company_payouts: 1,
      invoice_payment_attempts: 0, invoice_payment_submissions: 0, company_payout_submissions: 0, deleted_company_records: 0 });
    assert.equal(result.excludedExportApprovals, 1);
    assert.equal((await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.length, 0);
    assert.equal(digest(), before);
  } finally { client.close(); }
});

test("apply preserves exact records including large integers and excludes export approvals", async () => {
  const { source, records } = fixtureSource();
  const client = createClient({ url: ":memory:", intMode: "bigint" });
  try {
    const result = await transferDatabaseSnapshot(readDatabaseSnapshot(source), client, true);
    assert.equal(result.mode, "applied");
    for (const [table, row] of Object.entries(records)) {
      const imported = (await client.execute(`SELECT * FROM ${table}`)).rows[0];
      for (const [field, value] of Object.entries(row)) assert.equal(imported[field], value);
    }
    assert.equal((await client.execute("SELECT COUNT(*) AS count FROM wallet_export_approvals")).rows[0].count, BigInt(0));
    await assert.rejects(transferDatabaseSnapshot(readDatabaseSnapshot(source), client, true), /already contains/);
    assert.equal((await client.execute("SELECT COUNT(*) AS count FROM companies")).rows[0].count, BigInt(1));
  } finally { client.close(); }
});

test("a conflicting insert rolls back every business record in the import", async () => {
  const { source } = fixtureSource();
  const snapshot = readDatabaseSnapshot(source);
  snapshot.rows.invoices.push([...snapshot.rows.invoices[0]]);
  snapshot.counts.invoices += 1;
  const client = createClient({ url: ":memory:" });
  try {
    await assert.rejects(transferDatabaseSnapshot(snapshot, client, true), /rolled back/);
    for (const table of ["companies", "invoices", "invoice_payments", "company_payouts", "wallet_export_approvals", "invoice_payment_attempts", "invoice_payment_submissions", "company_payout_submissions", "deleted_company_records"]) {
      assert.equal((await client.execute(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0].count, 0);
    }
  } finally { client.close(); }
});

test("version 2 snapshots retain pending broadcasts and retry schedules without promoting payment status", async () => {
  const { source, records } = fixtureSource(true);
  const snapshot = readDatabaseSnapshot(source);
  const client = createClient({ url: ":memory:", intMode: "bigint" });
  try {
    await initializeDatabaseSchema(client, false, Symbol("import-v2-test"));
    const result = await transferDatabaseSnapshot(snapshot, client, true);
    assert.equal(result.mode, "applied");
    for (const table of ["invoice_payment_attempts", "invoice_payment_submissions", "company_payout_submissions"]) {
      assert.equal(result.source[table as keyof typeof result.source], 1);
      const imported = (await client.execute(`SELECT * FROM ${table}`)).rows[0];
      for (const [field, value] of Object.entries(records[table])) assert.equal(imported[field], value);
    }
    assert.equal((await client.execute("SELECT status FROM invoice_payment_attempts")).rows[0].status, "Incomplete");
    assert.equal((await client.execute("SELECT COUNT(*) AS count FROM wallet_export_approvals")).rows[0].count, BigInt(0));
  } finally { client.close(); }
});

test("recovery records make a destination nonempty and are never overwritten", async () => {
  const { source } = fixtureSource();
  const client = createClient({ url: ":memory:" });
  try {
    await initializeDatabaseSchema(client, false, Symbol("import-recovery-target"));
    await client.execute({ sql: "INSERT INTO invoice_payment_submissions (invoice_id, transaction_hash, created_at, next_check_at) VALUES (?, ?, ?, ?)", args: ["existing-invoice", "0xexisting", "2026-09-11", "2026-09-11"] });
    await assert.rejects(transferDatabaseSnapshot(readDatabaseSnapshot(source), client, true), /already contains/);
    assert.equal((await client.execute("SELECT transaction_hash FROM invoice_payment_submissions")).rows[0].transaction_hash, "0xexisting");
  } finally { client.close(); }
});

test("present recovery tables with incompatible columns are rejected before import", () => {
  const { source } = fixtureSource(true);
  const db = new DatabaseSync(source);
  db.exec("ALTER TABLE invoice_payment_attempts ADD COLUMN incompatible TEXT");
  db.close();
  assert.throws(() => readDatabaseSnapshot(source), /source schema does not match/);
});

test("unrelated target data is refused without modifying it", async () => {
  const { source } = fixtureSource();
  const client = createClient({ url: ":memory:" });
  try {
    await client.execute("CREATE TABLE unrelated (value TEXT)");
    await client.execute("INSERT INTO unrelated VALUES ('retained')");
    await assert.rejects(transferDatabaseSnapshot(readDatabaseSnapshot(source), client, true), /unrelated tables/);
    assert.equal((await client.execute("SELECT value FROM unrelated")).rows[0].value, "retained");
  } finally { client.close(); }
});
