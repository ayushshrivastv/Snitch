import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getInvoiceForOwner, type Invoice } from "@/lib/invoices";
import { requirePrivyUser } from "@/lib/privy-server";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string) {
  return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
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
  const requestId = text(body.requestId) || randomUUID();

  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(requestId)) {
    return NextResponse.json({ error: "Invalid email request. Reopen the send dialog and try again." }, { status: 400 });
  }

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

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    return NextResponse.json(
      { error: "Invoice email is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const from = process.env.RESEND_FROM?.trim() || "Snitch <onboarding@resend.dev>";
  const senderAddress = from.match(/<([^<>]+)>$/)?.[1] || from;
  if (/[\r\n]/.test(from) || !isEmail(senderAddress)) {
    return NextResponse.json({ error: "The invoice email sender is not configured correctly." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
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
  const logoUrl = new URL("/snitch-logo.png", origin).toString();
  const companyUrl = new URL("/", origin).toString();

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="light">
        <style>
          @media only screen and (max-width: 600px) {
            .email-shell { width: 100% !important; }
            .email-pad { padding-left: 22px !important; padding-right: 22px !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:#ffffff;color:#17191d;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(accountName)} sent you an invoice for ${escapeHtml(amount)}.</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#ffffff;border-collapse:collapse;">
          <tr>
            <td align="center" style="padding:30px 12px;">
              <table role="presentation" class="email-shell" width="620" cellspacing="0" cellpadding="0" border="0" style="width:620px;max-width:620px;border-collapse:collapse;background:#ffffff;">
                <tr>
                  <td class="email-pad" style="padding:0 34px 24px;background:#ffffff;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td style="font-size:15px;font-weight:700;color:#17191d;">
                          <img src="${escapeHtml(logoUrl)}" width="32" height="32" alt="Snitch" style="display:inline-block;width:32px;height:32px;margin-right:9px;vertical-align:middle;">
                          <span style="vertical-align:middle;">Snitch</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:20px 34px 34px;background:#ffffff;border-top:1px solid #e6e6e3;">
                    <p style="margin:0 0 34px;font-size:16px;line-height:1.5;">
                      <a href="${escapeHtml(companyUrl)}" style="color:#1264d6;text-decoration:underline;">${escapeHtml(accountName)}</a>
                    </p>
                    <p style="margin:0 0 28px;font-size:17px;line-height:1.6;color:#202124;">Hi ${escapeHtml(customerName)},</p>
                    <p style="margin:0;font-size:17px;line-height:1.65;color:#202124;">
                      <a href="${escapeHtml(companyUrl)}" style="color:#1264d6;text-decoration:underline;">${escapeHtml(accountName)}</a>
                      sent you an invoice for <strong>${escapeHtml(amount)}</strong>. You can review the invoice and its status using the link below.
                    </p>

                    <div style="margin-top:28px;padding:18px 20px;background:#fafafa;border:1px solid #e4e4e1;border-radius:10px;">
                      <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#6b6f75;">Invoice details</p>
                      <p style="margin:0;font-size:17px;line-height:1.5;color:#202124;">${escapeHtml(description)}</p>
                    </div>

                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;border-collapse:separate;border-spacing:0;">
                      <tr>
                        <td align="center" style="background:#17191d;border-radius:999px;">
                          <a href="${escapeHtml(paymentLink)}" style="display:block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;line-height:1.4;font-weight:700;">View invoice</a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:28px 0 0;font-size:14px;line-height:1.6;color:#73777d;">
                      Use Sepolia test ETH to pay this invoice. This is a testnet payment.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const plainText = [
    accountName,
    `Hi ${customerName},`,
    `${accountName} sent you an invoice for ${amount}. You can review the invoice and its status using the link below.`,
    `Invoice details\n${description}`,
    `View invoice: ${paymentLink}`,
    "Use Sepolia test ETH to pay this invoice. This is a testnet payment.",
  ].join("\n\n");
  // Retrying the same send dialog cannot duplicate a provider-accepted email.
  // The key is scoped to the verified owner, invoice, and selected recipient.
  const idempotencyKey = createHash("sha256")
    .update(JSON.stringify([auth.userId, invoiceId, customerEmail, requestId])).digest("hex");

  let resendResponse: Response;

  try {
    resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "snitch-dashboard/0.1",
        "Idempotency-Key": `invoice-email/${idempotencyKey}`,
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        from,
        to: [customerEmail],
        subject: `${accountName} sent you an invoice`,
        html,
        text: plainText,
      }),
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The email service did not respond. Please try again.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!resendResponse.ok) {
    const detail = await resendResponse.json().catch(() => null);
    const testRecipientRestricted = resendResponse.status === 403 &&
      typeof detail?.message === "string" && /only send testing emails/i.test(detail.message);
    const error = testRecipientRestricted
      ? "Resend’s test sender can only email the Resend account owner. Use that email address or configure a verified sending domain."
      : resendResponse.status === 401 || resendResponse.status === 403
        ? "The email service rejected this sender. Check the Resend API key and sending domain."
        : resendResponse.status === 429
          ? "The email sending limit was reached. Please try again later."
          : "Unable to send this invoice email. Please try again.";
    return NextResponse.json(
      { error },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  const delivery = await resendResponse.json().catch(() => null);
  if (typeof delivery?.id !== "string" || !delivery.id) {
    return NextResponse.json({ error: "The email service did not confirm sending. Please try again." }, {
      status: 502, headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json({
    ok: true,
    provider: "resend",
    paymentLink,
  }, { headers: { "Cache-Control": "no-store" } });
}
