import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CalendarDays } from "lucide-react";

import { getConfirmedPayment } from "@/lib/payment-confirmations";
import { PublicInvoicePayment } from "./public-invoice-payment";

type InvoicePageProps = {
  params: Promise<{
    account: string;
    shareId: string;
    invoiceId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type InvoiceStatus =
  | "Succeeded"
  | "Failed"
  | "Incomplete"
  | "Refunded"
  | "Disputed";

type InvoiceData = {
  customerName: string;
  title: string;
  memo: string;
  amount: string;
  stablecoin: string;
  dueDate: string;
  createdAt: string;
  status: InvoiceStatus;
  confidential: boolean;
};

const TEST_INVOICE_AMOUNT_USDC = "8.86";
const paidInvoiceIds = new Set(["INV-349924"]);

const invoiceDirectory = {
  "INV-2048": {
    customerName: "Luma Comercio",
    title: "May platform invoice",
    memo: "Stablecoin checkout invoice for May platform services.",
    amount: "1,240.00",
    stablecoin: "USDC",
    dueDate: "May 30, 2026",
    createdAt: "May 10, 2026, 11:17 PM",
    status: "Succeeded" as InvoiceStatus,
    confidential: false,
  },
  "INV-2051": {
    customerName: "Porto Medical",
    title: "Treasury settlement invoice",
    memo: "Stablecoin invoice for medical supply settlement.",
    amount: "250.00",
    stablecoin: "USDC",
    dueDate: "May 30, 2026",
    createdAt: "May 7, 2026, 9:52 PM",
    status: "Succeeded" as InvoiceStatus,
    confidential: false,
  },
  "INV-2052": {
    customerName: "Seine Atelier",
    title: "Hosted checkout invoice",
    memo: "Payment request for checkout services.",
    amount: "300.00",
    stablecoin: "USDG",
    dueDate: "May 28, 2026",
    createdAt: "May 5, 2026, 9:46 PM",
    status: "Incomplete" as InvoiceStatus,
    confidential: true,
  },
  "INV-2053": {
    customerName: "Verde Freight",
    title: "Freight operations invoice",
    memo: "Stablecoin payment request for logistics services.",
    amount: "875.25",
    stablecoin: "USDC",
    dueDate: "May 25, 2026",
    createdAt: "May 3, 2026, 6:44 PM",
    status: "Succeeded" as InvoiceStatus,
    confidential: false,
  },
  "INV-2054": {
    customerName: "Atlas Robotics",
    title: "Robotics integration invoice",
    memo: "Stablecoin payment request for integration services.",
    amount: "2,050.00",
    stablecoin: "USDC",
    dueDate: "May 24, 2026",
    createdAt: "May 2, 2026, 2:11 PM",
    status: "Succeeded" as InvoiceStatus,
    confidential: false,
  },
} satisfies Record<string, InvoiceData>;

function titleFromSlug(value: string) {
  return decodeURIComponent(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace("Snitchpay.Co", "Snitchpay.co");
}

function invoiceFallback(invoiceId: string) {
  const readableId = decodeURIComponent(invoiceId);

  return {
    customerName: "Customer",
    title: "Stablecoin invoice",
    memo: "Stablecoin checkout invoice from Snitchpay.co.",
    amount: TEST_INVOICE_AMOUNT_USDC,
    stablecoin: "USDC",
    dueDate: "May 30, 2026",
    createdAt: "May 8, 2026, 1:37 PM",
    status: "Incomplete" as InvoiceStatus,
    confidential: false,
    invoiceId: readableId,
  };
}

function getSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

function normalizeStatus(value: string | undefined): InvoiceStatus | undefined {
  if (
    value === "Succeeded" ||
    value === "Failed" ||
    value === "Incomplete" ||
    value === "Refunded" ||
    value === "Disputed"
  ) {
    return value;
  }

  return undefined;
}

function parseInvoiceDate(value: string) {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function invoiceStatusWithTerm(invoice: InvoiceData) {
  if (invoice.status !== "Incomplete") {
    return invoice.status;
  }

  const dueDate = parseInvoiceDate(invoice.dueDate);

  if (!dueDate) {
    return invoice.status;
  }

  const dueEnd = new Date(dueDate);
  dueEnd.setHours(23, 59, 59, 999);

  return dueEnd.getTime() < Date.now() ? "Failed" : invoice.status;
}

function invoiceFromSearchParams(
  invoice: InvoiceData,
  searchParams: Record<string, string | string[] | undefined>,
) {
  return {
    ...invoice,
    customerName:
      getSearchValue(searchParams, "customerName") || invoice.customerName,
    title: getSearchValue(searchParams, "title") || invoice.title,
    memo: getSearchValue(searchParams, "memo") || invoice.memo,
    amount: getSearchValue(searchParams, "amount") || invoice.amount,
    stablecoin:
      getSearchValue(searchParams, "stablecoin") || invoice.stablecoin,
    dueDate: getSearchValue(searchParams, "dueDate") || invoice.dueDate,
    createdAt: getSearchValue(searchParams, "createdAt") || invoice.createdAt,
    status:
      normalizeStatus(getSearchValue(searchParams, "status")) ?? invoice.status,
    confidential:
      getSearchValue(searchParams, "confidential") === "true" ||
      invoice.confidential,
  };
}

function confidentialExplorerHref({
  account,
  shareId,
  invoiceId,
  invoice,
}: {
  account: string;
  shareId: string;
  invoiceId: string;
  invoice: InvoiceData;
}) {
  const params = new URLSearchParams({
    customerName: invoice.customerName,
    title: invoice.title,
    memo: invoice.memo,
    amount: invoice.amount,
    stablecoin: invoice.stablecoin,
    dueDate: invoice.dueDate,
    createdAt: invoice.createdAt,
    status: invoice.status,
    confidential: String(invoice.confidential),
    rail: "umbra",
    network: "devnet",
    signature: `umbra-demo-${invoiceId}`,
  });

  return `/transactions/${encodeURIComponent(account)}/${encodeURIComponent(
    shareId,
  )}/${encodeURIComponent(invoiceId)}/explorer?${params.toString()}`;
}

export async function generateMetadata({
  params,
}: InvoicePageProps): Promise<Metadata> {
  const { account, invoiceId } = await params;
  const decodedInvoiceId = decodeURIComponent(invoiceId);

  return {
    title: `${decodedInvoiceId} | ${titleFromSlug(account)}`,
    description: `Pay ${decodedInvoiceId} through Snitch stablecoin checkout.`,
  };
}

export default async function PublicInvoicePage({
  params,
  searchParams,
}: InvoicePageProps) {
  const { account, shareId, invoiceId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const decodedInvoiceId = decodeURIComponent(invoiceId);
  const merchantName = titleFromSlug(account);
  const baseInvoice =
    invoiceDirectory[decodedInvoiceId as keyof typeof invoiceDirectory] ??
    invoiceFallback(decodedInvoiceId);
  const baseInvoiceWithParams = invoiceFromSearchParams(
    baseInvoice,
    resolvedSearchParams,
  );
  const confirmedPayment = getConfirmedPayment(decodedInvoiceId);
  const invoice = {
    ...baseInvoiceWithParams,
    status: confirmedPayment || paidInvoiceIds.has(decodedInvoiceId)
      ? ("Succeeded" as InvoiceStatus)
      : invoiceStatusWithTerm(baseInvoiceWithParams),
  };
  const isCompleted = invoice.status === "Succeeded";
  const paymentStatusLabel = isCompleted ? "Payment completed" : invoice.status;
  const explorerHref = confidentialExplorerHref({
    account,
    shareId,
    invoiceId: decodedInvoiceId,
    invoice,
  });

  return (
    <main className="min-h-screen bg-background px-5 py-4 text-foreground sm:px-8">
      <header className="mx-auto flex max-w-[920px] items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex min-h-10 items-center gap-2 rounded-full pr-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Image
            src="/snitch-logo.png"
            alt="Snitch logo"
            width={30}
            height={30}
            className="shrink-0"
          />
          <span>Snitch</span>
        </Link>

        <span className="hidden rounded-full border border-border px-3 py-1 text-sm text-muted-foreground sm:inline-flex">
          Solana checkout
        </span>
      </header>

      <section className="mx-auto mt-4 w-full max-w-[720px] sm:mt-6">
        <nav
          aria-label="Invoice breadcrumb"
          className="mb-4 flex items-center justify-center gap-2 text-sm"
        >
          <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
            {merchantName}
          </span>
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="rounded-full border border-border px-3 py-1">
            Invoice
          </span>
        </nav>

        <div className="text-center">
          <span className="rounded-full border border-border px-3 py-1 text-sm">
            {decodedInvoiceId}
          </span>
          <h1 className="mt-4 text-[1.9rem] font-semibold leading-none tracking-[-0.03em] sm:text-[2.15rem]">
            Pay invoice
          </h1>
          <p className="mx-auto mt-3 max-w-[32rem] text-[0.95rem] leading-6 text-muted-foreground">
            {merchantName} sent {invoice.customerName} a stablecoin invoice.
            Review the details and continue when you are ready to pay on Solana.
          </p>
        </div>

        <div className="mt-5 w-full space-y-5 text-left">
          <section
            aria-label="Invoice amount and payment"
            className="flex flex-col gap-4 rounded-[24px] bg-muted/45 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5"
          >
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Amount due
              </p>
              <p className="mt-2 font-mono text-[2.05rem] leading-none tracking-[-0.03em] sm:text-[2.55rem]">
                {invoice.amount} {invoice.stablecoin}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="rounded-full bg-background px-3 py-1">
                  Solana
                </span>
                <span>{paymentStatusLabel}</span>
              </div>
            </div>

            <div id="payment-request" className="w-full sm:w-[230px]">
              {invoice.status === "Failed" ? (
                <div className="inline-flex h-11 w-full items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-5 text-base font-medium text-rose-700">
                  Invoice expired
                </div>
              ) : (
                <PublicInvoicePayment
                  invoiceId={decodedInvoiceId}
                  amount={invoice.amount}
                  stablecoin={invoice.stablecoin}
                  completed={isCompleted}
                  explorerHref={explorerHref}
                />
              )}
              <p className="sr-only">
                Wallet payment flow will open after the payment rail is
                connected.
              </p>
            </div>
          </section>

          <div className="mx-auto w-full max-w-[620px] space-y-5 border-t border-border pt-5">
            <dl className="grid gap-x-12 gap-y-4 sm:grid-cols-2">
              {[
                ["Customer", invoice.customerName],
                ["Merchant", merchantName],
                ["Due date", invoice.dueDate],
                ["Created", invoice.createdAt],
                ["Invoice", decodedInvoiceId],
                ["Network", "Solana"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    {label === "Due date" ? (
                      <CalendarDays className="size-4" aria-hidden="true" />
                    ) : null}
                    {label}
                  </dt>
                  <dd className="mt-1 truncate text-sm">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-4 border-t border-border pt-5">
              <section aria-label="Invoice memo">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Invoice details
                </h2>
                <p className="mt-1.5 text-sm font-medium">{invoice.title}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {invoice.memo}
                </p>
              </section>

              <section className="space-y-4" aria-label="Payment protections">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Compliance-ready payment
                  </p>
                  <p className="mt-1 text-sm leading-5">
                    Payment status is verified before the merchant dashboard is
                    updated.
                  </p>
                </div>
              {invoice.confidential ? (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Confidential payment enabled
                  </p>
                  <p className="mt-1 text-sm leading-5">
                    Financial data is protected using Umbra mainnet payment
                    infrastructure. Demo data only.
                  </p>
                </div>
              ) : null}
              </section>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
