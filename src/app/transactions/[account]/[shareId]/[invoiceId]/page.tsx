import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CalendarDays } from "lucide-react";

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
  const { account, invoiceId } = await params;
  const decodedInvoiceId = decodeURIComponent(invoiceId);

  return {
    title: `${decodedInvoiceId} | ${titleFromSlug(account)}`,
    description: `View ${decodedInvoiceId} and its payment status on Snitch.`,
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
          Ethereum Sepolia checkout
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
          <span className="inline-block max-w-full break-all rounded-full border border-border px-3 py-1 text-sm">
            {decodedInvoiceId}
          </span>
          <h1 className="mt-4 text-[1.9rem] font-semibold leading-none tracking-[-0.03em] sm:text-[2.15rem]">
            Pay invoice
          </h1>
          <p className="mx-auto mt-3 max-w-[32rem] text-[0.95rem] leading-6 text-muted-foreground">
            {merchantName} sent {invoice.customerName} an ETH invoice on Sepolia testnet.
            Review the invoice details and payment status below.
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
                {invoice.amount} ETH
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="rounded-full bg-background px-3 py-1">
                  {ETHEREUM_NETWORK_NAME}
                </span>
                <span>{paymentStatusLabel}</span>
              </div>
            </div>

            <div id="payment-request" className="w-full sm:w-[230px]">
              <PublicInvoicePayment
                key={decodedInvoiceId}
                invoiceId={decodedInvoiceId}
                completed={isCompleted}
                amount={invoice.amount}
                treasury={storedInvoice?.treasury}
                available={Boolean(storedInvoice?.treasury && !expired)}
                unavailableReason={expired
                  ? "This invoice has expired. You can still check a payment that was already submitted."
                  : storedInvoice
                    ? "The merchant has not configured an Ethereum treasury address."
                    : "This invoice preview cannot accept payments. Create a new invoice to enable checkout."}
                explorerUrl={confirmedPayment?.explorerUrl}
              />
            </div>
          </section>

          <div className="mx-auto w-full max-w-[620px] space-y-5 border-t border-border pt-5">
            <dl className="grid gap-x-12 gap-y-4 sm:grid-cols-2">
              {[
                ["Customer", invoice.customerName],
                ["Merchant", merchantName],
                ["Due date", displayDate(invoice.dueDate)],
                ["Created", displayDate(invoice.createdAt, true)],
                ["Invoice", decodedInvoiceId],
                ["Network", ETHEREUM_NETWORK_NAME],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    {label === "Due date" ? (
                      <CalendarDays className="size-4" aria-hidden="true" />
                    ) : null}
                    {label}
                  </dt>
                  <dd className="mt-1 truncate text-sm" title={value}>{value}</dd>
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
                    Sepolia test payment
                  </p>
                  <p className="mt-1 text-sm leading-5">
                    Use Sepolia test ETH. The recipient, amount, network, and
                    transaction receipt are verified before payment is marked complete.
                  </p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
