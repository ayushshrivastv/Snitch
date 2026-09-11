import { NextResponse } from "next/server";
import { reconcileInvoicePayments } from "@/lib/invoice-payment-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const invoiceId = url.searchParams.get("invoiceId");
  const invoiceIds = url.searchParams.get("invoiceIds")?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
  const ids = invoiceId ? [invoiceId] : invoiceIds;
  if (ids.length > 100 || ids.some(id => id.length > 128)) {
    return NextResponse.json({ error: "Request up to 100 valid invoice references." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const states = await reconcileInvoicePayments(ids);
    if (invoiceId) return NextResponse.json({ ok: true, ...states.get(invoiceId)! }, { headers: { "Cache-Control": "no-store" } });
    const payments = [...states.values()].flatMap(state => state.payment ? [state.payment] : []);
    return NextResponse.json({
      ok: true, payments,
      statuses: Object.fromEntries(payments.map(payment => [payment.invoiceId, {
        status: payment.status, transactionHash: payment.transactionHash, chainId: payment.chainId,
        explorerUrl: payment.explorerUrl, confirmedAt: payment.confirmedAt,
      }])),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Payment records are temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
