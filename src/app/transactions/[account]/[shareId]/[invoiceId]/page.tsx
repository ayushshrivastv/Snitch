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

function shortInvoiceReference(invoiceId: string) {
  const compact = invoiceId.replace(/^INV-/i, "");
  return `#${compact.slice(-8)}`;
}

function merchantInitials(name: string) {
  const words = name.split(/[^a-z0-9]+/i).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
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
  const shortReference = shortInvoiceReference(decodedInvoiceId);

  return (
    <main className="min-h-svh bg-background px-4 py-4 text-foreground sm:px-7 sm:py-5">
      <header className="mx-auto flex max-w-[880px] items-center justify-between gap-4">
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

        <span className="inline-flex min-h-8 items-center rounded-full border border-border px-3 text-xs font-medium text-muted-foreground">
          Secure checkout
        </span>
      </header>

      <section className="mx-auto mt-4 w-full max-w-[680px] sm:mt-5">
        <div className="text-center">
          <span className="inline-flex min-h-7 items-center rounded-full border border-border px-3 text-xs font-medium text-muted-foreground">
            Invoice {shortReference}
          </span>
          <h1 className="mt-3 text-[2rem] font-medium leading-none tracking-[-0.035em] sm:text-[2.4rem]">
            Payment request
          </h1>
          <p className="mx-auto mt-2 max-w-[32rem] text-sm leading-5 text-muted-foreground sm:text-base">
            {merchantName} requested payment from {invoice.customerName}.
          </p>
        </div>

        <section aria-label="Invoice" className="mt-5 overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
                {merchantInitials(merchantName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{merchantName}</p>
                <p className="text-xs text-muted-foreground">Invoice {shortReference}</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {paymentStatusLabel}
            </span>
          </div>

          <div className="px-5 py-5 sm:px-6">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Amount due</p>
            <p className="mt-2 font-mono text-[2.45rem] leading-none tracking-[-0.045em] sm:text-[3rem]">
              {invoice.amount} <span className="text-[0.5em] tracking-normal text-muted-foreground">ETH</span>
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-4">
              {[
                ["To", invoice.customerName],
                ["From", merchantName],
                ["Due", displayDate(invoice.dueDate)],
                ["Network", ETHEREUM_NETWORK_NAME],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 truncate text-sm font-medium" title={value}>{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex flex-col gap-4 rounded-lg bg-muted/45 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{invoice.title}</p>
                {invoice.memo && invoice.memo !== invoice.title ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{invoice.memo}</p>
                ) : null}
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">
                Created {displayDate(invoice.createdAt, true)}
              </p>
            </div>

            <div id="payment-request" className="mt-5">
              <PublicInvoicePayment
                key={decodedInvoiceId}
                invoiceId={decodedInvoiceId}
                displayReference={shortReference}
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
          </div>
        </section>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Secured by Snitch · The payment is verified before the invoice is marked complete.
        </p>
      </section>
    </main>
  );
}
