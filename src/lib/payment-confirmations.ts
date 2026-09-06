import { getInvoiceStore } from "./invoice-store";
export { PaymentConfirmationConflictError } from "./invoice-store";

export type ConfirmedInvoicePayment = {
  invoiceId: string;
  amount: string;
  currency: "ETH";
  chainId: 11155111;
  transactionHash: string;
  payer: string;
  treasury: string;
  blockNumber: number;
  status: "Succeeded";
  confirmationStatus: "confirmed";
  confirmedAt: string;
  explorerUrl: string;
};

export function getConfirmedPayment(invoiceId: string) {
  return getInvoiceStore().getPayment(invoiceId);
}

export function getConfirmedPayments(invoiceIds: string[]) {
  return invoiceIds
    .map((invoiceId) => getConfirmedPayment(invoiceId))
    .filter((payment): payment is ConfirmedInvoicePayment => Boolean(payment));
}

export function getInvoiceIdForTransaction(transactionHash: string) {
  return getInvoiceStore().getInvoiceIdForTransaction(transactionHash);
}

export function saveConfirmedPayment(payment: ConfirmedInvoicePayment) {
  return getInvoiceStore().savePayment(payment);
}
