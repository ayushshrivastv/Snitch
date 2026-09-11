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
