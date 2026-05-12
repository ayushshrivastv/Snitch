import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  ExternalLink,
  LockKeyhole,
  ReceiptText,
  Route,
  ShieldCheck,
} from "lucide-react";

type ConfidentialExplorerPageProps = {
  params: Promise<{
    account: string;
    shareId: string;
    invoiceId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

function shortValue(value: string) {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function makeUmbraAddress(seed: string) {
  const compact = seed.replace(/[^a-zA-Z0-9]/g, "");
  const left = compact.padEnd(8, "U").slice(0, 8);
  const right = compact.padStart(8, "9").slice(-8);

  return `Umbra${left}...${right}`;
}

function checkoutHref({
  account,
  shareId,
  invoiceId,
  searchParams,
}: {
  account: string;
  shareId: string;
  invoiceId: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (!value) {
      continue;
    }

    params.set(key, Array.isArray(value) ? value[0] : value);
  }

  return `/transactions/${encodeURIComponent(account)}/${encodeURIComponent(
    shareId,
  )}/${encodeURIComponent(invoiceId)}?${params.toString()}`;
}

export async function generateMetadata({
  params,
}: ConfidentialExplorerPageProps): Promise<Metadata> {
  const { invoiceId } = await params;
  const decodedInvoiceId = decodeURIComponent(invoiceId);

  return {
    title: `${decodedInvoiceId} confidential transaction | Snitch`,
    description: "Umbra confidential payment explanation for this invoice.",
  };
}

export default async function ConfidentialExplorerPage({
  params,
  searchParams,
}: ConfidentialExplorerPageProps) {
  const { account, shareId, invoiceId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const decodedInvoiceId = decodeURIComponent(invoiceId);
  const merchantName = titleFromSlug(account);
  const customerName =
    getSearchValue(resolvedSearchParams, "customerName") || "Customer";
  const title = getSearchValue(resolvedSearchParams, "title") || "Invoice";
  const memo =
    getSearchValue(resolvedSearchParams, "memo") ||
    "Confidential stablecoin payment.";
  const amount = getSearchValue(resolvedSearchParams, "amount") || "1.00";
  const stablecoin =
    getSearchValue(resolvedSearchParams, "stablecoin") || "USDC";
  const dueDate = getSearchValue(resolvedSearchParams, "dueDate") || "May 30, 2026";
  const createdAt =
    getSearchValue(resolvedSearchParams, "createdAt") || "May 11, 2026";
  const signature =
    getSearchValue(resolvedSearchParams, "signature") ||
    `umbra-demo-${decodedInvoiceId}`;
  const network = getSearchValue(resolvedSearchParams, "network") || "devnet";
  const recipientUmbraAddress = makeUmbraAddress(
    `${merchantName}-${decodedInvoiceId}`,
  );
  const privateNote = `utxo-${decodedInvoiceId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`;
  const backHref = checkoutHref({
    account,
    shareId,
    invoiceId: decodedInvoiceId,
    searchParams: resolvedSearchParams,
  });

  const steps = [
    {
      title: "Customer signs the payment",
      copy: `${customerName} approves ${amount} ${stablecoin} for ${title}. The wallet signs the Umbra action instead of exposing a direct merchant transfer.`,
      icon: ReceiptText,
    },
    {
      title: "Umbra creates a private claim",
      copy: `The payment is routed to ${recipientUmbraAddress}, producing a receiver-claimable private note (${privateNote}).`,
      icon: LockKeyhole,
    },
    {
      title: "Public link is hidden",
      copy: "A normal explorer can see an Umbra program interaction, but not the customer-to-merchant relationship behind the invoice.",
      icon: EyeOff,
    },
    {
      title: "Snitchpay verifies completion",
      copy: `Snitchpay records the Umbra proof and marks ${decodedInvoiceId} as paid. Authorized reporting can still use internal records or viewing keys.`,
      icon: ShieldCheck,
    },
  ];

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

        <span className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">
          Umbra confidential explorer
        </span>
      </header>

      <section className="mx-auto mt-4 w-full max-w-[820px] sm:mt-6">
        <Link
          href={backHref}
          className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to invoice
        </Link>

        <div className="mt-4 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm">
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
            Payment succeeded
          </span>
          <h1 className="mt-4 text-[1.9rem] font-semibold leading-none tracking-[-0.03em] sm:text-[2.15rem]">
            Confidential transaction
          </h1>
          <p className="mx-auto mt-3 max-w-[39rem] text-[0.95rem] leading-6 text-muted-foreground">
            This page explains what happened when {customerName} paid{" "}
            {merchantName} for {title} through Umbra. The payment is complete,
            but the direct wallet relationship is not exposed like a standard
            Solana transfer.
          </p>
        </div>

        <div className="mt-6 grid gap-5">
          <section
            aria-label="Confidential transaction summary"
            className="rounded-[24px] bg-muted/45 p-5 sm:px-6"
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Amount paid
                </p>
                <p className="mt-2 font-mono text-[2rem] leading-none tracking-[-0.03em] sm:text-[2.45rem]">
                  {amount} {stablecoin}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="rounded-full bg-background px-3 py-1">
                    {network}
                  </span>
                  <span>{decodedInvoiceId}</span>
                  <span>{createdAt}</span>
                </div>
              </div>

              <div className="rounded-[18px] border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Public trace
                </p>
                <dl className="mt-3 grid gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Visible program</dt>
                    <dd className="mt-1 font-medium">Umbra payment rail</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Signature</dt>
                    <dd className="mt-1 font-mono text-xs">
                      {shortValue(signature)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          <section
            aria-label="Umbra confidential payment flow"
            className="rounded-[24px] border border-border bg-background p-5 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <Route className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em]">
                  How Umbra handled this transaction
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Umbra uses private addresses and shielded payment state so the
                  chain can verify the transfer without publishing the full
                  business context around it.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {steps.map((step, index) => {
                const Icon = step.icon;

                return (
                  <div
                    key={step.title}
                    className="grid gap-3 rounded-[18px] bg-muted/45 p-4 sm:grid-cols-[2.5rem_minmax(0,1fr)]"
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-background text-muted-foreground">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">
                        {index + 1}. {step.title}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">
                        {step.copy}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            aria-label="Visible versus protected transaction data"
            className="grid gap-4 lg:grid-cols-2"
          >
            <div className="rounded-[24px] border border-border bg-background p-5">
              <h2 className="text-sm font-semibold">What remains visible</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                {[
                  ["Invoice", decodedInvoiceId],
                  ["Status", "Succeeded"],
                  ["Merchant record", merchantName],
                  ["Due date", dueDate],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-b-0 last:pb-0"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="truncate text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-[24px] border border-border bg-background p-5">
              <h2 className="text-sm font-semibold">What is protected</h2>
              <ul className="mt-4 grid gap-3 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Standard explorers do not show a direct customer wallet to
                  merchant treasury link.
                </li>
                <li className="flex gap-2">
                  <LockKeyhole
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  The receiver-facing claim is represented by an Umbra private
                  note instead of a plain transfer row.
                </li>
                <li className="flex gap-2">
                  <ShieldCheck
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  The merchant can still reconcile the invoice and provide
                  selective audit access when required.
                </li>
              </ul>
            </div>
          </section>

          <section
            aria-label="Invoice context"
            className="rounded-[24px] border border-border bg-background p-5"
          >
            <h2 className="text-sm font-semibold">Invoice context</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {memo}
            </p>
            <a
              href="https://www.datawallet.com/crypto/umbra-privacy-on-solana-explained"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Umbra reference
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </section>
        </div>
      </section>
    </main>
  );
}
