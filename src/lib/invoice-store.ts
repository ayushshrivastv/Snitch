import { AsyncDatabase, getDatabaseKey } from "./database";
import type { Invoice } from "./invoices";
import type { ConfirmedInvoicePayment } from "./payment-confirmations";

export type CompanyInvoiceRecord = Invoice & {
  status: "Incomplete" | "Succeeded";
  payment: ConfirmedInvoicePayment | null;
};
export class PaymentConfirmationConflictError extends Error {}
export class InvoiceCompanyConflictError extends Error {}
type JsonRow = { payload: string };
export type InvoicePaymentAttempt = {
  invoiceId: string;
  transactionHash: string;
  status: "Incomplete" | "Failed" | "Succeeded";
  createdAt: string;
};

/** Public invoice data and verified receipts only. Wallet signing material never enters this store. */
export class InvoiceStore {
  private readonly db: AsyncDatabase;

  constructor(path?: string) { this.db = new AsyncDatabase(path); }

  close() { this.db.close(); }

  async saveInvoice(invoice: Invoice): Promise<Invoice> {
    const values = [invoice.id, invoice.ownerId ?? null, invoice.companyId ?? null, invoice.createdAt, JSON.stringify(invoice)];
    if (invoice.companyId !== undefined) {
      // The route's company snapshot can become stale while awaiting other work.
      // Verify ownership and the receiving wallet in the same atomic statement as
      // the insert, so deletion or wallet changes cannot leave an orphan invoice.
      const result = await this.db.prepare(`INSERT INTO invoices (id, owner_id, company_id, created_at, payload)
        SELECT ?, ?, ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM companies WHERE id = ? AND owner_user_id = ?
            AND wallet_status = 'ready' AND wallet_address = ? COLLATE NOCASE
        )`).run(...values, invoice.companyId ?? null, invoice.ownerId ?? null, invoice.treasury ?? null);
      if (result.changes !== 1) {
        throw new InvoiceCompanyConflictError("The company treasury changed or is no longer available. Refresh the company before creating an invoice.");
      }
    } else {
      // Existing non-company invoices retain their original storage behavior.
      await this.db.prepare("INSERT INTO invoices (id, owner_id, company_id, created_at, payload) VALUES (?, ?, ?, ?, ?)").run(...values);
    }
    return invoice;
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const row = await this.db.prepare("SELECT payload FROM invoices WHERE id = ?").get(id) as JsonRow | undefined;
    return row ? Object.freeze(JSON.parse(row.payload) as Invoice) : undefined;
  }

  async getInvoiceForOwner(id: string, ownerId: string): Promise<Invoice | undefined> {
    if (!ownerId) return undefined;
    const row = await this.db.prepare("SELECT payload FROM invoices WHERE id = ? AND owner_id = ?").get(id, ownerId) as JsonRow | undefined;
    return row ? Object.freeze(JSON.parse(row.payload) as Invoice) : undefined;
  }

  async listForCompany(ownerId: string, companyId: string): Promise<CompanyInvoiceRecord[]> {
    const rows = await this.db.prepare(`SELECT invoices.payload, invoice_payments.payload AS payment_payload
      FROM invoices LEFT JOIN invoice_payments ON invoice_payments.invoice_id = invoices.id
      WHERE invoices.owner_id = ? AND invoices.company_id = ? ORDER BY invoices.created_at DESC, invoices.id DESC`)
      .all(ownerId, companyId) as (JsonRow & { payment_payload: string | null })[];
    return rows.map(row => {
      const invoice = JSON.parse(row.payload) as Invoice;
      const payment = row.payment_payload ? JSON.parse(row.payment_payload) as ConfirmedInvoicePayment : null;
      return { ...invoice, status: payment ? "Succeeded" : "Incomplete", payment };
    });
  }

  async getPayment(invoiceId: string): Promise<ConfirmedInvoicePayment | undefined> {
    const row = await this.db.prepare("SELECT payload FROM invoice_payments WHERE invoice_id = ?").get(invoiceId) as JsonRow | undefined;
    return row ? JSON.parse(row.payload) as ConfirmedInvoicePayment : undefined;
  }

  async getInvoiceIdForTransaction(hash: string): Promise<string | undefined> {
    const row = await this.db.prepare("SELECT invoice_id FROM invoice_payments WHERE transaction_hash = ? COLLATE NOCASE").get(hash) as { invoice_id: string } | undefined;
    return row?.invoice_id;
  }

  /** Untrusted hashes are recovery hints only and never make an invoice appear paid or locked. */
  async savePaymentSubmission(invoiceId: string, hash: string): Promise<void> {
    await this.db.transaction(async () => {
      if (!await this.getInvoice(invoiceId)) throw new PaymentConfirmationConflictError("Invoice not found.");
      const now = new Date().toISOString();
      const oldest = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await this.db.prepare("DELETE FROM invoice_payment_submissions WHERE invoice_id = ? AND created_at < ?").run(invoiceId, oldest);
      await this.db.prepare(`INSERT INTO invoice_payment_submissions (invoice_id, transaction_hash, created_at, next_check_at)
        SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM invoice_payment_submissions WHERE invoice_id = ?) < 32
        ON CONFLICT(invoice_id, transaction_hash) DO NOTHING`).run(invoiceId, hash.toLowerCase(), now, now, invoiceId);
    });
  }

  async getDuePaymentSubmissions(invoiceId: string): Promise<string[]> {
    const rows = await this.db.prepare(`SELECT transaction_hash FROM invoice_payment_submissions
      WHERE invoice_id = ? AND next_check_at <= ? AND created_at >= ?
      ORDER BY next_check_at, created_at LIMIT 4`).all(invoiceId, new Date().toISOString(), new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    return rows.map(row => row.transaction_hash as string);
  }

  async deferPaymentSubmission(invoiceId: string, hash: string): Promise<void> {
    const row = await this.db.prepare("SELECT attempts FROM invoice_payment_submissions WHERE invoice_id = ? AND transaction_hash = ?").get(invoiceId, hash.toLowerCase());
    if (!row) return;
    const delay = Math.min(300_000, 5_000 * 2 ** Math.min(Number(row.attempts), 6));
    await this.db.prepare(`UPDATE invoice_payment_submissions SET attempts = attempts + 1, next_check_at = ?
      WHERE invoice_id = ? AND transaction_hash = ?`).run(new Date(Date.now() + delay).toISOString(), invoiceId, hash.toLowerCase());
  }

  async removePaymentSubmission(invoiceId: string, hash: string): Promise<void> {
    await this.db.prepare("DELETE FROM invoice_payment_submissions WHERE invoice_id = ? AND transaction_hash = ?").run(invoiceId, hash.toLowerCase());
  }

  /** Only call after verifying the transaction's chain, amount, treasury, and invoice calldata. */
  async savePaymentAttempt(invoiceId: string, hash: string): Promise<void> {
    const transactionHash = hash.toLowerCase();
    await this.db.transaction(async () => {
      const invoice = await this.getInvoice(invoiceId);
      if (!invoice) throw new PaymentConfirmationConflictError("Invoice not found.");
      const linked = await this.db.prepare("SELECT invoice_id FROM invoice_payment_attempts WHERE transaction_hash = ?").get(transactionHash);
      if (linked && linked.invoice_id !== invoiceId) throw new PaymentConfirmationConflictError("This transaction is already tied to another invoice.");
      const confirmed = await this.getInvoiceIdForTransaction(transactionHash);
      if (confirmed && confirmed !== invoiceId) throw new PaymentConfirmationConflictError("This transaction is already tied to another invoice.");
      const now = new Date().toISOString();
      await this.db.prepare(`INSERT INTO invoice_payment_attempts (transaction_hash, invoice_id, status, created_at, updated_at)
        VALUES (?, ?, 'Incomplete', ?, ?) ON CONFLICT(transaction_hash) DO NOTHING`)
        .run(transactionHash, invoiceId, now, now);
      await this.db.prepare("DELETE FROM invoice_payment_submissions WHERE transaction_hash = ?").run(transactionHash);
    });
  }

  async getPaymentAttempts(invoiceId: string): Promise<InvoicePaymentAttempt[]> {
    const rows = await this.db.prepare(`SELECT invoice_id, transaction_hash, status, created_at FROM invoice_payment_attempts
      WHERE invoice_id = ? ORDER BY created_at DESC, transaction_hash`).all(invoiceId);
    return rows.map(row => ({ invoiceId: row.invoice_id as string, transactionHash: row.transaction_hash as string,
      status: row.status as InvoicePaymentAttempt["status"], createdAt: row.created_at as string }));
  }

  async markPaymentAttemptFailed(invoiceId: string, hash: string): Promise<void> {
    await this.db.prepare(`UPDATE invoice_payment_attempts SET status = 'Failed', updated_at = ?
      WHERE invoice_id = ? AND transaction_hash = ? AND status = 'Incomplete'`)
      .run(new Date().toISOString(), invoiceId, hash.toLowerCase());
  }

  async savePayment(payment: ConfirmedInvoicePayment): Promise<ConfirmedInvoicePayment> {
    const transactionHash = payment.transactionHash.toLowerCase();
    return this.db.transaction(async () => {
      const linked = await this.getInvoiceIdForTransaction(transactionHash);
      if (linked && linked !== payment.invoiceId) throw new PaymentConfirmationConflictError("This transaction is already tied to another invoice.");
      const existing = await this.getPayment(payment.invoiceId);
      if (existing && existing.transactionHash !== transactionHash) throw new PaymentConfirmationConflictError("This invoice already has a confirmed payment.");
      if (!await this.getInvoice(payment.invoiceId)) throw new PaymentConfirmationConflictError("Invoice not found.");
      const confirmed = existing ?? { ...payment, transactionHash };
      if (!existing) {
        await this.db.prepare("INSERT INTO invoice_payments (invoice_id, transaction_hash, payload) VALUES (?, ?, ?)")
          .run(payment.invoiceId, transactionHash, JSON.stringify(confirmed));
      }
      await this.db.prepare(`UPDATE invoice_payment_attempts SET status = 'Succeeded', updated_at = ?
        WHERE invoice_id = ? AND transaction_hash = ?`).run(new Date().toISOString(), payment.invoiceId, transactionHash);
      await this.db.prepare("DELETE FROM invoice_payment_submissions WHERE invoice_id = ?").run(payment.invoiceId);
      return confirmed;
    });
  }
}

const stores = globalThis as typeof globalThis & { snitchInvoiceStores?: Map<string, InvoiceStore> };
export function getInvoiceStore(): InvoiceStore {
  const path = getDatabaseKey();
  stores.snitchInvoiceStores ??= new Map();
  let store = stores.snitchInvoiceStores.get(path);
  if (!store) {
    store = new InvoiceStore();
    stores.snitchInvoiceStores.set(path, store);
  }
  return store;
}

export function closeInvoiceStore() {
  const path = getDatabaseKey();
  stores.snitchInvoiceStores?.get(path)?.close();
  stores.snitchInvoiceStores?.delete(path);
}
