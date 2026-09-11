import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { getConfirmedPayment } from "@/lib/payment-confirmations";
import { getInvoice } from "@/lib/invoices";
import { formatRecordDateTime, formatSavedRecordDate } from "@/lib/record-date";
import { TEST_INVOICE_AMOUNT_ETH } from "../../../../../../services/ethereum";
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

function numericInvoiceNumber(invoiceId: string) {
  let hash = BigInt(0);
  for (const character of invoiceId.toUpperCase()) {
    hash = (hash * BigInt(131) + BigInt(character.charCodeAt(0))) % BigInt("1000000000000");
  }
  return hash.toString().padStart(12, "0");
}

const EAN_LEFT = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const EAN_LEFT_EVEN = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const EAN_RIGHT = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];
const EAN_PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

function ean13(value: string) {
  const checksum = value
    .split("")
    .reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  const encoded = `${value}${(10 - (checksum % 10)) % 10}`;
  const parity = EAN_PARITY[Number(encoded[0])];
  const left = encoded
    .slice(1, 7)
    .split("")
    .map((digit, index) => (parity[index] === "L" ? EAN_LEFT : EAN_LEFT_EVEN)[Number(digit)])
    .join("");
  const right = encoded
    .slice(7)
    .split("")
    .map((digit) => EAN_RIGHT[Number(digit)])
    .join("");

  return { bits: `101${left}01010${right}101`, encoded };
}

function InvoiceBarcode({ value }: { value: string }) {
  const { bits, encoded } = ean13(value);

  return (
    <svg
      viewBox="0 0 214 72"
      className="mx-auto h-[72px] w-full max-w-[250px]"
      role="img"
      aria-label={`Barcode for invoice ${value}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform="translate(12 0)">
        {bits.split("").map((bit, index) => bit === "1" ? (
          <rect
            key={index}
            x={index * 2}
            y="0"
            width="2"
            height={index < 3 || (index >= 45 && index < 50) || index >= 92 ? 54 : 47}
            fill="currentColor"
          />
        ) : null)}
      </g>
      <text x="12" y="69" fontSize="9" letterSpacing="4.3" fill="currentColor">
        {encoded.slice(0, 7)}
      </text>
      <text x="116" y="69" fontSize="9" letterSpacing="4.3" fill="currentColor">
        {encoded.slice(7)}
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
  const expired = Boolean(storedInvoice && !isCompleted && isExpired(storedInvoice.dueDate));
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

          <div className="relative -mx-7 mt-6 sm:-mx-9" aria-hidden="true">
            <div className="border-t-4 border-dashed border-[#f7f8fa]" />
          </div>

          <div className="pt-5">
            <InvoiceBarcode value={invoiceNumber} />
          </div>

          <div className="pointer-events-none absolute inset-x-0 -bottom-3 flex justify-around px-1" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <span key={index} className="size-6 rounded-full bg-[#f7f8fa]" />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
