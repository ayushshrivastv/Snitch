import { NextResponse } from "next/server";

type SendInvoiceRequest = {
  accountName?: string;
  customerEmail?: string;
  transaction?: {
    id?: string;
    amountUsd?: string;
    stablecoin?: string;
    dateTime?: string;
    description?: string;
    customerName?: string;
    invoiceId?: string;
    invoiceTitle?: string;
    memo?: string;
    dueDate?: string;
    status?: string;
    confidential?: boolean;
  };
};

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

function invoiceNumberFromTransaction(
  transaction: NonNullable<SendInvoiceRequest["transaction"]>,
) {
  if (transaction.invoiceId) {
    return transaction.invoiceId.toUpperCase();
  }

  const description = transaction.description ?? "";
  const match = description.match(/\bINV-\d+\b/i);

  return (match?.[0] ?? transaction.id ?? "invoice").toUpperCase();
}

function sharePathFromTransaction(transactionId: string) {
  const compactId = transactionId.toLowerCase().replace(/[^a-z0-9]/g, "");

  return `checkout-${compactId.slice(-8) || "invoice"}`;
}

function resendErrorMessage(result: unknown) {
  if (
    result &&
    typeof result === "object" &&
    "message" in result &&
    typeof result.message === "string"
  ) {
    return result.message;
  }

  return "Resend could not send this invoice.";
}

export async function POST(request: Request) {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    return NextResponse.json(
      { error: "Resend API key is not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | SendInvoiceRequest
    | null;
  const customerEmail = body?.customerEmail?.trim() ?? "";
  const transaction = body?.transaction;
  const accountName = body?.accountName?.trim() || "Snitchpay.co";

  if (!isEmail(customerEmail)) {
    return NextResponse.json(
      { error: "Enter a valid customer email." },
      { status: 400 },
    );
  }

  if (!transaction?.id) {
    return NextResponse.json(
      { error: "Missing invoice details." },
      { status: 400 },
    );
  }

  const origin = new URL(request.url).origin;
  const invoiceId = invoiceNumberFromTransaction(transaction);
  const accountSlug = slugifyPath(accountName);
  const sharePath = sharePathFromTransaction(transaction.id);
  const paymentUrl = new URL(
    `/transactions/${encodeURIComponent(accountSlug)}/${encodeURIComponent(sharePath)}/${encodeURIComponent(invoiceId)}`,
    origin,
  );
  const amount = `${transaction.amountUsd ?? "0.00"} ${
    transaction.stablecoin ?? "USDC"
  }`;
  const customerName = transaction.customerName?.trim() || "there";
  const description = transaction.description ?? "Stablecoin invoice";

  paymentUrl.searchParams.set("customerName", customerName);
  paymentUrl.searchParams.set(
    "title",
    transaction.invoiceTitle ?? description,
  );
  paymentUrl.searchParams.set("memo", transaction.memo ?? description);
  paymentUrl.searchParams.set("amount", transaction.amountUsd ?? "0.00");
  paymentUrl.searchParams.set("stablecoin", transaction.stablecoin ?? "USDC");
  paymentUrl.searchParams.set(
    "dueDate",
    transaction.dueDate ?? "May 30, 2026",
  );
  paymentUrl.searchParams.set(
    "createdAt",
    transaction.dateTime ?? "May 8, 2026, 1:37 PM",
  );
  paymentUrl.searchParams.set("status", transaction.status ?? "Incomplete");
  paymentUrl.searchParams.set(
    "confidential",
    transaction.confidential ? "true" : "false",
  );

  const paymentLink = paymentUrl.toString();

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:32px 20px;">
      <p style="font-size:14px;color:#6b7280;margin:0 0 16px;">${escapeHtml(accountName)}</p>
      <h1 style="font-size:24px;line-height:1.2;margin:0 0 16px;font-weight:600;">Invoice ${escapeHtml(invoiceId)}</h1>
      <p style="font-size:16px;margin:0 0 18px;">Hi ${escapeHtml(customerName)},</p>
      <p style="font-size:16px;margin:0 0 18px;">
        ${escapeHtml(accountName)} sent you a stablecoin invoice for <strong>${escapeHtml(amount)}</strong>.
        You can review and complete the payment securely using the link below.
      </p>
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:20px 0;background:#fafafa;">
        <p style="font-size:13px;color:#6b7280;margin:0 0 6px;">Invoice details</p>
        <p style="font-size:15px;margin:0;">${escapeHtml(description)}</p>
      </div>
      <a href="${paymentLink}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 18px;font-size:15px;font-weight:600;">
        Complete payment
      </a>
      <p style="font-size:13px;color:#6b7280;margin:22px 0 0;">
        This payment link will open the Snitch checkout page. Payment status will update in the merchant dashboard after completion.
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

  const result = (await resendResponse.json().catch(() => null)) as unknown;

  if (!resendResponse.ok) {
    const message = resendErrorMessage(result);

    return NextResponse.json(
      {
        error: message,
      },
      { status: resendResponse.status },
    );
  }

  return NextResponse.json({
    ok: true,
    provider: "resend",
    paymentLink,
    result,
  });
}
