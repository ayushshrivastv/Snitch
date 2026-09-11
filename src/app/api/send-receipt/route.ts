import { NextResponse } from "next/server";

import { getInvoiceForOwner, type Invoice } from "@/lib/invoices";
import { requirePrivyUser } from "@/lib/privy-server";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugifyPath(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "") || "snitchpay.co"
  );
}

function sharePathFromTransaction(transactionId: string) {
  const compactId = transactionId.toLowerCase().replace(/[^a-z0-9]/g, "");

  return `checkout-${compactId.slice(-8) || "invoice"}`;
}

export async function POST(request: Request) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Expected a JSON request body." },
      { status: 400 },
    );
  }
  const customerEmail = text(body.customerEmail);
  const transaction = body.transaction && typeof body.transaction === "object" && !Array.isArray(body.transaction)
    ? body.transaction as Record<string, unknown>
    : undefined;
  const invoiceId = (text(body.invoiceId) || text(transaction?.invoiceId)).toUpperCase();

  if (!isEmail(customerEmail)) {
    return NextResponse.json(
      { error: "Enter a valid customer email." },
      { status: 400 },
    );
  }

  if (!invoiceId) {
    return NextResponse.json(
      { error: "Missing invoice details." },
      { status: 400 },
    );
  }

  let storedInvoice: Invoice | undefined;
  try {
    storedInvoice = await getInvoiceForOwner(invoiceId, auth.userId);
  } catch {
    return NextResponse.json(
      { error: "Invoice records are temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!storedInvoice) {
    return NextResponse.json(
      { error: "Invoice not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return NextResponse.json(
      { error: "Invoice email is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const origin = process.env.SNITCH_PUBLIC_ORIGIN?.trim() || new URL(request.url).origin;
  const accountName = storedInvoice.treasuryAccount;
  const accountSlug = slugifyPath(accountName);
  const sharePath = sharePathFromTransaction(storedInvoice.id);
  const paymentUrl = new URL(
    `/transactions/${encodeURIComponent(accountSlug)}/${encodeURIComponent(sharePath)}/${encodeURIComponent(invoiceId)}`,
    origin,
  );
  const amount = `${storedInvoice.amount} ${storedInvoice.currency}`;
  const customerName = storedInvoice.customerName;
  const description = storedInvoice.title;

  const paymentLink = paymentUrl.toString();

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:32px 20px;">
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px;">${escapeHtml(accountName)}</p>
      <h1 style="font-size:24px;line-height:1.2;margin:0 0 16px;font-weight:600;">Invoice ${escapeHtml(invoiceId)}</h1>
      <p style="font-size:16px;margin:0 0 18px;">Hi ${escapeHtml(customerName)},</p>
      <p style="font-size:16px;margin:0 0 18px;">
        ${escapeHtml(accountName)} sent you an Ethereum Sepolia testnet invoice for <strong>${escapeHtml(amount)}</strong>.
        You can review the invoice and its status using the link below.
      </p>
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:20px 0;background:#fafafa;">
        <p style="font-size:13px;color:#6b7280;margin:0 0 6px;">Invoice details</p>
        <p style="font-size:15px;margin:0;">${escapeHtml(description)}</p>
      </div>
      <a href="${paymentLink}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 18px;font-size:15px;font-weight:600;">
        View invoice
      </a>
      <p style="font-size:13px;color:#6b7280;margin:22px 0 0;">
        ${storedInvoice.treasury ? "Use Sepolia test ETH to pay this invoice. This is a testnet payment." : "Payments are unavailable until a merchant treasury is configured for a new invoice."}
      </p>
    </div>
  `;

  let resendResponse: Response;

  try {
    resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "snitch-dashboard/0.1",
      },
      body: JSON.stringify({
        from: "Snitchpay.co <onboarding@resend.dev>",
        to: [customerEmail],
        subject: `Invoice ${invoiceId} from ${accountName}`,
        html,
      }),
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Unable to reach Resend from local dev. Check network access and try again.",
      },
      { status: 502 },
    );
  }

  if (!resendResponse.ok) {
    return NextResponse.json(
      { error: "Unable to send this invoice email. Please try again." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({
    ok: true,
    provider: "resend",
    paymentLink,
  }, { headers: { "Cache-Control": "no-store" } });
}
