import { DatabaseSync } from "node:sqlite";
import { getCompanyDatabasePath } from "./company-store";
import type { Invoice } from "./invoices";
import type { ConfirmedInvoicePayment } from "./payment-confirmations";

export type CompanyInvoiceRecord = Invoice & {
  status: "Incomplete" | "Succeeded";
  payment: ConfirmedInvoicePayment | null;
};
export class PaymentConfirmationConflictError extends Error {}
type JsonRow = { payload: string };

/** Public invoice data and verified receipts only. Wallet signing material never enters this store. */
export class InvoiceStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        company_id TEXT,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS invoices_by_company ON invoices(owner_id, company_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS invoice_payments (
        invoice_id TEXT PRIMARY KEY,
        transaction_hash TEXT COLLATE NOCASE NOT NULL UNIQUE,
        payload TEXT NOT NULL
      );
    `);
  }

  close() { this.db.close(); }

  saveInvoice(invoice: Invoice): Invoice {
    this.db.prepare("INSERT INTO invoices (id, owner_id, company_id, created_at, payload) VALUES (?, ?, ?, ?, ?)")
      .run(invoice.id, invoice.ownerId ?? null, invoice.companyId ?? null, invoice.createdAt, JSON.stringify(invoice));
    return invoice;
  }

  getInvoice(id: string): Invoice | undefined {
    const row = this.db.prepare("SELECT payload FROM invoices WHERE id = ?").get(id) as JsonRow | undefined;
    return row ? Object.freeze(JSON.parse(row.payload) as Invoice) : undefined;
  }

  getInvoiceForOwner(id: string, ownerId: string): Invoice | undefined {
    if (!ownerId) return undefined;
    const row = this.db.prepare("SELECT payload FROM invoices WHERE id = ? AND owner_id = ?").get(id, ownerId) as JsonRow | undefined;
    return row ? Object.freeze(JSON.parse(row.payload) as Invoice) : undefined;
  }

  listForCompany(ownerId: string, companyId: string): CompanyInvoiceRecord[] {
    const rows = this.db.prepare(`SELECT invoices.payload, invoice_payments.payload AS payment_payload
      FROM invoices LEFT JOIN invoice_payments ON invoice_payments.invoice_id = invoices.id
      WHERE invoices.owner_id = ? AND invoices.company_id = ? ORDER BY invoices.created_at DESC, invoices.id DESC`)
      .all(ownerId, companyId) as (JsonRow & { payment_payload: string | null })[];
    return rows.map(row => {
      const invoice = JSON.parse(row.payload) as Invoice;
      const payment = row.payment_payload ? JSON.parse(row.payment_payload) as ConfirmedInvoicePayment : null;
      return { ...invoice, status: payment ? "Succeeded" : "Incomplete", payment };
    });
  }

  getPayment(invoiceId: string): ConfirmedInvoicePayment | undefined {
    const row = this.db.prepare("SELECT payload FROM invoice_payments WHERE invoice_id = ?").get(invoiceId) as JsonRow | undefined;
    return row ? JSON.parse(row.payload) as ConfirmedInvoicePayment : undefined;
  }

  getInvoiceIdForTransaction(hash: string): string | undefined {
    const row = this.db.prepare("SELECT invoice_id FROM invoice_payments WHERE transaction_hash = ? COLLATE NOCASE").get(hash) as { invoice_id: string } | undefined;
    return row?.invoice_id;
  }

  savePayment(payment: ConfirmedInvoicePayment): ConfirmedInvoicePayment {
    const transactionHash = payment.transactionHash.toLowerCase();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const linked = this.getInvoiceIdForTransaction(transactionHash);
      if (linked && linked !== payment.invoiceId) throw new PaymentConfirmationConflictError("This transaction is already tied to another invoice.");
      const existing = this.getPayment(payment.invoiceId);
      if (existing && existing.transactionHash !== transactionHash) throw new PaymentConfirmationConflictError("This invoice already has a confirmed payment.");
      if (!this.getInvoice(payment.invoiceId)) throw new PaymentConfirmationConflictError("Invoice not found.");
      const confirmed = existing ?? { ...payment, transactionHash };
      if (!existing) {
        this.db.prepare("INSERT INTO invoice_payments (invoice_id, transaction_hash, payload) VALUES (?, ?, ?)")
          .run(payment.invoiceId, transactionHash, JSON.stringify(confirmed));
      }
      this.db.exec("COMMIT");
      return confirmed;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

const stores = globalThis as typeof globalThis & { snitchInvoiceStores?: Map<string, InvoiceStore> };
export function getInvoiceStore(): InvoiceStore {
  const path = getCompanyDatabasePath();
  stores.snitchInvoiceStores ??= new Map();
  let store = stores.snitchInvoiceStores.get(path);
  if (!store) {
    store = new InvoiceStore(path);
    stores.snitchInvoiceStores.set(path, store);
  }
  return store;
}

export function closeInvoiceStore() {
  const path = getCompanyDatabasePath();
  stores.snitchInvoiceStores?.get(path)?.close();
  stores.snitchInvoiceStores?.delete(path);
}
