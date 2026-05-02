export type ConfirmedInvoicePayment = {
  invoiceId: string;
  amount?: string;
  stablecoin?: string;
  signature: string;
  payer?: string;
  treasury?: string;
  mint?: string;
  privacyRail?: string;
  proofSignature?: string;
  closeProofAccountSignature?: string;
  status: "Succeeded";
  confirmationStatus: string;
  confirmedAt: string;
  explorerUrl: string;
};

const globalForPayments = globalThis as typeof globalThis & {
  __snitchConfirmedPayments?: Map<string, ConfirmedInvoicePayment>;
  __snitchPaymentSignatures?: Map<string, string>;
};

const confirmedPayments =
  globalForPayments.__snitchConfirmedPayments ?? new Map<string, ConfirmedInvoicePayment>();
const paymentSignatures =
  globalForPayments.__snitchPaymentSignatures ?? new Map<string, string>();

globalForPayments.__snitchConfirmedPayments = confirmedPayments;
globalForPayments.__snitchPaymentSignatures = paymentSignatures;

export function getConfirmedPayment(invoiceId: string) {
  return confirmedPayments.get(invoiceId);
}

export function getConfirmedPayments(invoiceIds: string[]) {
  return invoiceIds
    .map((invoiceId) => confirmedPayments.get(invoiceId))
    .filter((payment): payment is ConfirmedInvoicePayment => Boolean(payment));
}

export function getInvoiceIdForSignature(signature: string) {
  return paymentSignatures.get(signature);
}

export function saveConfirmedPayment(payment: ConfirmedInvoicePayment) {
  confirmedPayments.set(payment.invoiceId, payment);
  paymentSignatures.set(payment.signature, payment.invoiceId);

  return payment;
}
