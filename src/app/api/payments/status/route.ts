import { NextResponse } from "next/server";

import {
  getConfirmedPayment,
  getConfirmedPayments,
} from "@/lib/payment-confirmations";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const invoiceId = url.searchParams.get("invoiceId");
  const invoiceIds = url.searchParams
    .get("invoiceIds")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (invoiceId) {
    const payment = getConfirmedPayment(invoiceId);

    return NextResponse.json({
      ok: true,
      payment: payment ?? null,
      status: payment?.status ?? "Incomplete",
    });
  }

  const payments = getConfirmedPayments(invoiceIds ?? []);

  return NextResponse.json({
    ok: true,
    payments,
    statuses: Object.fromEntries(
      payments.map((payment) => [
        payment.invoiceId,
        {
          status: payment.status,
          signature: payment.signature,
          explorerUrl: payment.explorerUrl,
          confirmedAt: payment.confirmedAt,
        },
      ]),
    ),
  });
}
