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

function formatEmailDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
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
  const memo = storedInvoice.memo || description;
  const dueDate = formatEmailDate(storedInvoice.dueDate);

  const paymentLink = paymentUrl.toString();
  const logoUrl = new URL("/snitch-logo.png", origin).toString();

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="light">
        <style>
          @media only screen and (max-width: 640px) {
            .email-shell { width: 100% !important; }
            .email-pad { padding-left: 20px !important; padding-right: 20px !important; }
            .invoice-card { padding: 28px 24px !important; }
            .amount { font-size: 42px !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:#f5f3f8;color:#17191d;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">A payment request for ${escapeHtml(amount)} from ${escapeHtml(accountName)} is ready.</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f5f3f8;border-collapse:collapse;">
          <tr>
            <td align="center" style="padding:32px 12px;">
              <table role="presentation" class="email-shell" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:640px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;">
                <tr>
                  <td class="email-pad" style="padding:34px 42px 30px;background:#ffffff;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td style="font-size:15px;font-weight:700;color:#17191d;">
                          <img src="${escapeHtml(logoUrl)}" width="34" height="34" alt="Snitch" style="display:inline-block;width:34px;height:34px;margin-right:10px;vertical-align:middle;">
                          <span style="vertical-align:middle;">Snitch</span>
                        </td>
                      </tr>
                    </table>
                    <h1 style="margin:30px 0 10px;font-size:28px;line-height:1.25;letter-spacing:-0.4px;color:#24272d;font-weight:700;">New invoice from ${escapeHtml(accountName)}</h1>
                    <p style="margin:0;font-size:16px;line-height:1.5;color:#6b7078;"><strong style="color:#3d424a;">to:</strong> ${escapeHtml(customerEmail)}</p>
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:42px;background:#7048d8;background-image:linear-gradient(135deg,#e34850 0%,#7048d8 100%);border-top:1px solid #d5c3e3;">
                    <p style="margin:0 0 24px;font-size:17px;line-height:1.4;color:#ffffff;font-weight:700;">
                      <img src="${escapeHtml(logoUrl)}" width="40" height="40" alt="" style="display:inline-block;width:40px;height:40px;margin-right:10px;vertical-align:middle;">
                      ${escapeHtml(accountName)}
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #dce5e4;border-radius:16px;">
                      <tr>
                        <td class="invoice-card" style="padding:34px 36px;">
                          <p style="margin:0 0 4px;font-size:16px;line-height:1.5;color:#70757c;">Invoice from ${escapeHtml(accountName)}</p>
                          <p class="amount" style="margin:0;font-size:48px;line-height:1.12;letter-spacing:-1.4px;color:#17191d;font-weight:700;">${escapeHtml(amount)}</p>
                          <p style="margin:10px 0 0;font-size:16px;line-height:1.5;color:#70757c;">Due ${escapeHtml(dueDate)}</p>
                          <div style="height:1px;background:#e8eaed;margin:28px 0;"></div>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;font-size:16px;line-height:1.5;">
                            <tr>
                              <td width="90" style="padding:7px 0;color:#62676f;vertical-align:top;">To</td>
                              <td style="padding:7px 0;color:#24272d;vertical-align:top;">${escapeHtml(customerName)}</td>
                            </tr>
                            <tr>
                              <td width="90" style="padding:7px 0;color:#62676f;vertical-align:top;">From</td>
                              <td style="padding:7px 0;color:#24272d;vertical-align:top;">${escapeHtml(accountName)}</td>
                            </tr>
                            <tr>
                              <td width="90" style="padding:7px 0;color:#62676f;vertical-align:top;">Memo</td>
                              <td style="padding:7px 0;color:#24272d;vertical-align:top;">${escapeHtml(memo)}</td>
                            </tr>
                          </table>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;border-collapse:separate;border-spacing:0;">
                            <tr>
                              <td align="center" style="background:#0f2f46;border-radius:10px;">
                                <a href="${escapeHtml(paymentLink)}" style="display:block;padding:15px 20px;color:#ffffff;text-decoration:none;font-size:16px;line-height:1.4;font-weight:700;">Pay this invoice</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #dce5e4;border-radius:16px;">
                      <tr>
                        <td class="invoice-card" style="padding:28px 36px;">
                          <p style="margin:0 0 22px;font-size:15px;line-height:1.5;color:#70757c;font-weight:600;">Payment details</p>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;font-size:16px;line-height:1.5;">
                            <tr>
                              <td style="padding:0 0 18px;color:#24272d;">${escapeHtml(description)}</td>
                              <td align="right" style="padding:0 0 18px;color:#24272d;font-weight:700;white-space:nowrap;">${escapeHtml(amount)}</td>
                            </tr>
                            <tr>
                              <td style="padding:18px 0 0;border-top:1px solid #e8eaed;color:#24272d;font-weight:700;">Amount due</td>
                              <td align="right" style="padding:18px 0 0;border-top:1px solid #e8eaed;color:#24272d;font-weight:700;white-space:nowrap;">${escapeHtml(amount)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:24px 4px 0;font-size:13px;line-height:1.6;color:#ffffff;">
                      ${storedInvoice.treasury ? "Payment will be recorded in the company workspace." : "Payment is unavailable until the company treasury is connected."}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:24px 42px;background:#ffffff;text-align:center;font-size:12px;line-height:1.6;color:#60656d;">
                    Sent securely through Snitch · Company payments and treasury operations
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
    `New invoice from ${accountName}`,
    `To: ${customerName}`,
    `Amount due: ${amount}`,
    `Due ${dueDate}`,
    `Memo: ${memo}`,
    `Pay this invoice: ${paymentLink}`,
    storedInvoice.treasury
      ? "Payment will be recorded in the company workspace."
      : "Payment is unavailable until the company treasury is connected.",
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
        subject: `New invoice from ${accountName}`,
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
