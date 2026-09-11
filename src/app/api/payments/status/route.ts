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

  try {
    if (invoiceId) {
      const payment = await getConfirmedPayment(invoiceId);

      return NextResponse.json({
        ok: true,
        payment: payment ?? null,
        status: payment?.status ?? "Incomplete",
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const payments = await getConfirmedPayments(invoiceIds ?? []);

    return NextResponse.json({
      ok: true,
      payments,
      statuses: Object.fromEntries(
        payments.map((payment) => [
          payment.invoiceId,
          {
            status: payment.status,
            transactionHash: payment.transactionHash,
            chainId: payment.chainId,
            explorerUrl: payment.explorerUrl,
            confirmedAt: payment.confirmedAt,
          },
        ]),
      ),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Payment records are temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
