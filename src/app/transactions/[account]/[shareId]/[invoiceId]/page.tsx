import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { getConfirmedPayment } from "@/lib/payment-confirmations";
import { getInvoice } from "@/lib/invoices";
import { formatRecordDateTime, formatSavedRecordDate } from "@/lib/record-date";
import { ETHEREUM_NETWORK_NAME, TEST_INVOICE_AMOUNT_ETH } from "../../../../../../services/ethereum";
import { PublicInvoicePayment } from "./public-invoice-payment";

type InvoicePageProps = {
  params: Promise<{
    account: string;
    shareId: string;
    invoiceId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type InvoiceData = {
  customerName: string;
  title: string;
  memo: string;
  amount: string;
  dueDate: string;
  createdAt: string;
};

function titleFromSlug(value: string) {
  return decodeURIComponent(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace("Snitchpay.Co", "Snitchpay.co");
}

function getSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function previewInvoice(
  searchParams: Record<string, string | string[] | undefined>,
): InvoiceData {
  return {
    customerName: getSearchValue(searchParams, "customerName") || "Customer",
    title: getSearchValue(searchParams, "title") || "ETH invoice preview",
    memo: getSearchValue(searchParams, "memo") || "ETH checkout invoice from Snitchpay.co.",
    amount: getSearchValue(searchParams, "amount") || TEST_INVOICE_AMOUNT_ETH,
    dueDate: getSearchValue(searchParams, "dueDate") || "Not set",
    createdAt: getSearchValue(searchParams, "createdAt") || "Not set",
  };
}

function isExpired(dueDate: string) {
  const timestamp = Date.parse(dueDate);
  if (Number.isNaN(timestamp)) return false;
  const dueEnd = new Date(timestamp);
  dueEnd.setUTCHours(23, 59, 59, 999);
  return dueEnd.getTime() < Date.now();
}

function displayDate(value: string, includeTime = false) {
  // Saved display dates already contain their intended wall time.
  if (includeTime && /^[A-Za-z]+ \d/.test(value)) return formatSavedRecordDate(value);
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return formatRecordDateTime(new Date(timestamp), { timeZone: "UTC", includeTime });
}

export async function generateMetadata({
  params,
}: InvoicePageProps): Promise<Metadata> {
  const { account } = await params;
  const merchantName = titleFromSlug(account);

  return {
    title: `Invoice | ${merchantName}`,
    description: `Review and pay an invoice from ${merchantName} on Snitch.`,
  };
}

export default async function PublicInvoicePage({
  params,
  searchParams,
}: InvoicePageProps) {
  const { account, invoiceId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const decodedInvoiceId = decodeURIComponent(invoiceId);
  const storedInvoice = await getInvoice(decodedInvoiceId);
  const merchantName = storedInvoice?.treasuryAccount || titleFromSlug(account);
  const invoice = storedInvoice ?? previewInvoice(resolvedSearchParams);
  const confirmedPayment = storedInvoice ? await getConfirmedPayment(decodedInvoiceId) : undefined;
  const isCompleted = confirmedPayment?.status === "Succeeded";
  const expired = Boolean(storedInvoice && !isCompleted && isExpired(storedInvoice.dueDate));
  const paymentStatusLabel = isCompleted
    ? "Payment completed"
    : expired
      ? "Expired"
      : storedInvoice ? "Incomplete" : "Preview";
  return (
    <main className="flex h-svh flex-col overflow-hidden bg-background px-4 py-4 text-foreground sm:px-7 sm:py-5">
      <header className="mx-auto flex w-full max-w-[980px] items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg pr-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

        <span className="text-xs font-medium text-muted-foreground">
          Secure checkout
        </span>
      </header>

      <section className="mx-auto flex min-h-0 w-full max-w-[420px] flex-1 items-center justify-center py-4 sm:py-6">
        <section
          aria-labelledby="payment-title"
          className="w-full overflow-hidden rounded-[24px] border border-border/75 bg-background px-6 py-7 text-center shadow-[0_18px_55px_rgba(23,25,29,0.06)] sm:px-8 sm:py-8"
        >
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-background shadow-[0_8px_28px_rgba(23,25,29,0.10)] ring-1 ring-border/50">
            <Image
              src="/snitch-logo.png"
              alt=""
              width={32}
              height={32}
              aria-hidden="true"
            />
          </div>

          <p className="mt-5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {paymentStatusLabel}
          </p>
          <h1 id="payment-title" className="mt-2 text-[1.9rem] font-medium leading-none tracking-[-0.04em] sm:text-[2.15rem]">
            Pay invoice
          </h1>
          <p className="mx-auto mt-2 max-w-[18rem] text-sm leading-5 text-muted-foreground">
            {merchantName} sent you an invoice.
          </p>

          <div className="relative -mx-6 mt-6 sm:-mx-8" aria-hidden="true">
            <span className="absolute -left-3 -top-3 size-6 rounded-full bg-background ring-1 ring-border/60" />
            <span className="absolute -right-3 -top-3 size-6 rounded-full bg-background ring-1 ring-border/60" />
            <div className="mx-7 border-t border-dashed border-border sm:mx-9" />
          </div>

          <dl className="grid grid-cols-2 gap-x-5 gap-y-5 py-6 text-left">
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Amount</dt>
              <dd className="mt-1 flex items-baseline gap-1.5 truncate font-mono text-xl font-normal tracking-[-0.025em] tabular-nums">
                <span>{invoice.amount}</span>
                <span className="text-xs tracking-normal text-muted-foreground">ETH</span>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Due date</dt>
              <dd className="mt-1 truncate text-sm font-normal" title={displayDate(invoice.dueDate)}>
                {displayDate(invoice.dueDate)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Invoice details</dt>
              <dd className="mt-1 truncate text-sm font-normal" title={invoice.title}>
                {invoice.title}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Network</dt>
              <dd className="mt-1 truncate text-sm font-normal" title={ETHEREUM_NETWORK_NAME}>
                {ETHEREUM_NETWORK_NAME}
              </dd>
            </div>
          </dl>

          <div className="relative -mx-6 sm:-mx-8" aria-hidden="true">
            <span className="absolute -left-3 -top-3 size-6 rounded-full bg-background ring-1 ring-border/60" />
            <span className="absolute -right-3 -top-3 size-6 rounded-full bg-background ring-1 ring-border/60" />
            <div className="mx-7 border-t border-dashed border-border sm:mx-9" />
          </div>

          <div id="payment-request" className="mt-6 w-full">
            <PublicInvoicePayment
              key={decodedInvoiceId}
              invoiceId={decodedInvoiceId}
              completed={isCompleted}
              amount={invoice.amount}
              treasury={storedInvoice?.treasury}
              available={Boolean(storedInvoice?.treasury && !expired)}
              unavailableReason={expired
                ? "This invoice has expired. Check any payment already submitted."
                : storedInvoice
                  ? "The company wallet is not ready to receive payment."
                  : "This invoice preview cannot accept payment."}
              explorerUrl={confirmedPayment?.explorerUrl}
            />
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Secured by Snitch · Verified onchain
          </p>
        </section>
      </section>
    </main>
  );
}
