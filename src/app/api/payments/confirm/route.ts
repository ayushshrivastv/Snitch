import { NextResponse } from "next/server";

import {
  ETHEREUM_CHAIN_ID,
  getEthereumExplorerUrl,
  getEthereumProvider,
  isEthereumTransactionHash,
  PaymentVerificationError,
  verifyEthPayment,
} from "../../../../../services/ethereum";
import { getInvoice } from "@/lib/invoices";
import {
  getConfirmedPayment,
  getInvoiceIdForTransaction,
  PaymentConfirmationConflictError,
  saveConfirmedPayment,
} from "@/lib/payment-confirmations";

type ConfirmPaymentBody = {
  invoiceId?: unknown;
  transactionHash?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ConfirmPaymentBody | null;
  if (typeof body?.invoiceId !== "string" || !isEthereumTransactionHash(body.transactionHash)) {
    return NextResponse.json(
      { error: "Provide an invoice id and Ethereum transaction hash." },
      { status: 400 },
    );
  }

  const invoice = getInvoice(body.invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found. Create a new invoice before paying." }, { status: 404 });
  }
  if (!invoice.treasury) {
    return NextResponse.json({ error: "This invoice does not have a configured Ethereum receiving address." }, { status: 503 });
  }

  const existing = getConfirmedPayment(invoice.id);
  if (existing) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true, payment: existing, status: existing.status });
  }
  const transactionHash = body.transactionHash.toLowerCase();
  const linkedInvoice = getInvoiceIdForTransaction(transactionHash);
  if (linkedInvoice && linkedInvoice !== invoice.id) {
    return NextResponse.json({ error: "This transaction is already tied to another invoice." }, { status: 409 });
  }

  const provider = getEthereumProvider();
  try {
    const verified = await verifyEthPayment({
      invoice: { ...invoice, treasury: invoice.treasury },
      transactionHash,
      provider,
    });
    const payment = saveConfirmedPayment({
      invoiceId: invoice.id,
      amount: invoice.amount,
      currency: "ETH",
      chainId: ETHEREUM_CHAIN_ID,
      transactionHash,
      ...verified,
      status: "Succeeded",
      confirmationStatus: "confirmed",
      confirmedAt: new Date().toISOString(),
      explorerUrl: getEthereumExplorerUrl(transactionHash),
    });
    return NextResponse.json({ ok: true, payment, status: payment.status });
  } catch (error) {
    if (error instanceof PaymentVerificationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof PaymentConfirmationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Unable to verify the payment on Ethereum Sepolia. Check the configured RPC and retry confirmation." },
      { status: 502 },
    );
  } finally {
    provider.destroy();
  }
}
