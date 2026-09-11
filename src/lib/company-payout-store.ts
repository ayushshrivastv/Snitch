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
      if (existing && (existing.owner_user_id !== userId || existing.company_id !== companyId || existing.sender !== sender || existing.recipient !== recipient || existing.amount !== amount)) {
        throw new CompanyError("This transaction is already recorded with different payout details.", 409, "PAYOUT_CONFLICT");
      }
      const now = new Date().toISOString();
      const id = existing?.id ?? randomUUID();
      const receiverName = payment.receiverName ?? existing?.receiver_name ?? "Unnamed receiver";
      const memo = payment.memo ?? existing?.memo ?? "";
      await this.db.prepare(`INSERT INTO company_payouts
        (id, company_id, owner_user_id, transaction_hash, sender, recipient, amount, receiver_name, memo, status, created_at, updated_at, block_number, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(transaction_hash) DO UPDATE SET receiver_name=excluded.receiver_name, memo=excluded.memo,
          status=excluded.status, updated_at=excluded.updated_at, block_number=excluded.block_number, confirmed_at=excluded.confirmed_at`)
        .run(id, companyId, userId, hash, sender, recipient, amount, receiverName, memo,
          payment.confirmation.status, existing?.created_at ?? now, now, payment.confirmation.blockNumber ?? null, payment.confirmation.confirmedAt ?? null);
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
