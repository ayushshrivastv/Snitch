import { NextResponse } from "next/server";

import {
  ETHEREUM_CHAIN_ID,
  getEthereumExplorerUrl,
  getEthereumProvider,
  isEthereumTransactionHash,
  PaymentVerificationError,
  verifyEthPayment,
} from "../../../../../services/ethereum";
import { getInvoice, type Invoice } from "@/lib/invoices";
import {
  getConfirmedPayment,
  getInvoiceIdForTransaction,
  PaymentConfirmationConflictError,
  saveConfirmedPayment,
  type ConfirmedInvoicePayment,
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

  const transactionHash = body.transactionHash.toLowerCase();
  let invoice: Invoice | undefined;
  let existing: ConfirmedInvoicePayment | undefined;
  let linkedInvoice: string | undefined;
  try {
    invoice = await getInvoice(body.invoiceId);
    [existing, linkedInvoice] = await Promise.all([
      getConfirmedPayment(body.invoiceId),
      getInvoiceIdForTransaction(transactionHash),
    ]);
  } catch {
    return NextResponse.json(
      { error: "Payment records are temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found. Create a new invoice before paying." }, { status: 404 });
  }
  if (!invoice.treasury) {
    return NextResponse.json({ error: "This invoice does not have a configured Ethereum receiving address." }, { status: 503 });
  }

  if (existing) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true, payment: existing, status: existing.status });
  }
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
    let payment: ConfirmedInvoicePayment;
    try {
      payment = await saveConfirmedPayment({
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
    } catch (error) {
      if (error instanceof PaymentConfirmationConflictError) throw error;
      return NextResponse.json(
        { error: "The transaction was verified, but its receipt could not be saved. Retry confirmation; do not send another payment." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
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
