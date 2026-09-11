import { ETHEREUM_CHAIN_ID, getEthereumExplorerUrl, PaymentVerificationError, verifyEthPayment, type EthereumPaymentReader } from "../../services/ethereum";
import { createCompanyPaymentReader } from "./company-payment-reader";
import { getInvoiceStore, PaymentConfirmationConflictError, type InvoicePaymentAttempt } from "./invoice-store";
import type { Invoice } from "./invoices";
import type { ConfirmedInvoicePayment } from "./payment-confirmations";

export class InvoicePaymentStorageError extends Error {}

export type InvoicePaymentStatus = {
  payment: ConfirmedInvoicePayment | null;
  status: "Incomplete" | "Succeeded";
  pendingPayment: { transactionHash: string; explorerUrl: string; status: "Incomplete" } | null;
  failedPayment: { transactionHash: string; explorerUrl: string; status: "Failed" } | null;
};

async function save<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof PaymentConfirmationConflictError) throw error;
    throw new InvoicePaymentStorageError("Payment progress could not be saved. Retry confirmation; do not send another payment.");
  }
}

async function verifyAndSave(invoice: Invoice & { treasury: string }, transactionHash: string, provider: EthereumPaymentReader) {
  const store = getInvoiceStore();
  try {
    const verified = await verifyEthPayment({
      invoice, transactionHash, provider,
      onTransactionVerified: () => save(() => store.savePaymentAttempt(invoice.id, transactionHash)),
    });
    return await save(() => store.savePayment({
      invoiceId: invoice.id, amount: invoice.amount, currency: "ETH", chainId: ETHEREUM_CHAIN_ID,
      transactionHash, ...verified, status: "Succeeded", confirmationStatus: "confirmed",
      explorerUrl: getEthereumExplorerUrl(transactionHash),
    }));
  } catch (error) {
    if (error instanceof PaymentVerificationError && error.code === "transaction_reverted") {
      await save(() => store.markPaymentAttemptFailed(invoice.id, transactionHash));
    }
    if (error instanceof PaymentVerificationError && error.status === 422) {
      await save(() => store.removePaymentSubmission(invoice.id, transactionHash));
    } else if (!(error instanceof InvoicePaymentStorageError)) {
      await save(() => store.deferPaymentSubmission(invoice.id, transactionHash));
    }
    throw error;
  }
}

/** No wallet session is needed to verify public chain evidence for an existing invoice. */
export async function confirmInvoicePayment(invoiceId: string, hash: string) {
  const store = getInvoiceStore();
  const transactionHash = hash.toLowerCase();
  const invoice = await store.getInvoice(invoiceId);
  if (!invoice) throw new PaymentVerificationError("Invoice not found. Create a new invoice before paying.", 404);
  const existing = await store.getPayment(invoiceId);
  if (existing) return { alreadyConfirmed: true, payment: existing };
  if (!invoice.treasury) throw new PaymentVerificationError("This invoice does not have a configured Ethereum receiving address.", 503);
  const linkedInvoice = await store.getInvoiceIdForTransaction(transactionHash);
  if (linkedInvoice && linkedInvoice !== invoiceId) throw new PaymentConfirmationConflictError("This transaction is already tied to another invoice.");
  await save(() => store.savePaymentSubmission(invoiceId, transactionHash));
  const provider = createCompanyPaymentReader(AbortSignal.timeout(10_000));
  const payment = await verifyAndSave({ ...invoice, treasury: invoice.treasury }, transactionHash, provider);
  return { alreadyConfirmed: false, payment };
}

function attemptSummary(attempt: InvoicePaymentAttempt | undefined) {
  return attempt ? { transactionHash: attempt.transactionHash, explorerUrl: getEthereumExplorerUrl(attempt.transactionHash) } : null;
}

async function reconcileInvoicePayment(invoiceId: string, provider: EthereumPaymentReader): Promise<InvoicePaymentStatus> {
  const store = getInvoiceStore();
  let payment = await store.getPayment(invoiceId);
  if (payment) return { payment, status: "Succeeded", pendingPayment: null, failedPayment: null };
  const attempts = await store.getPaymentAttempts(invoiceId);
  const pending = attempts.filter(attempt => attempt.status === "Incomplete");
  const submissions = await store.getDuePaymentSubmissions(invoiceId);
  const candidates = [...new Set([...pending.map(attempt => attempt.transactionHash), ...submissions])];
  if (candidates.length) {
    const invoice = await store.getInvoice(invoiceId);
    if (invoice?.treasury) {
      for (const transactionHash of candidates) {
        try {
          payment = await verifyAndSave({ ...invoice, treasury: invoice.treasury }, transactionHash, provider);
          break;
        } catch (error) {
          if (error instanceof InvoicePaymentStorageError) throw error;
          if (error instanceof PaymentConfirmationConflictError) {
            payment = await store.getPayment(invoiceId);
            if (payment) break;
          }
          // An RPC outage or an unmined transaction never erases a saved hash.
          // The next status request resumes this same verification.
        }
      }
    }
  }
  if (payment) return { payment, status: "Succeeded", pendingPayment: null, failedPayment: null };
  const refreshed = candidates.length ? await store.getPaymentAttempts(invoiceId) : attempts;
  const pendingPayment = attemptSummary(refreshed.find(attempt => attempt.status === "Incomplete"));
  const failedPayment = attemptSummary(refreshed.find(attempt => attempt.status === "Failed"));
  return {
    payment: null, status: "Incomplete",
    pendingPayment: pendingPayment ? { ...pendingPayment, status: "Incomplete" } : null,
    failedPayment: failedPayment ? { ...failedPayment, status: "Failed" } : null,
  };
}

/** Bounded RPC work is shared by public status polling and company history refreshes. */
export async function reconcileInvoicePayments(invoiceIds: string[]): Promise<Map<string, InvoicePaymentStatus>> {
  const provider = createCompanyPaymentReader(AbortSignal.timeout(10_000));
  const ids = [...new Set(invoiceIds)];
  const results = new Map<string, InvoicePaymentStatus>();
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const invoiceId = ids[next++];
      results.set(invoiceId, await reconcileInvoicePayment(invoiceId, provider));
    }
  }
  await Promise.all(Array.from({ length: Math.min(ids.length, 4) }, worker));
  return results;
}
