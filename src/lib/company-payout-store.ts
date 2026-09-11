import { randomUUID } from "node:crypto";
import { formatEther } from "ethers";

import { CompanyError } from "./company-store";
import { AsyncDatabase, getDatabaseKey } from "./database";
import type { CompanyPayoutRecord } from "./company-payout-types";
import type { CompanyPaymentConfirmation } from "../components/auth/company-payment-request";
import { getEthereumExplorerUrl, isEthereumTransactionHash, normalizeEthereumAddress, parseEthAmount } from "../../services/ethereum";

type PayoutRow = {
  id: string; company_id: string; owner_user_id: string; transaction_hash: string;
  sender: string; recipient: string; amount: string; receiver_name: string; memo: string;
  status: CompanyPayoutRecord["status"]; created_at: string; updated_at: string;
  block_number: number | null; confirmed_at: string | null;
};

type SubmissionRow = Omit<PayoutRow, "status" | "block_number" | "confirmed_at"> & {
  attempts: number; next_check_at: string;
};

export type CompanyPayoutSubmission = { payout: CompanyPayoutRecord; attempts: number; nextCheckAt: string };

function fromSubmission(row: SubmissionRow): CompanyPayoutSubmission {
  return { payout: fromRow({ ...row, status: "Incomplete", block_number: null, confirmed_at: null }),
    attempts: row.attempts, nextCheckAt: row.next_check_at };
}

type PayoutInput = { from: string; to: string; amount: string; receiverName?: string; memo?: string };

function matchesTransfer(row: PayoutRow | SubmissionRow, userId: string, companyId: string, from: string, to: string, amount: string) {
  return row.owner_user_id === userId && row.company_id === companyId && row.sender === from && row.recipient === to && row.amount === amount;
}

function payoutConflict(): never {
  throw new CompanyError("This transaction is already recorded with different payout details.", 409, "PAYOUT_CONFLICT");
}

function fromRow(row: PayoutRow): CompanyPayoutRecord {
  return {
    id: row.id, companyId: row.company_id, transactionHash: row.transaction_hash,
    from: row.sender, to: row.recipient, amount: row.amount, receiverName: row.receiver_name,
    memo: row.memo, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
    ...(row.block_number === null ? {} : { blockNumber: row.block_number }),
    ...(row.confirmed_at === null ? {} : { confirmedAt: row.confirmed_at }),
    explorerUrl: getEthereumExplorerUrl(row.transaction_hash), currency: "ETH", network: "Ethereum Sepolia",
  };
}

export class CompanyPayoutStore {
  private readonly db: AsyncDatabase;
  constructor(databasePath?: string) { this.db = new AsyncDatabase(databasePath); }
  close() { this.db.close(); }

  private async ownedWallet(userId: string, companyId: string): Promise<string> {
    const company = await this.db.prepare("SELECT wallet_status, wallet_address FROM companies WHERE id = ? AND owner_user_id = ?")
      .get(companyId, userId) as { wallet_status: string; wallet_address: string | null } | undefined;
    if (!company) throw new CompanyError("Company not found.", 404, "COMPANY_NOT_FOUND");
    if (company.wallet_status !== "ready" || !company.wallet_address) throw new CompanyError("Finish setting up your company wallet first.", 409, "COMPANY_WALLET_PENDING");
    return normalizeEthereumAddress(company.wallet_address);
  }

  async listForCompany(userId: string, companyId: string): Promise<CompanyPayoutRecord[]> {
    await this.ownedWallet(userId, companyId);
    return (await this.db.prepare("SELECT * FROM company_payouts WHERE owner_user_id = ? AND company_id = ? ORDER BY created_at DESC, id DESC")
      .all(userId, companyId) as PayoutRow[]).map(fromRow);
  }

  async findForCompany(userId: string, companyId: string, transactionHash: string): Promise<CompanyPayoutRecord | undefined> {
    await this.ownedWallet(userId, companyId);
    const row = await this.db.prepare("SELECT * FROM company_payouts WHERE owner_user_id = ? AND company_id = ? AND transaction_hash = ? COLLATE NOCASE")
      .get(userId, companyId, transactionHash) as PayoutRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  async listSubmissionsForCompany(userId: string, companyId: string): Promise<CompanyPayoutSubmission[]> {
    await this.ownedWallet(userId, companyId);
    const rows = await this.db.prepare("SELECT * FROM company_payout_submissions WHERE owner_user_id = ? AND company_id = ? ORDER BY created_at DESC, id DESC")
      .all(userId, companyId) as SubmissionRow[];
    return rows.map(fromSubmission);
  }

  async findSubmissionForCompany(userId: string, companyId: string, transactionHash: string): Promise<CompanyPayoutSubmission | undefined> {
    await this.ownedWallet(userId, companyId);
    const row = await this.db.prepare("SELECT * FROM company_payout_submissions WHERE owner_user_id = ? AND company_id = ? AND transaction_hash = ? COLLATE NOCASE")
      .get(userId, companyId, transactionHash) as SubmissionRow | undefined;
    return row ? fromSubmission(row) : undefined;
  }

  /** An authenticated recovery hint, never evidence that funds moved. */
  async saveSubmission(userId: string, companyId: string, payment: PayoutInput & { transactionHash: string }): Promise<CompanyPayoutRecord> {
    const from = normalizeEthereumAddress(payment.from);
    const to = normalizeEthereumAddress(payment.to);
    const amount = formatEther(parseEthAmount(payment.amount));
    if (!isEthereumTransactionHash(payment.transactionHash)) throw new CompanyError("Invalid payout transaction.", 400, "INVALID_PAYMENT");
    const hash = payment.transactionHash.toLowerCase();
    return this.db.transaction(async () => {
      if (await this.ownedWallet(userId, companyId) !== from) throw new CompanyError("This payment does not belong to the company wallet.", 403, "PAYMENT_WALLET_MISMATCH");
      const verified = await this.db.prepare("SELECT * FROM company_payouts WHERE transaction_hash = ? COLLATE NOCASE").get(hash) as PayoutRow | undefined;
      if (verified) {
        if (!matchesTransfer(verified, userId, companyId, from, to, amount)) payoutConflict();
        return fromRow(verified);
      }
      const existing = await this.db.prepare("SELECT * FROM company_payout_submissions WHERE transaction_hash = ? COLLATE NOCASE").get(hash) as SubmissionRow | undefined;
      if (existing && !matchesTransfer(existing, userId, companyId, from, to, amount)) payoutConflict();
      if (!existing) {
        const count = await this.db.prepare("SELECT COUNT(*) AS count FROM company_payout_submissions WHERE owner_user_id = ? AND company_id = ?")
          .get(userId, companyId) as { count: number };
        if (count.count >= 100) throw new CompanyError("Too many payouts are awaiting verification. Keep this transaction hash and retry saving shortly; do not send it again.", 429, "PAYOUT_RECOVERY_FULL");
      }
      const now = new Date().toISOString();
      const id = existing?.id ?? randomUUID();
      await this.db.prepare(`INSERT INTO company_payout_submissions
        (id, company_id, owner_user_id, transaction_hash, sender, recipient, amount, receiver_name, memo, created_at, updated_at, attempts, next_check_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        ON CONFLICT(transaction_hash) DO UPDATE SET receiver_name=excluded.receiver_name, memo=excluded.memo, updated_at=excluded.updated_at`)
        .run(id, companyId, userId, hash, from, to, amount, payment.receiverName ?? existing?.receiver_name ?? "Unnamed receiver",
          payment.memo ?? existing?.memo ?? "", existing?.created_at ?? now, now, now);
      return fromSubmission(await this.db.prepare("SELECT * FROM company_payout_submissions WHERE id = ?").get(id) as SubmissionRow).payout;
    });
  }

  async deferSubmission(userId: string, companyId: string, transactionHash: string): Promise<void> {
    await this.db.transaction(async () => {
      await this.ownedWallet(userId, companyId);
      const row = await this.db.prepare("SELECT attempts FROM company_payout_submissions WHERE owner_user_id = ? AND company_id = ? AND transaction_hash = ? COLLATE NOCASE")
        .get(userId, companyId, transactionHash) as { attempts: number } | undefined;
      if (!row) return;
      const now = Date.now();
      const delay = Math.min(300_000, 5000 * 2 ** Math.min(row.attempts, 6));
      await this.db.prepare("UPDATE company_payout_submissions SET attempts = attempts + 1, updated_at = ?, next_check_at = ? WHERE owner_user_id = ? AND company_id = ? AND transaction_hash = ? COLLATE NOCASE")
        .run(new Date(now).toISOString(), new Date(now + delay).toISOString(), userId, companyId, transactionHash);
    });
  }

  async discardSubmission(userId: string, companyId: string, transactionHash: string): Promise<void> {
    await this.ownedWallet(userId, companyId);
    await this.db.prepare("DELETE FROM company_payout_submissions WHERE owner_user_id = ? AND company_id = ? AND transaction_hash = ? COLLATE NOCASE")
      .run(userId, companyId, transactionHash);
  }

  /** Call only after the RPC reader has observed a matching company transaction. */
  async saveVerified(userId: string, companyId: string, payment: {
    from: string; to: string; amount: string; receiverName?: string; memo?: string;
    confirmation: CompanyPaymentConfirmation;
  }): Promise<CompanyPayoutRecord> {
    const sender = normalizeEthereumAddress(payment.from);
    const recipient = normalizeEthereumAddress(payment.to);
    const amount = formatEther(parseEthAmount(payment.amount));
    if (!isEthereumTransactionHash(payment.confirmation.transactionHash)) throw new CompanyError("Invalid payout transaction.", 400, "INVALID_PAYMENT");
    const hash = payment.confirmation.transactionHash.toLowerCase();
    return this.db.transaction(async () => {
      if (await this.ownedWallet(userId, companyId) !== sender) throw new CompanyError("This payment does not belong to the company wallet.", 403, "PAYMENT_WALLET_MISMATCH");
      const existing = await this.db.prepare("SELECT * FROM company_payouts WHERE transaction_hash = ? COLLATE NOCASE").get(hash) as PayoutRow | undefined;
      const submission = await this.db.prepare("SELECT * FROM company_payout_submissions WHERE transaction_hash = ? COLLATE NOCASE").get(hash) as SubmissionRow | undefined;
      if (existing && !matchesTransfer(existing, userId, companyId, sender, recipient, amount)) payoutConflict();
      if (submission && !matchesTransfer(submission, userId, companyId, sender, recipient, amount)) payoutConflict();
      const now = new Date().toISOString();
      const id = existing?.id ?? submission?.id ?? randomUUID();
      const receiverName = payment.receiverName ?? existing?.receiver_name ?? submission?.receiver_name ?? "Unnamed receiver";
      const memo = payment.memo ?? existing?.memo ?? submission?.memo ?? "";
      // Concurrent refreshes can finish out of order. Once a mined receipt has
      // been recorded, an older mempool lookup must not erase its confirmation.
      const preserveConfirmation = existing && existing.status !== "Incomplete" && payment.confirmation.status === "Incomplete";
      const status = preserveConfirmation ? existing.status : payment.confirmation.status;
      const blockNumber = preserveConfirmation ? existing.block_number : payment.confirmation.blockNumber ?? null;
      const confirmedAt = preserveConfirmation ? existing.confirmed_at : payment.confirmation.confirmedAt ?? null;
      await this.db.prepare(`INSERT INTO company_payouts
        (id, company_id, owner_user_id, transaction_hash, sender, recipient, amount, receiver_name, memo, status, created_at, updated_at, block_number, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(transaction_hash) DO UPDATE SET receiver_name=excluded.receiver_name, memo=excluded.memo,
          status=excluded.status, updated_at=excluded.updated_at, block_number=excluded.block_number, confirmed_at=excluded.confirmed_at`)
        .run(id, companyId, userId, hash, sender, recipient, amount, receiverName, memo,
          status, existing?.created_at ?? submission?.created_at ?? now, now, blockNumber, confirmedAt);
      await this.db.prepare("DELETE FROM company_payout_submissions WHERE transaction_hash = ? COLLATE NOCASE").run(hash);
      const result = fromRow(await this.db.prepare("SELECT * FROM company_payouts WHERE id = ?").get(id) as PayoutRow);
      return result;
    });
  }
}

const globalStores = globalThis as typeof globalThis & { snitchCompanyPayoutStores?: Map<string, CompanyPayoutStore> };
export function getCompanyPayoutStore(): CompanyPayoutStore {
  const path = getDatabaseKey();
  globalStores.snitchCompanyPayoutStores ??= new Map();
  let store = globalStores.snitchCompanyPayoutStores.get(path);
  if (!store) {
    store = new CompanyPayoutStore();
    globalStores.snitchCompanyPayoutStores.set(path, store);
  }
  return store;
}
