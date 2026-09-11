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
          @media only screen and (max-width: 600px) {
            .email-shell { width: 100% !important; }
            .email-pad { padding-left: 20px !important; padding-right: 20px !important; }
            .amount { font-size: 38px !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:#f5f5f4;color:#17191d;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(accountName)} sent a bill for ${escapeHtml(description)}, due ${escapeHtml(dueDate)}.</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f5f5f4;border-collapse:collapse;">
          <tr>
            <td align="center" style="padding:28px 12px;">
              <table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e4e4e1;border-radius:14px;overflow:hidden;">
                <tr>
                  <td class="email-pad" style="padding:30px 38px 16px;background:#ffffff;">
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
                  <td class="email-pad" style="padding:22px 38px 34px;background:#ffffff;">
                    <p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#5f6368;">Hi ${escapeHtml(customerName)},</p>
                    <h1 style="margin:0;font-size:29px;line-height:1.25;letter-spacing:-0.5px;color:#202124;font-weight:700;">${escapeHtml(accountName)} sent you a bill for ${escapeHtml(description)}.</h1>
                    <p style="margin:14px 0 0;font-size:16px;line-height:1.6;color:#5f6368;">Payment is due on ${escapeHtml(dueDate)}.</p>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px;border-collapse:separate;border-spacing:0;background:#fafaf9;border:1px solid #e4e4e1;border-radius:10px;">
                      <tr>
                        <td style="padding:24px 26px;">
                          <p style="margin:0 0 5px;font-size:13px;line-height:1.5;color:#6b6f75;">Amount due</p>
                          <p class="amount" style="margin:0;font-size:42px;line-height:1.1;letter-spacing:-1px;color:#17191d;font-weight:700;">${escapeHtml(amount)}</p>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;border-collapse:collapse;font-size:15px;line-height:1.5;">
                            <tr>
                              <td width="100" style="padding:7px 0;color:#666a70;vertical-align:top;">Bill for</td>
                              <td style="padding:7px 0;color:#202124;vertical-align:top;">${escapeHtml(description)}</td>
                            </tr>
                            <tr>
                              <td width="100" style="padding:7px 0;color:#666a70;vertical-align:top;">From</td>
                              <td style="padding:7px 0;color:#202124;vertical-align:top;">${escapeHtml(accountName)}</td>
                            </tr>
                            <tr>
                              <td width="100" style="padding:7px 0;color:#666a70;vertical-align:top;">Due</td>
                              <td style="padding:7px 0;color:#202124;vertical-align:top;">${escapeHtml(dueDate)}</td>
                            </tr>
                            ${memo !== description ? `<tr>
                              <td width="100" style="padding:7px 0;color:#666a70;vertical-align:top;">Note</td>
                              <td style="padding:7px 0;color:#202124;vertical-align:top;">${escapeHtml(memo)}</td>
                            </tr>` : ""}
                          </table>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;border-collapse:separate;border-spacing:0;">
                      <tr>
                        <td align="center" style="background:#17191d;border-radius:9px;">
                          <a href="${escapeHtml(paymentLink)}" style="display:block;padding:15px 20px;color:#ffffff;text-decoration:none;font-size:15px;line-height:1.4;font-weight:700;">View and pay</a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#73777d;">
                      ${storedInvoice.treasury ? "Payment will be recorded in the company workspace." : "Payment is unavailable until the company treasury is connected."}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:20px 38px;background:#fafaf9;border-top:1px solid #ececea;text-align:center;font-size:12px;line-height:1.6;color:#686c72;">
                    Sent securely through Snitch
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
    `${accountName} sent you a bill for ${description}.`,
    `To: ${customerName}`,
    `Amount due: ${amount}`,
    `Due: ${dueDate}`,
    ...(memo !== description ? [`Note: ${memo}`] : []),
    `View and pay: ${paymentLink}`,
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
        subject: `${accountName} sent you a bill for ${description}`,
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
