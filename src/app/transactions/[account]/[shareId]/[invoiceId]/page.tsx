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
    <main className="h-svh overflow-hidden bg-background px-4 py-4 text-foreground sm:px-7 sm:py-5">
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

        <span className="text-xs font-medium text-muted-foreground">
          Secure checkout
        </span>
      </header>

      <section
        aria-label="Invoice"
        className="mx-auto flex w-full max-w-[560px] flex-col items-center pt-5 text-center sm:pt-9"
      >
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {paymentStatusLabel}
        </span>
        <h1 className="mt-3 text-[2rem] font-medium leading-[1.05] tracking-[-0.04em] sm:text-[2.65rem]">
          {merchantName} sent you a bill.
        </h1>
        <p className="mt-3 max-w-[30rem] text-sm leading-5 text-muted-foreground sm:text-base">
          {invoice.title} · Due {displayDate(invoice.dueDate)}
        </p>

        <div className="mt-7 sm:mt-9">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Amount due
          </p>
          <p className="mt-2 font-mono text-[3.25rem] leading-none tracking-[-0.06em] sm:text-[4rem]">
            {invoice.amount}
            <span className="ml-2 text-[0.34em] tracking-normal text-muted-foreground">ETH</span>
          </p>
        </div>

        <dl className="mt-7 grid w-full grid-cols-3 gap-4 sm:mt-9">
          {[
            ["From", merchantName],
            ["For", invoice.customerName],
            ["Network", ETHEREUM_NETWORK_NAME],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 truncate text-sm font-medium" title={value}>{value}</dd>
            </div>
          ))}
        </dl>

        {invoice.memo && invoice.memo !== invoice.title ? (
          <p className="mt-5 line-clamp-2 max-w-[34rem] text-sm leading-5 text-muted-foreground">
            {invoice.memo}
          </p>
        ) : null}

        <div id="payment-request" className="mt-7 w-full max-w-[360px] sm:mt-9">
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

        <p className="mt-4 text-xs text-muted-foreground">
          Secured by Snitch · Payment is verified onchain.
        </p>
      </section>
    </main>
  );
}
