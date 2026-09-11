import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { getConfirmedPayment } from "@/lib/payment-confirmations";
import { getInvoice } from "@/lib/invoices";
import { isInvoiceExpired } from "@/lib/invoice-lifecycle";
import { formatRecordDateTime, formatSavedRecordDate } from "@/lib/record-date";
import { TEST_INVOICE_AMOUNT_ETH } from "../../../../../../services/ethereum";
import { PublicInvoiceCheckout, PublicInvoicePayment } from "./public-invoice-payment";

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

function displayDate(value: string, includeTime = false) {
  // Saved display dates already contain their intended wall time.
  if (includeTime && /^[A-Za-z]+ \d/.test(value)) return formatSavedRecordDate(value);
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return formatRecordDateTime(new Date(timestamp), { timeZone: "UTC", includeTime });
}

function numericInvoiceNumber(invoiceId: string) {
  let hash = BigInt(0);
  for (const character of invoiceId.toUpperCase()) {
    hash = (hash * BigInt(131) + BigInt(character.charCodeAt(0))) % BigInt("1000000000000");
  }
  return hash.toString().padStart(12, "0");
}

function barcodeBars(value: string) {
  let seed = 2_166_136_261;
  for (const character of value) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16_777_619) >>> 0;
  }

  let x = 0;
  return Array.from({ length: 58 }, (_, index) => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    const width = 1 + (seed % 3);
    const gap = 1 + ((seed >>> 5) % 2);
    const bar = {
      height: index % 13 === 0 || index % 17 === 0 ? 56 : 48,
      width,
      x,
    };
    x += width + gap;
    return bar;
  });
}

function InvoiceBarcode({ seed }: { seed: string }) {
  const bars = barcodeBars(seed);
  const width = bars[bars.length - 1]?.x ?? 220;
  const digits = `${numericInvoiceNumber(seed)}${String(seed.length % 100).padStart(2, "0")}`;

  return (
    <svg
      viewBox={`0 0 ${width + 4} 72`}
      className="mx-auto h-[72px] w-full max-w-[250px]"
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {bars.map((bar, index) => (
        <rect
          key={index}
          x={bar.x + 2}
          y={56 - bar.height}
          width={bar.width}
          height={bar.height}
          fill="currentColor"
        />
      ))}
      <text x="2" y="69" fontSize="8" fill="currentColor">
        {digits.slice(0, 1)}
      </text>
      <text x={width * 0.18} y="69" fontSize="8" letterSpacing="3.8" fill="currentColor">
        {digits.slice(1, 8)}
      </text>
      <text x={width * 0.62} y="69" fontSize="8" letterSpacing="3.8" fill="currentColor">
        {digits.slice(8)}
      </text>
    </svg>
  );
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
  const expired = Boolean(storedInvoice && !isCompleted && isInvoiceExpired(storedInvoice.dueDate));
  const invoiceNumber = numericInvoiceNumber(decodedInvoiceId);
  return (
    <main className="flex h-svh flex-col overflow-hidden bg-[#f7f8fa] px-4 py-4 text-[#17191d] [color-scheme:light] sm:px-7 sm:py-5">
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

      <PublicInvoiceCheckout
        key={decodedInvoiceId}
        invoiceId={decodedInvoiceId}
        merchantName={merchantName}
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
      >
      <section className="mx-auto flex min-h-0 w-full max-w-[420px] flex-1 items-center justify-center py-3 sm:py-5">
        <section
          aria-labelledby="payment-title"
          className="relative w-full overflow-hidden rounded-[26px] bg-white px-7 pb-9 pt-7 text-center shadow-[0_22px_70px_rgba(23,25,29,0.08)] sm:px-9 sm:pt-8"
        >
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-background shadow-[0_8px_28px_rgba(23,25,29,0.10)] ring-1 ring-border/40">
            <Image
              src="/snitch-logo.png"
              alt=""
              width={32}
              height={32}
              aria-hidden="true"
            />
          </div>

          <h1 id="payment-title" className="mt-5 text-[1.9rem] font-semibold leading-none tracking-[-0.04em] sm:text-[2.1rem]">
            Invoice
          </h1>
          <p className="mx-auto mt-2 max-w-[18rem] text-sm leading-5 text-muted-foreground">
            {invoice.title} from {merchantName}
          </p>

          <div className="relative -mx-7 mt-7 sm:-mx-9" aria-hidden="true">
            <span className="absolute -left-3 -top-3 size-6 rounded-full bg-[#f7f8fa]" />
            <span className="absolute -right-3 -top-3 size-6 rounded-full bg-[#f7f8fa]" />
            <div className="mx-10 border-t border-dashed border-muted-foreground/55" />
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 py-6 text-left">
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Invoice no.</dt>
              <dd className="mt-1 truncate font-mono text-base font-normal tracking-[-0.01em] tabular-nums" title={invoiceNumber}>
                {invoiceNumber}
              </dd>
            </div>
            <div className="min-w-0 text-right">
              <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Amount</dt>
              <dd className="mt-1 truncate font-mono text-base font-normal tracking-[-0.01em] tabular-nums">
                {invoice.amount} ETH
              </dd>
            </div>
            <div className="col-span-2 min-w-0">
              <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Date &amp; time</dt>
              <dd className="mt-1 truncate text-base font-normal" title={displayDate(invoice.createdAt, true)}>
                {displayDate(invoice.createdAt, true)}
              </dd>
            </div>
          </dl>

          <div id="payment-request" className="w-full">
            <PublicInvoicePayment />
          </div>

          <div className="relative -mx-7 mt-6 sm:-mx-9" aria-hidden="true">
            <div className="border-t-4 border-dashed border-[#f7f8fa]" />
          </div>

          <div className="pt-5">
            <InvoiceBarcode seed={decodedInvoiceId} />
          </div>

          <div className="pointer-events-none absolute inset-x-0 -bottom-3 flex justify-around px-1" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <span key={index} className="size-6 rounded-full bg-[#f7f8fa]" />
            ))}
          </div>
        </section>
      </section>
      </PublicInvoiceCheckout>
    </main>
  );
}
