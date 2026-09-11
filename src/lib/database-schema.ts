import type { Client, Transaction } from "@libsql/client";
import { serializeLocalWrite } from "./database-lock";

const companyTable = `CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'company' CHECK(purpose IN ('company', 'playground')),
  owner_user_id TEXT NOT NULL,
  cfo_user_id TEXT,
  request_id TEXT NOT NULL,
  request_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  wallet_status TEXT NOT NULL CHECK(wallet_status IN ('pending', 'ready')),
  wallet_address TEXT COLLATE NOCASE UNIQUE,
  privy_wallet_id TEXT UNIQUE,
  baseline_wallet_addresses TEXT NOT NULL,
  UNIQUE(owner_user_id, request_id)
)`;

const schema = [
  `CREATE UNIQUE INDEX IF NOT EXISTS one_pending_company_per_owner
    ON companies(owner_user_id) WHERE wallet_status = 'pending'`,
  "CREATE INDEX IF NOT EXISTS companies_by_owner ON companies(owner_user_id)",
  `CREATE UNIQUE INDEX IF NOT EXISTS one_playground_per_owner
    ON companies(owner_user_id) WHERE purpose = 'playground'`,
  `CREATE TABLE IF NOT EXISTS wallet_export_approvals (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL, user_id TEXT NOT NULL,
    wallet_address TEXT NOT NULL, privy_wallet_id TEXT, message TEXT NOT NULL,
    expires_at TEXT NOT NULL, consumed_at TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS wallet_export_approvals_expiry ON wallet_export_approvals(expires_at)",
  `CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY, owner_id TEXT, company_id TEXT,
    created_at TEXT NOT NULL, payload TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS invoices_by_company ON invoices(owner_id, company_id, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS invoice_payments (
    invoice_id TEXT PRIMARY KEY,
    transaction_hash TEXT COLLATE NOCASE NOT NULL UNIQUE,
    payload TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invoice_payment_attempts (
    transaction_hash TEXT PRIMARY KEY COLLATE NOCASE,
    invoice_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Incomplete', 'Failed', 'Succeeded')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS invoice_attempts_by_invoice ON invoice_payment_attempts(invoice_id, status, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS invoice_payment_submissions (
    invoice_id TEXT NOT NULL, transaction_hash TEXT NOT NULL COLLATE NOCASE,
    created_at TEXT NOT NULL, next_check_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(invoice_id, transaction_hash)
  )`,
  "CREATE INDEX IF NOT EXISTS invoice_submissions_due ON invoice_payment_submissions(invoice_id, next_check_at)",
  `CREATE TABLE IF NOT EXISTS company_payouts (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
    transaction_hash TEXT NOT NULL UNIQUE COLLATE NOCASE,
    sender TEXT NOT NULL, recipient TEXT NOT NULL, amount TEXT NOT NULL,
    receiver_name TEXT NOT NULL, memo TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Succeeded','Failed','Incomplete')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    block_number INTEGER, confirmed_at TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS payouts_by_company_owner ON company_payouts(company_id, owner_user_id, created_at)",
  `CREATE TABLE IF NOT EXISTS company_payout_submissions (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
    transaction_hash TEXT NOT NULL UNIQUE COLLATE NOCASE,
    sender TEXT NOT NULL, recipient TEXT NOT NULL, amount TEXT NOT NULL,
    receiver_name TEXT NOT NULL, memo TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, next_check_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS payout_submissions_by_company_owner ON company_payout_submissions(company_id, owner_user_id, next_check_at)",
  `CREATE TABLE IF NOT EXISTS snitch_schema_migrations (
    version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
  )`,
];

/** Apply the existing SQLite schema without replacing any company or wallet data. */
async function schemaIsCurrent(client: Client | Transaction): Promise<boolean> {
  const exists = await client.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'snitch_schema_migrations'");
  if (!exists.rows.length) return false;
  const version = await client.execute(`SELECT 1 FROM snitch_schema_migrations WHERE version = 2
    AND (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'
      AND name IN ('invoice_payment_attempts', 'invoice_payment_submissions', 'company_payout_submissions')) = 3`);
  return version.rows.length === 1;
}

export async function initializeDatabaseSchema(client: Client, local: boolean, key: string | symbol): Promise<void> {
  if (await schemaIsCurrent(client)) return;
  const migrate = async () => {
    if (await schemaIsCurrent(client)) return;
    if (local) await client.execute("PRAGMA journal_mode = WAL");
    await applySchema(client);
  };
  if (local) await serializeLocalWrite(key, migrate);
  else await migrate();
}

async function applySchema(client: Client): Promise<void> {
  const transaction: Transaction = await client.transaction("write");
  try {
    if (await schemaIsCurrent(transaction)) {
      await transaction.commit();
      return;
    }
    await transaction.execute(companyTable);
    const columns = new Set((await transaction.execute("PRAGMA table_info(companies)")).rows.map(row => row.name));
    if (!columns.has("purpose")) {
      await transaction.execute("ALTER TABLE companies ADD COLUMN purpose TEXT NOT NULL DEFAULT 'company' CHECK(purpose IN ('company', 'playground'))");
    }
    if (!columns.has("cfo_user_id")) {
      await transaction.execute("ALTER TABLE companies ADD COLUMN cfo_user_id TEXT");
      // This backfill occurs only when introducing the column. A later revoked
      // CFO remains revoked when another serverless instance initializes.
      await transaction.execute("UPDATE companies SET cfo_user_id = owner_user_id");
    }
    await transaction.batch(schema);
    await transaction.execute({
      sql: "INSERT OR IGNORE INTO snitch_schema_migrations (version, applied_at) VALUES (2, ?)",
      args: [new Date().toISOString()],
    });
    await transaction.commit();
  } catch (error) {
    if (!transaction.closed) await transaction.rollback().catch(() => undefined);
    throw error;
  } finally {
    transaction.close();
  }
}
