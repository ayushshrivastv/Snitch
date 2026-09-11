import { NextResponse } from "next/server";
import { isEthereumTransactionHash, PaymentVerificationError } from "../../../../../services/ethereum";
import { confirmInvoicePayment, InvoicePaymentStorageError } from "@/lib/invoice-payment-service";
import { PaymentConfirmationConflictError } from "@/lib/payment-confirmations";

export const runtime = "nodejs";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { invoiceId?: unknown; transactionHash?: unknown } | null;
  if (typeof body?.invoiceId !== "string" || !body.invoiceId || body.invoiceId.length > 128 || !isEthereumTransactionHash(body.transactionHash)) {
    return response({ error: "Provide an invoice id and Ethereum transaction hash." }, 400);
  }
  try {
    const result = await confirmInvoicePayment(body.invoiceId, body.transactionHash);
    return response({ ok: true, ...result, status: result.payment.status });
  } catch (error) {
    if (error instanceof PaymentVerificationError) return response({ error: error.message, code: error.code }, error.status);
    if (error instanceof PaymentConfirmationConflictError) return response({ error: error.message }, 409);
    if (error instanceof InvoicePaymentStorageError) return response({ error: error.message }, 503);
    return response({ error: "Unable to verify or save this payment right now. Retry confirmation; do not send another payment." }, 503);
  }
}
