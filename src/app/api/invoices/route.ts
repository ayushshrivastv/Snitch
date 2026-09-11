import { NextResponse } from "next/server";

import { getCompanyForUser } from "@/lib/company-store";
import { createInvoice } from "@/lib/invoices";
import { requirePrivyUser } from "@/lib/privy-server";
import {
  ETHEREUM_CURRENCY,
  ETHEREUM_NETWORK_NAME,
  parseEthAmount,
} from "../../../../services/ethereum";

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

  if (body.currency !== ETHEREUM_CURRENCY) {
    return NextResponse.json(
      { error: "Only native ETH is supported for checkout." },
      { status: 400 },
    );
  }

  if (body.network !== ETHEREUM_NETWORK_NAME) {
    return NextResponse.json(
      { error: "Only Ethereum Sepolia testnet is supported." },
      { status: 400 },
    );
  }

  const amount = text(body.invoiceAmount);
  try {
    parseEthAmount(amount);
  } catch {
    return NextResponse.json(
      { error: "Enter a positive ETH amount with up to 18 decimal places." },
      { status: 400 },
    );
  }

  const dueDate = text(body.dueDate, new Date().toISOString().slice(0, 10));
  const dueTimestamp = Date.parse(dueDate);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
    Number.isNaN(dueTimestamp) ||
    new Date(dueTimestamp).toISOString().slice(0, 10) !== dueDate
  ) {
    return NextResponse.json(
      { error: "Enter a valid invoice due date in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  try {
    const companyId = text(body.companyId);
    if (!companyId) {
      return NextResponse.json(
        { error: "Select a company account before creating an invoice." },
        { status: 400 },
      );
    }

    // Always resolve the company from the verified identity. Client-supplied
    // account names and recipient addresses do not control where funds go.
    const company = await getCompanyForUser(auth.userId, companyId);
    if (!company) {
      return NextResponse.json({ error: "Company account not found." }, { status: 404 });
    }
    if (company.wallet.status !== "ready" || !company.wallet.address) {
      return NextResponse.json(
        { error: "The company treasury wallet is not ready. Finish setting up the company wallet first." },
        { status: 409 },
      );
    }

    const invoice = await createInvoice({
      amount,
      customerName: text(body.customerName, "Unnamed customer"),
      title: text(body.invoiceTitle, "ETH invoice"),
      memo: text(body.memo),
      dueDate,
      paymentTerms: text(body.paymentTerms, "Due on receipt"),
      treasuryAccount: company.name,
      treasury: company.wallet.address,
      companyId: company.id,
      ownerId: auth.userId,
    });

    return NextResponse.json({
      invoiceId: invoice.id,
      currency: invoice.currency,
      network: ETHEREUM_NETWORK_NAME,
      status: "Incomplete",
      checkoutAvailable: Boolean(invoice.treasury),
      companyId: invoice.companyId,
      companyName: invoice.treasuryAccount,
      treasuryAddress: invoice.treasury,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "The company treasury is unavailable. Please try again." },
      { status: 503 },
    );
  }
}
