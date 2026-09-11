import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { AsyncDatabase, DatabaseConfigurationError, getDatabaseLocation } from "../src/lib/database";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "snitch-database-"));
  const path = join(directory, "snitch.sqlite");
  const connections: AsyncDatabase[] = [];
  return {
    path,
    open() { const db = new AsyncDatabase(path); connections.push(db); return db; },
    close() { connections.forEach(db => db.close()); rmSync(directory, { recursive: true, force: true }); },
  };
}

test("one initialization creates the full shared schema and preserves records after reopening", async () => {
  const temporary = fixture();
  try {
    const database = temporary.open();
    await database.ready();
    const tables = (await database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).map(row => row.name);
    for (const name of ["companies", "wallet_export_approvals", "invoices", "invoice_payments", "invoice_payment_attempts", "invoice_payment_submissions", "company_payouts", "company_payout_submissions"]) assert.ok(tables.includes(name));
    await database.prepare("INSERT INTO invoices (id, created_at, payload) VALUES (?, ?, ?)").run("INV-PERSIST", "2026-09-11", "{}");
    database.close();
    const reopened = temporary.open();
    assert.equal((await reopened.prepare("SELECT id FROM invoices").get())?.id, "INV-PERSIST");
    assert.equal((await reopened.prepare("SELECT COUNT(*) AS count FROM snitch_schema_migrations").get())?.count, 1);
  } finally { temporary.close(); }
});

test("the payment recovery migration preserves existing production invoices and receipts", async () => {
  const temporary = fixture();
  try {
    const original = temporary.open();
    await original.prepare("INSERT INTO invoices (id, created_at, payload) VALUES (?, ?, ?)").run("INV-MIGRATE", "2026-09-11", '{"amount":"0.001"}');
    await original.prepare("INSERT INTO invoice_payments (invoice_id, transaction_hash, payload) VALUES (?, ?, ?)").run("INV-MIGRATE", "0xabc", '{"status":"Succeeded"}');
    original.close();
    const previousVersion = new DatabaseSync(temporary.path);
    previousVersion.exec(`DROP TABLE invoice_payment_attempts; DROP TABLE invoice_payment_submissions;
      DROP TABLE company_payout_submissions; UPDATE snitch_schema_migrations SET version = 1`);
    previousVersion.close();
    const migrated = temporary.open();
    const concurrent = temporary.open();
    await Promise.all([migrated.ready(), concurrent.ready()]);
    assert.equal((await migrated.prepare("SELECT payload FROM invoices WHERE id = 'INV-MIGRATE'").get())?.payload, '{"amount":"0.001"}');
    assert.equal((await migrated.prepare("SELECT payload FROM invoice_payments WHERE invoice_id = 'INV-MIGRATE'").get())?.payload, '{"status":"Succeeded"}');
    for (const table of ["invoice_payment_attempts", "invoice_payment_submissions", "company_payout_submissions"]) {
      assert.equal((await migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))?.name, table);
    }
    assert.equal((await migrated.prepare("SELECT version FROM snitch_schema_migrations WHERE version = 2").get())?.version, 2);
  } finally { temporary.close(); }
});

test("transactions roll back every statement across asynchronous boundaries", async () => {
  const temporary = fixture();
  try {
    const database = temporary.open();
    await assert.rejects(database.transaction(async () => {
      await database.prepare("INSERT INTO invoices (id, created_at, payload) VALUES (?, ?, ?)").run("INV-FIRST", "2026-09-11", "{}");
      await setImmediate();
      await database.prepare("INSERT INTO invoices (id, created_at, payload) VALUES (?, ?, ?)").run("INV-SECOND", "2026-09-11", "{}");
      throw new Error("Cancel this operation");
    }), /Cancel this operation/);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM invoices").get())?.count, 0);
  } finally { temporary.close(); }
});

test("an unrelated read does not inherit another request's transaction context", async () => {
  const temporary = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let written!: () => void;
  const inserted = new Promise<void>(resolve => { written = resolve; });
  const database = temporary.open();
  const writing = database.transaction(async () => {
    await database.prepare("INSERT INTO invoices (id, created_at, payload) VALUES (?, ?, ?)").run("INV-ISOLATED", "2026-09-11", "{}");
    written();
    await gate;
  });
  try {
    await inserted;
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM invoices").get())?.count, 0);
    release();
    await writing;
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM invoices").get())?.count, 1);
  } finally { release(); await writing; temporary.close(); }
});

test("overlapping local writers on separate adapters keep their checks and changes atomic", async () => {
  const temporary = fixture();
  try {
    const first = temporary.open();
    const second = temporary.open();
    await Promise.all([first.ready(), second.ready()]);
    await first.exec("CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL); INSERT INTO counter VALUES (1, 0)");
    await Promise.all(Array.from({ length: 6 }, (_, index) => {
      const database = index % 2 ? first : second;
      return database.transaction(async () => {
        const before = (await database.prepare("SELECT value FROM counter WHERE id = 1").get())!.value as number;
        await setImmediate();
        await database.prepare("UPDATE counter SET value = ? WHERE id = 1").run(before + 1);
      });
    }));
    assert.equal((await first.prepare("SELECT value FROM counter WHERE id = 1").get())?.value, 6);
  } finally { temporary.close(); }
});

test("legacy CFO backfill happens once and never restores revoked authority", async () => {
  const temporary = fixture();
  try {
    const legacy = new DatabaseSync(temporary.path);
    legacy.exec(`CREATE TABLE companies (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_user_id TEXT NOT NULL,
      request_id TEXT NOT NULL, request_name TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, wallet_status TEXT NOT NULL, wallet_address TEXT,
      privy_wallet_id TEXT, baseline_wallet_addresses TEXT NOT NULL
    )`);
    legacy.prepare("INSERT INTO companies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("legacy", "Legacy company", "user-cfo", "request", "Legacy company", "2026-09-11", "2026-09-11", "ready", null, null, "[]");
    legacy.close();
    const database = temporary.open();
    assert.equal((await database.prepare("SELECT cfo_user_id FROM companies WHERE id = 'legacy'").get())?.cfo_user_id, "user-cfo");
    await database.prepare("UPDATE companies SET cfo_user_id = NULL WHERE id = 'legacy'").run();
    database.close();
    assert.equal((await temporary.open().prepare("SELECT cfo_user_id FROM companies WHERE id = 'legacy'").get())?.cfo_user_id, null);
  } finally { temporary.close(); }
});

test("Vercel requires remote configuration and never accepts an ephemeral local path", () => {
  const names = ["NODE_ENV", "VERCEL", "AWS_LAMBDA_FUNCTION_NAME", "NETLIFY", "SNITCH_DATA_DIR", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const env = process.env as Record<string, string | undefined>;
  try {
    names.forEach(name => { delete env[name]; });
    env.NODE_ENV = "production";
    env.VERCEL = "1";
    env.SNITCH_DATA_DIR = "/tmp/snitch";
    assert.throws(getDatabaseLocation, DatabaseConfigurationError);
    assert.throws(() => new AsyncDatabase("/tmp/snitch.sqlite"), DatabaseConfigurationError);
    env.TURSO_DATABASE_URL = "libsql://snitch-test.example.turso.io";
    assert.throws(getDatabaseLocation, /TURSO_AUTH_TOKEN/);
    env.TURSO_AUTH_TOKEN = "unit-test-token";
    assert.equal(getDatabaseLocation(), "libsql://snitch-test.example.turso.io");
    for (const value of ["file:/tmp/snitch.sqlite", "http://example.com", "https://user:password@example.com", "https://example.com?token=hidden"]) {
      env.TURSO_DATABASE_URL = value;
      assert.throws(getDatabaseLocation, DatabaseConfigurationError);
    }
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete env[name];
      else env[name] = previous[name];
    }
  }
});
