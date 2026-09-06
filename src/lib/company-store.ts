import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { CompanyAccount } from "./company-types";
import { buildWalletExportApprovalMessage, walletSignedExportApproval, type WalletExportApproval } from "./wallet-export-approval";

export const PLAYGROUND_COMPANY_NAME = "Snitchpay.co";

export class CompanyError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly company?: CompanyAccount,
  ) {
    super(message);
    this.name = "CompanyError";
  }
}

type CompanyRow = {
  id: string;
  name: string;
  purpose: CompanyAccount["purpose"];
  owner_user_id: string;
  cfo_user_id: string | null;
  request_name: string;
  created_at: string;
  updated_at: string;
  wallet_status: "pending" | "ready";
  wallet_address: string | null;
  privy_wallet_id: string | null;
  baseline_wallet_addresses: string;
};

type WalletExportApprovalRow = {
  id: string;
  company_id: string;
  user_id: string;
  wallet_address: string;
  privy_wallet_id: string | null;
  message: string;
  expires_at: string;
  consumed_at: string | null;
};

function publicExportApproval(row: WalletExportApprovalRow): WalletExportApproval {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    walletAddress: row.wallet_address,
    message: row.message,
    expiresAt: row.expires_at,
  };
}

function fromRow(row: CompanyRow): CompanyAccount {
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    ownerUserId: row.owner_user_id,
    cfoUserId: row.cfo_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    wallet: {
      status: row.wallet_status,
      ...(row.wallet_address ? { address: row.wallet_address } : {}),
      ...(row.privy_wallet_id ? { privyWalletId: row.privy_wallet_id } : {}),
    },
    baselineWalletAddresses: JSON.parse(row.baseline_wallet_addresses) as string[],
  };
}

export function validateCompanyName(value: unknown): string {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new CompanyError("Enter a company name.", 400, "INVALID_COMPANY_NAME");
  }
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) {
    throw new CompanyError("Enter a company name between 1 and 80 characters.", 400, "INVALID_COMPANY_NAME");
  }
  return name;
}

export function validateCompanyRequestId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new CompanyError("A valid creation request is required.", 400, "INVALID_REQUEST_ID");
  }
  return value.toLowerCase();
}

function companyMissing(): never {
  throw new CompanyError("Company not found.", 404, "COMPANY_NOT_FOUND");
}

/** Stores public wallet identifiers and company metadata only; never signing material. */
export class CompanyStore {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS companies (
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
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_pending_company_per_owner
        ON companies(owner_user_id) WHERE wallet_status = 'pending';
      CREATE INDEX IF NOT EXISTS companies_by_owner ON companies(owner_user_id);
    `);
    // Serialize migration across connections. Existing records remain ordinary companies,
    // including any company that happens to have the Playground display name.
    this.transaction(() => {
      const columns = this.db.prepare("PRAGMA table_info(companies)").all() as { name: string }[];
      if (!columns.some((column) => column.name === "purpose")) {
        this.db.exec("ALTER TABLE companies ADD COLUMN purpose TEXT NOT NULL DEFAULT 'company' CHECK(purpose IN ('company', 'playground'))");
      }
      if (!columns.some((column) => column.name === "cfo_user_id")) {
        this.db.exec("ALTER TABLE companies ADD COLUMN cfo_user_id TEXT");
        // Existing companies were created by their Privy wallet controller. Assign
        // that person once; a deliberately cleared CFO is never restored on restart.
        this.db.exec("UPDATE companies SET cfo_user_id = owner_user_id");
      }
      this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS one_playground_per_owner
        ON companies(owner_user_id) WHERE purpose = 'playground'`);
      this.db.exec(`CREATE TABLE IF NOT EXISTS wallet_export_approvals (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        privy_wallet_id TEXT,
        message TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS wallet_export_approvals_expiry ON wallet_export_approvals(expires_at)`);
    });
  }

  close() { this.db.close(); }

  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private hasTable(name: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  }

  getForUser(userId: string, companyId: string): CompanyAccount | undefined {
    const row = this.db.prepare("SELECT * FROM companies WHERE id = ? AND owner_user_id = ?")
      .get(companyId, userId) as CompanyRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  requireCfoExportCompany(userId: string, companyId: string): CompanyAccount {
    const company = this.getForUser(userId, companyId) ?? companyMissing();
    if (company.cfoUserId !== userId) {
      throw new CompanyError("Only the company's Chief Financial Officer can export this wallet.", 403, "CFO_REQUIRED");
    }
    if (company.wallet.status !== "ready" || !company.wallet.address) {
      throw new CompanyError("Finish setting up the company wallet before exporting it.", 409, "COMPANY_WALLET_PENDING");
    }
    return company;
  }

  /** The caller must first verify this wallet against the CFO's current Privy account. */
  createWalletExportApproval(userId: string, companyId: string, verifiedWallet: { address: string; id?: string }): WalletExportApproval {
    return this.transaction(() => {
      const company = this.requireCfoExportCompany(userId, companyId);
      if (company.wallet.address!.toLowerCase() !== verifiedWallet.address.toLowerCase() ||
        (company.wallet.privyWalletId && company.wallet.privyWalletId !== verifiedWallet.id)) {
        throw new CompanyError("The company wallet changed. Request a new export approval.", 409, "EXPORT_WALLET_CHANGED");
      }
      const id = randomUUID();
      const now = Date.now();
      const expiresAt = new Date(now + 5 * 60 * 1000).toISOString();
      const message = buildWalletExportApprovalMessage({
        companyId, companyName: company.name, userId, walletAddress: company.wallet.address!,
        issuedAt: new Date(now).toISOString(), expiresAt, requestId: id,
      });
      // Approval records contain only public identifiers and the unsigned message.
      this.db.prepare("DELETE FROM wallet_export_approvals WHERE expires_at < ?")
        .run(new Date(now - 24 * 60 * 60 * 1000).toISOString());
      this.db.prepare(`INSERT INTO wallet_export_approvals
        (id, company_id, user_id, wallet_address, privy_wallet_id, message, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, companyId, userId, company.wallet.address!, company.wallet.privyWalletId ?? null, message, expiresAt);
      return { id, companyId, userId, walletAddress: company.wallet.address!, message, expiresAt };
    });
  }

  private requireWalletExportApproval(userId: string, companyId: string, approvalId: string): WalletExportApprovalRow {
    const company = this.requireCfoExportCompany(userId, companyId);
    const approval = this.db.prepare("SELECT * FROM wallet_export_approvals WHERE id = ? AND company_id = ? AND user_id = ?")
      .get(approvalId, companyId, userId) as WalletExportApprovalRow | undefined;
    if (!approval) throw new CompanyError("Request a new wallet export approval.", 404, "EXPORT_APPROVAL_NOT_FOUND");
    if (approval.consumed_at) throw new CompanyError("This export approval has already been used.", 409, "EXPORT_APPROVAL_USED");
    if (Date.parse(approval.expires_at) <= Date.now()) {
      throw new CompanyError("This export approval expired. Request a new approval.", 410, "EXPORT_APPROVAL_EXPIRED");
    }
    if (company.wallet.address!.toLowerCase() !== approval.wallet_address.toLowerCase() ||
      (company.wallet.privyWalletId ?? null) !== approval.privy_wallet_id) {
      throw new CompanyError("The company wallet changed. Request a new export approval.", 409, "EXPORT_WALLET_CHANGED");
    }
    return approval;
  }

  getWalletExportApproval(userId: string, companyId: string, approvalId: string): WalletExportApproval {
    return publicExportApproval(this.requireWalletExportApproval(userId, companyId, approvalId));
  }

  /** Atomically re-check authority, verify the signature, and consume a nonce once. */
  consumeWalletExportApproval(userId: string, companyId: string, approvalId: string, signature: string): WalletExportApproval {
    return this.transaction(() => {
      const approval = this.requireWalletExportApproval(userId, companyId, approvalId);
      if (!walletSignedExportApproval(approval.message, signature, approval.wallet_address)) {
        throw new CompanyError("Sign the export approval with this company's CFO wallet.", 403, "EXPORT_SIGNATURE_INVALID");
      }
      const now = new Date().toISOString();
      const result = this.db.prepare(`UPDATE wallet_export_approvals SET consumed_at = ?
        WHERE id = ? AND user_id = ? AND company_id = ? AND consumed_at IS NULL AND expires_at > ?
        AND EXISTS (SELECT 1 FROM companies WHERE id = ? AND owner_user_id = ? AND cfo_user_id = ?
          AND wallet_status = 'ready' AND wallet_address = ? COLLATE NOCASE AND privy_wallet_id IS ?)`)
        .run(now, approvalId, userId, companyId, now, companyId, userId, userId, approval.wallet_address, approval.privy_wallet_id);
      if (result.changes !== 1) {
        throw new CompanyError("The export approval is no longer valid. Request a new approval.", 409, "EXPORT_APPROVAL_INVALID");
      }
      return publicExportApproval(approval);
    });
  }

  listForUser(userId: string): CompanyAccount[] {
    return (this.db.prepare("SELECT * FROM companies WHERE owner_user_id = ? ORDER BY created_at, id")
      .all(userId) as CompanyRow[]).map(fromRow);
  }

  getPlaygroundForUser(userId: string): CompanyAccount | undefined {
    const row = this.db.prepare("SELECT * FROM companies WHERE owner_user_id = ? AND purpose = 'playground'")
      .get(userId) as CompanyRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  findRequest(userId: string, requestId: string, name: string): CompanyAccount | undefined {
    const row = this.db.prepare("SELECT * FROM companies WHERE owner_user_id = ? AND request_id = ?")
      .get(userId, requestId) as CompanyRow | undefined;
    if (!row) return undefined;
    if (row.request_name !== name || row.purpose !== "company") {
      throw new CompanyError("This creation request was already used for a different company name.", 409, "REQUEST_CONFLICT");
    }
    return fromRow(row);
  }

  reserve(userId: string, name: string, requestId: string, baselineWalletAddresses: string[]) {
    name = validateCompanyName(name);
    requestId = validateCompanyRequestId(requestId);
    return this.transaction(() => {
      const existing = this.findRequest(userId, requestId, name);
      if (existing) return { company: existing, created: false };
      const pending = this.db.prepare("SELECT * FROM companies WHERE owner_user_id = ? AND wallet_status = 'pending'")
        .get(userId) as CompanyRow | undefined;
      if (pending) {
        throw new CompanyError("Finish setting up your existing company wallet first.", 409, "COMPANY_SETUP_PENDING", fromRow(pending));
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      this.db.prepare(`INSERT INTO companies
        (id, name, owner_user_id, cfo_user_id, request_id, request_name, created_at, updated_at, wallet_status, baseline_wallet_addresses)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .run(id, name, userId, userId, requestId, name, now, now, JSON.stringify([...new Set(baselineWalletAddresses.map((address) => address.toLowerCase()))]));
      return { company: this.getForUser(userId, id)!, created: true };
    });
  }

  /** One private Playground reservation per verified owner, never a shared global wallet. */
  reservePlayground(userId: string, baselineWalletAddresses: string[]) {
    return this.transaction(() => {
      const existing = this.getPlaygroundForUser(userId);
      if (existing) return { company: existing, created: false };
      const pending = this.db.prepare("SELECT * FROM companies WHERE owner_user_id = ? AND wallet_status = 'pending'")
        .get(userId) as CompanyRow | undefined;
      if (pending) {
        throw new CompanyError("Finish setting up your existing company wallet first.", 409, "COMPANY_SETUP_PENDING", fromRow(pending));
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      this.db.prepare(`INSERT INTO companies
        (id, name, purpose, owner_user_id, cfo_user_id, request_id, request_name, created_at, updated_at, wallet_status, baseline_wallet_addresses)
        VALUES (?, ?, 'playground', ?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .run(id, PLAYGROUND_COMPANY_NAME, userId, userId, randomUUID(), PLAYGROUND_COMPANY_NAME, now, now,
          JSON.stringify([...new Set(baselineWalletAddresses.map((address) => address.toLowerCase()))]));
      return { company: this.getForUser(userId, id)!, created: true };
    });
  }

  rename(userId: string, companyId: string, name: string): CompanyAccount {
    name = validateCompanyName(name);
    const company = this.getForUser(userId, companyId) ?? companyMissing();
    if (company.purpose === "playground") {
      if (name === PLAYGROUND_COMPANY_NAME) return company;
      throw new CompanyError("The Playground account name is Snitchpay.co.", 409, "PLAYGROUND_NAME_FIXED");
    }
    const result = this.db.prepare("UPDATE companies SET name = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?")
      .run(name, new Date().toISOString(), companyId, userId);
    if (!result.changes) companyMissing();
    return this.getForUser(userId, companyId)!;
  }

  deleteForUser(userId: string, companyId: string): CompanyAccount {
    return this.transaction(() => {
      const company = this.getForUser(userId, companyId) ?? companyMissing();
      if (company.purpose === "playground") {
        throw new CompanyError("Snitchpay.co cannot be deleted.", 409, "PLAYGROUND_DELETE_FORBIDDEN");
      }

      // Company records can be created before the invoice and payout stores have
      // initialized their tables, so clean up only the dependent tables present.
      if (this.hasTable("invoice_payments") && this.hasTable("invoices")) {
        this.db.prepare(`DELETE FROM invoice_payments
          WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ?)`)
          .run(companyId);
      }
      if (this.hasTable("invoices")) {
        this.db.prepare("DELETE FROM invoices WHERE company_id = ?").run(companyId);
      }
      if (this.hasTable("company_payouts")) {
        this.db.prepare("DELETE FROM company_payouts WHERE company_id = ? AND owner_user_id = ?")
          .run(companyId, userId);
      }
      this.db.prepare("DELETE FROM wallet_export_approvals WHERE company_id = ?").run(companyId);

      const result = this.db.prepare("DELETE FROM companies WHERE id = ? AND owner_user_id = ? AND purpose = 'company'")
        .run(companyId, userId);
      if (result.changes !== 1) companyMissing();
      return company;
    });
  }

  isWalletBound(address: string): boolean {
    return !!this.db.prepare("SELECT id FROM companies WHERE wallet_address = ? COLLATE NOCASE").get(address);
  }

  /** Call only after the service has verified ownership with Privy's server API. */
  bindVerifiedWallet(userId: string, companyId: string, wallet: { address: string; id?: string }): CompanyAccount {
    return this.transaction(() => {
      const company = this.getForUser(userId, companyId) ?? companyMissing();
      if (company.wallet.status === "ready") {
        if (company.wallet.address?.toLowerCase() === wallet.address.toLowerCase()) return company;
        throw new CompanyError("This company already has a treasury wallet.", 409, "WALLET_ALREADY_LINKED");
      }
      if (company.baselineWalletAddresses.includes(wallet.address.toLowerCase())) {
        throw new CompanyError("Create a new wallet for this company.", 409, "WALLET_PREDATES_COMPANY");
      }
      if (this.isWalletBound(wallet.address) || (wallet.id && this.db.prepare("SELECT id FROM companies WHERE privy_wallet_id = ?").get(wallet.id))) {
        throw new CompanyError("This wallet is already linked to a company.", 409, "WALLET_ALREADY_LINKED");
      }
      this.db.prepare("UPDATE companies SET wallet_status = 'ready', wallet_address = ?, privy_wallet_id = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?")
        .run(wallet.address, wallet.id ?? null, new Date().toISOString(), companyId, userId);
      return this.getForUser(userId, companyId)!;
    });
  }
}

function dataDirectory(): string {
  if (typeof window !== "undefined") throw new Error("Company storage is server-only.");
  const configured = process.env.SNITCH_DATA_DIR?.trim();
  if (process.env.NODE_ENV === "production" && (!configured || !isAbsolute(configured) || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY)) {
    throw new CompanyError("Persistent company storage is not configured.", 503, "COMPANY_STORAGE_UNAVAILABLE");
  }
  return configured ? resolve(configured) : join(process.cwd(), ".data");
}

const globalStores = globalThis as typeof globalThis & { snitchCompanyStores?: Map<string, CompanyStore> };

export function getCompanyDatabasePath(): string {
  const directory = dataDirectory();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return join(directory, "snitch.sqlite");
}

export function getCompanyStore(): CompanyStore {
  const directory = dataDirectory();
  globalStores.snitchCompanyStores ??= new Map();
  let store = globalStores.snitchCompanyStores.get(directory);
  if (!store) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    store = new CompanyStore(join(directory, "snitch.sqlite"));
    globalStores.snitchCompanyStores.set(directory, store);
  }
  return store;
}

export const getCompanyForUser = (userId: string, companyId: string) => getCompanyStore().getForUser(userId, companyId);
export const listCompaniesForUser = (userId: string) => getCompanyStore().listForUser(userId);
export const reserveCompanyForUser = (userId: string, name: string, requestId: string, baselineWalletAddresses: string[]) => getCompanyStore().reserve(userId, name, requestId, baselineWalletAddresses);
export const bindVerifiedCompanyWallet = (userId: string, companyId: string, wallet: { address: string; id?: string }) => getCompanyStore().bindVerifiedWallet(userId, companyId, wallet);
