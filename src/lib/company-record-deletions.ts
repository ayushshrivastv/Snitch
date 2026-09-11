import { isEthereumTransactionHash } from "../../services/ethereum";
import { CompanyError } from "./company-store";
import { AsyncDatabase, getDatabaseKey } from "./database";

export type CompanyRecordType = "transaction" | "payout";
export type DeletedCompanyRecords = { transactions: string[]; payouts: string[] };

function validId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 180 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new CompanyError(`A valid ${label} is required.`, 400, "INVALID_RECORD_ID");
  }
  return value.trim();
}

export class CompanyRecordDeletionStore {
  private readonly db: AsyncDatabase;
  constructor(location?: string) { this.db = new AsyncDatabase(location); }
  close() { this.db.close(); }

  private async requireCompany(userId: string, companyId: string) {
    if (!await this.db.prepare("SELECT id FROM companies WHERE id = ? AND owner_user_id = ?").get(companyId, userId)) {
      throw new CompanyError("Company not found.", 404, "COMPANY_NOT_FOUND");
    }
  }

  async list(userId: string, companyId: string): Promise<DeletedCompanyRecords> {
    await this.requireCompany(userId, companyId);
    const rows = await this.db.prepare(`SELECT record_type, record_id FROM deleted_company_records
      WHERE owner_user_id = ? AND company_id = ? ORDER BY deleted_at`).all(userId, companyId);
    return {
      transactions: rows.filter(row => row.record_type === "transaction").map(row => row.record_id as string),
      payouts: rows.filter(row => row.record_type === "payout").map(row => row.record_id as string),
    };
  }

  async delete(userId: string, companyId: string, input: {
    type: CompanyRecordType; recordId: unknown; invoiceId?: unknown; transactionHash?: unknown;
  }): Promise<string> {
    const recordId = validId(input.recordId, "record identifier");
    if (input.type !== "transaction" && input.type !== "payout") {
      throw new CompanyError("Choose a transaction or payout record.", 400, "INVALID_RECORD_TYPE");
    }
    const invoiceId = input.invoiceId === undefined ? undefined : validId(input.invoiceId, "invoice identifier");
    const transactionHash = input.transactionHash === undefined ? undefined : validId(input.transactionHash, "transaction hash").toLowerCase();
    if (transactionHash && !isEthereumTransactionHash(transactionHash)) {
      throw new CompanyError("A valid transaction hash is required.", 400, "INVALID_TRANSACTION_HASH");
    }
    return this.db.transaction(async () => {
      await this.requireCompany(userId, companyId);
      if (input.type === "transaction" && invoiceId) {
        const owned = await this.db.prepare("SELECT id FROM invoices WHERE id = ? AND owner_id = ? AND company_id = ?")
          .get(invoiceId, userId, companyId);
        if (owned) {
          await this.db.prepare("DELETE FROM invoice_payments WHERE invoice_id = ?").run(invoiceId);
          await this.db.prepare("DELETE FROM invoice_payment_attempts WHERE invoice_id = ?").run(invoiceId);
          await this.db.prepare("DELETE FROM invoice_payment_submissions WHERE invoice_id = ?").run(invoiceId);
          await this.db.prepare("DELETE FROM invoices WHERE id = ? AND owner_id = ? AND company_id = ?").run(invoiceId, userId, companyId);
        }
      }
      if (input.type === "payout" && transactionHash) {
        await this.db.prepare(`DELETE FROM company_payouts
          WHERE owner_user_id = ? AND company_id = ? AND transaction_hash = ? COLLATE NOCASE`).run(userId, companyId, transactionHash);
        await this.db.prepare(`DELETE FROM company_payout_submissions
          WHERE owner_user_id = ? AND company_id = ? AND transaction_hash = ? COLLATE NOCASE`).run(userId, companyId, transactionHash);
      }
      await this.db.prepare(`INSERT INTO deleted_company_records
        (owner_user_id, company_id, record_type, record_id, transaction_hash, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_user_id, company_id, record_type, record_id)
        DO UPDATE SET transaction_hash=excluded.transaction_hash, deleted_at=excluded.deleted_at`)
        .run(userId, companyId, input.type, recordId, transactionHash ?? null, new Date().toISOString());
      return recordId;
    });
  }

}

const stores = globalThis as typeof globalThis & { snitchCompanyRecordDeletionStores?: Map<string, CompanyRecordDeletionStore> };
export function getCompanyRecordDeletionStore() {
  const key = getDatabaseKey();
  stores.snitchCompanyRecordDeletionStores ??= new Map();
  let store = stores.snitchCompanyRecordDeletionStores.get(key);
  if (!store) { store = new CompanyRecordDeletionStore(); stores.snitchCompanyRecordDeletionStores.set(key, store); }
  return store;
}
