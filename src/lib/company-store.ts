import { randomUUID } from "node:crypto";
import { AsyncDatabase, getDatabaseKey, getDatabaseLocation } from "./database";

import type { CompanyAccount } from "./company-types";
import { isShowcaseCompany, SHOWCASE_COMPANY } from "./showcase-company";
import { buildWalletExportApprovalMessage, walletSignedExportApproval, type WalletExportApproval } from "./wallet-export-approval";

export const PLAYGROUND_COMPANY_NAME = SHOWCASE_COMPANY.name;

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
  private readonly db: AsyncDatabase;

  constructor(databasePath: string) {
    this.db = new AsyncDatabase(databasePath);
  }

  ready() { return this.db.ready(); }

  close() { this.db.close(); }

  private transaction<T>(fn: () => Promise<T>): Promise<T> {
    // AsyncDatabase gives this callback its own write transaction and query context.
    return this.db.transaction(fn);
  }

  private async hasTable(name: string): Promise<boolean> {
    return !!await this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  }

  async getForUser(userId: string, companyId: string): Promise<CompanyAccount | undefined> {
    const row = await this.db.prepare("SELECT * FROM companies WHERE id = ? AND owner_user_id = ?")
      .get(companyId, userId) as CompanyRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  async requireCfoExportCompany(userId: string, companyId: string): Promise<CompanyAccount> {
    const company = await this.getForUser(userId, companyId) ?? companyMissing();
    if (company.cfoUserId !== userId) {
      throw new CompanyError("Only the company's Chief Financial Officer can export this wallet.", 403, "CFO_REQUIRED");
    }
    if (company.wallet.status !== "ready" || !company.wallet.address) {
      throw new CompanyError("Finish setting up the company wallet before exporting it.", 409, "COMPANY_WALLET_PENDING");
    }
    return company;
  }

  /** The caller must first verify this wallet against the CFO's current Privy account. */
  async createWalletExportApproval(userId: string, companyId: string, verifiedWallet: { address: string; id?: string }): Promise<WalletExportApproval> {
    return this.transaction(async () => {
      const company = await this.requireCfoExportCompany(userId, companyId);
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
      await this.db.prepare("DELETE FROM wallet_export_approvals WHERE expires_at < ?")
        .run(new Date(now - 24 * 60 * 60 * 1000).toISOString());
      await this.db.prepare(`INSERT INTO wallet_export_approvals
        (id, company_id, user_id, wallet_address, privy_wallet_id, message, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, companyId, userId, company.wallet.address!, company.wallet.privyWalletId ?? null, message, expiresAt);
      return { id, companyId, userId, walletAddress: company.wallet.address!, message, expiresAt };
    });
  }

  private async requireWalletExportApproval(userId: string, companyId: string, approvalId: string): Promise<WalletExportApprovalRow> {
    const company = await this.requireCfoExportCompany(userId, companyId);
    const approval = await this.db.prepare("SELECT * FROM wallet_export_approvals WHERE id = ? AND company_id = ? AND user_id = ?")
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

  async getWalletExportApproval(userId: string, companyId: string, approvalId: string): Promise<WalletExportApproval> {
    return publicExportApproval(await this.requireWalletExportApproval(userId, companyId, approvalId));
  }

  /** Atomically re-check authority, verify the signature, and consume a nonce once. */
  async consumeWalletExportApproval(userId: string, companyId: string, approvalId: string, signature: string): Promise<WalletExportApproval> {
    return this.transaction(async () => {
      const approval = await this.requireWalletExportApproval(userId, companyId, approvalId);
      if (!walletSignedExportApproval(approval.message, signature, approval.wallet_address)) {
        throw new CompanyError("Sign the export approval with this company's CFO wallet.", 403, "EXPORT_SIGNATURE_INVALID");
      }
      const now = new Date().toISOString();
      const result = await this.db.prepare(`UPDATE wallet_export_approvals SET consumed_at = ?
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

  async listForUser(userId: string): Promise<CompanyAccount[]> {
    return (await this.db.prepare("SELECT * FROM companies WHERE owner_user_id = ? ORDER BY created_at, id")
      .all(userId) as CompanyRow[]).map(fromRow);
  }

  async getPlaygroundForUser(userId: string): Promise<CompanyAccount | undefined> {
    const row = await this.db.prepare("SELECT * FROM companies WHERE owner_user_id = ? AND purpose = 'playground'")
      .get(userId) as CompanyRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  async findRequest(userId: string, requestId: string, name: string): Promise<CompanyAccount | undefined> {
    const row = await this.db.prepare("SELECT * FROM companies WHERE owner_user_id = ? AND request_id = ?")
      .get(userId, requestId) as CompanyRow | undefined;
    if (!row) return undefined;
    if (row.request_name !== name || row.purpose !== "company") {
      throw new CompanyError("This creation request was already used for a different company name.", 409, "REQUEST_CONFLICT");
    }
    return fromRow(row);
  }

  async reserve(userId: string, name: string, requestId: string, baselineWalletAddresses: string[]) {
    name = validateCompanyName(name);
    requestId = validateCompanyRequestId(requestId);
    return this.transaction(async () => {
      const existing = await this.findRequest(userId, requestId, name);
      if (existing) return { company: existing, created: false };
      const pending = await this.db.prepare("SELECT * FROM companies WHERE owner_user_id = ? AND wallet_status = 'pending'")
        .get(userId) as CompanyRow | undefined;
      if (pending) {
        throw new CompanyError("Finish setting up your existing company wallet first.", 409, "COMPANY_SETUP_PENDING", fromRow(pending));
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      await this.db.prepare(`INSERT INTO companies
        (id, name, owner_user_id, cfo_user_id, request_id, request_name, created_at, updated_at, wallet_status, baseline_wallet_addresses)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .run(id, name, userId, userId, requestId, name, now, now, JSON.stringify([...new Set(baselineWalletAddresses.map((address) => address.toLowerCase()))]));
      return { company: (await this.getForUser(userId, id))!, created: true };
    });
  }

  /** Restore public metadata only after the service verifies the original CFO and wallet with Privy. */
  async restoreVerifiedShowcase(userId: string, verifiedWallet: { address: string; id?: string }) {
    if (userId !== SHOWCASE_COMPANY.cfoUserId) {
      throw new CompanyError("Only Snitchpay.co's Chief Financial Officer can connect its treasury.", 403, "CFO_REQUIRED");
    }
    if (verifiedWallet.address.toLowerCase() !== SHOWCASE_COMPANY.walletAddress.toLowerCase() ||
      verifiedWallet.id !== SHOWCASE_COMPANY.privyWalletId) {
      throw new CompanyError("The verified wallet does not match Snitchpay.co's treasury.", 403, "WALLET_NOT_OWNED");
    }
    return this.transaction(async () => {
      const existingRow = await this.db.prepare("SELECT * FROM companies WHERE id = ?").get(SHOWCASE_COMPANY.id) as CompanyRow | undefined;
      if (existingRow) {
        const company = fromRow(existingRow);
        // Never overwrite a changed controller, revoked CFO, or wallet association.
        if (!isShowcaseCompany(company)) {
          throw new CompanyError("Snitchpay.co's treasury configuration needs review.", 409, "SHOWCASE_CONFIGURATION_CONFLICT");
        }
        return { company, created: false };
      }
      if (await this.getPlaygroundForUser(userId) || await this.isWalletBound(verifiedWallet.address) ||
        await this.db.prepare("SELECT id FROM companies WHERE privy_wallet_id = ?").get(SHOWCASE_COMPANY.privyWalletId)) {
        throw new CompanyError("Snitchpay.co's treasury is already associated with another account record.", 409, "SHOWCASE_CONFIGURATION_CONFLICT");
      }
      const now = new Date().toISOString();
      await this.db.prepare(`INSERT INTO companies
        (id, name, purpose, owner_user_id, cfo_user_id, request_id, request_name, created_at, updated_at,
          wallet_status, wallet_address, privy_wallet_id, baseline_wallet_addresses)
        VALUES (?, ?, 'playground', ?, ?, ?, ?, ?, ?, 'ready', ?, ?, '[]')`)
        .run(SHOWCASE_COMPANY.id, PLAYGROUND_COMPANY_NAME, userId, userId, SHOWCASE_COMPANY.id,
          PLAYGROUND_COMPANY_NAME, SHOWCASE_COMPANY.createdAt, now, SHOWCASE_COMPANY.walletAddress, SHOWCASE_COMPANY.privyWalletId);
      return { company: (await this.getForUser(userId, SHOWCASE_COMPANY.id))!, created: true };
    });
  }

  async rename(userId: string, companyId: string, name: string): Promise<CompanyAccount> {
    name = validateCompanyName(name);
    return this.transaction(async () => {
      const company = await this.getForUser(userId, companyId) ?? companyMissing();
      if (company.purpose === "playground") {
        if (name === PLAYGROUND_COMPANY_NAME) return company;
        throw new CompanyError("The Playground account name is Snitchpay.co.", 409, "PLAYGROUND_NAME_FIXED");
      }
      const result = await this.db.prepare("UPDATE companies SET name = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?")
        .run(name, new Date().toISOString(), companyId, userId);
      if (!result.changes) companyMissing();
      return (await this.getForUser(userId, companyId))!;
    });
  }

  async deleteForUser(userId: string, companyId: string): Promise<CompanyAccount> {
    return this.transaction(async () => {
      const company = await this.getForUser(userId, companyId) ?? companyMissing();
      if (company.purpose === "playground") {
        throw new CompanyError("Snitchpay.co cannot be deleted.", 409, "PLAYGROUND_DELETE_FORBIDDEN");
      }

      // Company records can be created before the invoice and payout stores have
      // initialized their tables, so clean up only the dependent tables present.
      if (await this.hasTable("invoice_payments") && await this.hasTable("invoices")) {
        await this.db.prepare(`DELETE FROM invoice_payments
          WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ?)`)
          .run(companyId);
      }
      if (await this.hasTable("invoices")) {
        if (await this.hasTable("invoice_payment_submissions")) {
          await this.db.prepare(`DELETE FROM invoice_payment_submissions
            WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ?)`).run(companyId);
        }
        if (await this.hasTable("invoice_payment_attempts")) {
          await this.db.prepare(`DELETE FROM invoice_payment_attempts
            WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ?)`).run(companyId);
        }
        await this.db.prepare("DELETE FROM invoices WHERE company_id = ?").run(companyId);
      }
      if (await this.hasTable("company_payout_submissions")) {
        await this.db.prepare("DELETE FROM company_payout_submissions WHERE company_id = ? AND owner_user_id = ?").run(companyId, userId);
      }
      if (await this.hasTable("company_payouts")) {
        await this.db.prepare("DELETE FROM company_payouts WHERE company_id = ? AND owner_user_id = ?")
          .run(companyId, userId);
      }
      if (await this.hasTable("deleted_company_records")) {
        await this.db.prepare("DELETE FROM deleted_company_records WHERE company_id = ? AND owner_user_id = ?")
          .run(companyId, userId);
      }
      await this.db.prepare("DELETE FROM wallet_export_approvals WHERE company_id = ?").run(companyId);

      const result = await this.db.prepare("DELETE FROM companies WHERE id = ? AND owner_user_id = ? AND purpose = 'company'")
        .run(companyId, userId);
      if (result.changes !== 1) companyMissing();
      return company;
    });
  }

  async isWalletBound(address: string): Promise<boolean> {
    return !!await this.db.prepare("SELECT id FROM companies WHERE wallet_address = ? COLLATE NOCASE").get(address);
  }

  /** Call only after the service has verified ownership with Privy's server API. */
  async bindVerifiedWallet(userId: string, companyId: string, wallet: { address: string; id?: string }): Promise<CompanyAccount> {
    return this.transaction(async () => {
      const company = await this.getForUser(userId, companyId) ?? companyMissing();
      if (companyId !== SHOWCASE_COMPANY.id &&
        (wallet.address.toLowerCase() === SHOWCASE_COMPANY.walletAddress.toLowerCase() || wallet.id === SHOWCASE_COMPANY.privyWalletId)) {
        throw new CompanyError("This wallet belongs to Snitchpay.co's existing treasury.", 409, "WALLET_ALREADY_LINKED");
      }
      if (company.wallet.status === "ready") {
        if (company.wallet.address?.toLowerCase() === wallet.address.toLowerCase()) return company;
        throw new CompanyError("This company already has a treasury wallet.", 409, "WALLET_ALREADY_LINKED");
      }
      if (company.baselineWalletAddresses.includes(wallet.address.toLowerCase())) {
        throw new CompanyError("Create a new wallet for this company.", 409, "WALLET_PREDATES_COMPANY");
      }
      if (await this.isWalletBound(wallet.address) || (wallet.id && await this.db.prepare("SELECT id FROM companies WHERE privy_wallet_id = ?").get(wallet.id))) {
        throw new CompanyError("This wallet is already linked to a company.", 409, "WALLET_ALREADY_LINKED");
      }
      await this.db.prepare("UPDATE companies SET wallet_status = 'ready', wallet_address = ?, privy_wallet_id = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?")
        .run(wallet.address, wallet.id ?? null, new Date().toISOString(), companyId, userId);
      return (await this.getForUser(userId, companyId))!;
    });
  }
}

const globalStores = globalThis as typeof globalThis & { snitchCompanyStores?: Map<string, CompanyStore> };

// Retained for consumers sharing the same local or managed database location.
export function getCompanyDatabasePath(): string {
  return getDatabaseLocation();
}

export function getCompanyStore(): CompanyStore {
  const location = getDatabaseLocation();
  const key = getDatabaseKey();
  globalStores.snitchCompanyStores ??= new Map();
  let store = globalStores.snitchCompanyStores.get(key);
  if (!store) {
    store = new CompanyStore(location);
    globalStores.snitchCompanyStores.set(key, store);
  }
  return store;
}

export const getCompanyForUser = (userId: string, companyId: string) => getCompanyStore().getForUser(userId, companyId);
export const listCompaniesForUser = (userId: string) => getCompanyStore().listForUser(userId);
export const reserveCompanyForUser = (userId: string, name: string, requestId: string, baselineWalletAddresses: string[]) => getCompanyStore().reserve(userId, name, requestId, baselineWalletAddresses);
export const bindVerifiedCompanyWallet = (userId: string, companyId: string, wallet: { address: string; id?: string }) => getCompanyStore().bindVerifiedWallet(userId, companyId, wallet);
