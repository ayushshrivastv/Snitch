import { randomUUID } from "node:crypto";
import { getInvoiceStore } from "./invoice-store";

import {
  ETHEREUM_CHAIN_ID,
  ETHEREUM_CURRENCY,
  ETHEREUM_TREASURY_ADDRESS,
  normalizeEthereumAddress,
  parseEthAmount,
} from "../../services/ethereum";

export type Invoice = Readonly<{
  id: string;
  amount: string;
  currency: "ETH";
  chainId: 11155111;
  treasury?: string;
  customerName: string;
  title: string;
  memo: string;
  dueDate: string;
  createdAt: string;
  paymentTerms: string;
  treasuryAccount: string;
  ownerId?: string;
  companyId?: string;
}>;

export type CreateInvoiceInput = Pick<
  Invoice,
  | "amount"
  | "customerName"
  | "title"
  | "memo"
  | "dueDate"
  | "paymentTerms"
  | "treasuryAccount"
  | "ownerId"
  | "companyId"
  | "treasury"
>;

export function getInvoice(invoiceId: string) {
  return getInvoiceStore().getInvoice(invoiceId);
}

export function getInvoiceForOwner(invoiceId: string, ownerId: string) {
  return getInvoiceStore().getInvoiceForOwner(invoiceId, ownerId);
}

export function createInvoice(input: CreateInvoiceInput) {
  const amount = input.amount.trim();
  parseEthAmount(amount);

  // A company invoice must always use that company's verified wallet. The
  // configured recipient is retained only for legacy, non-company invoices.
  if (input.companyId && !input.treasury) {
    throw new Error("A company treasury wallet is required.");
  }
  const treasuryAddress = input.treasury ?? ETHEREUM_TREASURY_ADDRESS;
  const treasury = treasuryAddress
    ? normalizeEthereumAddress(treasuryAddress)
    : undefined;
  const invoice: Invoice = Object.freeze({
    ...input,
    id: `INV-${randomUUID().toUpperCase()}`,
    amount,
    currency: ETHEREUM_CURRENCY,
    chainId: ETHEREUM_CHAIN_ID,
    treasury,
    createdAt: new Date().toISOString(),
  });

  return getInvoiceStore().saveInvoice(invoice);
}
