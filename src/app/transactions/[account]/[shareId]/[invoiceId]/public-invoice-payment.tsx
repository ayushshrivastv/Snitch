"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getEthereumExplorerUrl, sendEthPayment } from "../../../../../../services/ethereum";

type PublicInvoicePaymentProps = {
  invoiceId: string;
  displayReference: string;
  amount: string;
  treasury?: string;
  available: boolean;
  unavailableReason: string;
  completed: boolean;
  explorerUrl?: string;
};

type PaymentStatusResponse = {
  error?: string;
  code?: string;
  payment?: {
    status?: "Succeeded";
    explorerUrl?: string;
  } | null;
};

export function PublicInvoicePayment({
  invoiceId,
  displayReference,
  amount,
  treasury,
  available,
  unavailableReason,
  completed,
  explorerUrl,
}: PublicInvoicePaymentProps) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentStatusResponse["payment"]>(null);
  const [isCompletedModalOpen, setIsCompletedModalOpen] = useState(false);
  const [pendingHash, setPendingHash] = useState<string | null>(null);
  const [statusReady, setStatusReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");
  const paymentInFlight = useRef(false);
  const isPaid = completed || payment?.status === "Succeeded";
  const confirmedExplorerUrl = payment?.explorerUrl || explorerUrl;
  const pendingStorageKey = `snitch:sepolia:pending:${invoiceId}`;

  useEffect(() => {
    let cancelled = false;

    async function syncPaymentStatus() {
      let savedHash: string | null = null;
      try {
        savedHash = window.sessionStorage.getItem(pendingStorageKey);
      } catch {
        // Checkout still works if browser storage is disabled.
      }

      const response = await fetch(
        `/api/payments/status?invoiceId=${encodeURIComponent(invoiceId)}`,
        { cache: "no-store" },
      ).catch(() => null);
      const result = response?.ok
        ? await response.json().catch(() => null) as PaymentStatusResponse | null
        : null;

      if (cancelled) return;
      if (result?.payment?.status === "Succeeded") {
        setPayment(result.payment);
      } else if (savedHash && /^0x[0-9a-fA-F]{64}$/.test(savedHash)) {
        setPendingHash(savedHash);
        setMessage("A payment was submitted. Check its confirmation before sending again.");
      }
      setStatusReady(true);
    }

    void syncPaymentStatus();
    return () => { cancelled = true; };
  }, [invoiceId, pendingStorageKey]);

  function clearPendingPayment() {
    setPendingHash(null);
    try {
      window.sessionStorage.removeItem(pendingStorageKey);
    } catch {
      // Component state remains usable when browser storage is unavailable.
    }
  }

  function showCompletedPayment(confirmedPayment: NonNullable<PaymentStatusResponse["payment"]>) {
    setPayment(confirmedPayment);
    clearPendingPayment();
    setMessage("");
    setIsCompletedModalOpen(true);
    router.refresh();
  }

  async function confirmPayment(transactionHash: string) {
    const response = await fetch("/api/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId, transactionHash }),
    });
    const result = await response.json().catch(() => null) as PaymentStatusResponse | null;

    if (!response.ok || result?.payment?.status !== "Succeeded") {
      if (result?.code === "transaction_reverted") {
        clearPendingPayment();
        throw new Error(available
          ? "The transaction reverted. No invoice payment was made; you can submit a new payment."
          : "The transaction reverted. No invoice payment was made. Contact the merchant for a new invoice.");
      }
      throw new Error(result?.error || "The transaction is awaiting confirmation. Check payment status again shortly.");
    }

    showCompletedPayment(result.payment);
  }

  async function handlePayment() {
    if (
      paymentInFlight.current || isPaid || !statusReady ||
      (!pendingHash && (!available || !treasury))
    ) return;
    paymentInFlight.current = true;
    setIsBusy(true);
    setMessage("");

    try {
      let transactionHash = pendingHash;
      if (!transactionHash) {
        if (!available || !treasury) return;
        const statusResponse = await fetch(
          `/api/payments/status?invoiceId=${encodeURIComponent(invoiceId)}`,
          { cache: "no-store" },
        );
        const currentStatus = await statusResponse.json().catch(() => null) as PaymentStatusResponse | null;
        if (!statusResponse.ok || !currentStatus || !("payment" in currentStatus)) {
          throw new Error("Unable to check the invoice status. Please try again before sending a payment.");
        }
        if (currentStatus.payment?.status === "Succeeded") {
          showCompletedPayment(currentStatus.payment);
          return;
        }
        const submitted = await sendEthPayment({ to: treasury, amount, invoiceId });
        transactionHash = submitted.transactionHash;
        setPendingHash(transactionHash);
        try {
          window.sessionStorage.setItem(pendingStorageKey, transactionHash);
        } catch {
          // Keep the transaction in component state when storage is unavailable.
        }
      }
      await confirmPayment(transactionHash);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to process the payment. Please try again.");
    } finally {
      paymentInFlight.current = false;
      setIsBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      {isPaid ? (
        <button
          type="button"
          onClick={() => setIsCompletedModalOpen(true)}
          className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-haspopup="dialog"
        >
          <Check className="size-4" aria-hidden="true" />
          Payment completed
        </button>
      ) : (
        <>
          <Button
            type="button"
            disabled={(!available && !pendingHash) || !statusReady || isBusy}
            onClick={() => void handlePayment()}
            className="min-h-11 w-full whitespace-normal rounded-lg text-sm font-medium"
          >
            {isBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isBusy
              ? pendingHash ? "Confirming payment…" : "Continue in wallet…"
              : pendingHash
                ? "Check payment status"
                : available ? `Pay ${amount} ETH` : "Payments unavailable"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {available ? "Continue with an Ethereum wallet on Sepolia." : unavailableReason}
          </p>
          {message ? (
            <p role="status" aria-live="polite" className="text-center text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}
          {pendingHash ? (
            <a
              href={getEthereumExplorerUrl(pendingHash)}
              target="_blank"
              rel="noreferrer"
              className="text-center text-sm underline underline-offset-4"
            >
              View pending transaction
            </a>
          ) : null}
        </>
      )}

      {isPaid && confirmedExplorerUrl ? (
        <a
          href={confirmedExplorerUrl}
          target="_blank"
          rel="noreferrer"
          className="mx-auto inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          View transaction
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      ) : null}

      {isCompletedModalOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-white/95 px-4 py-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsCompletedModalOpen(false);
            }
          }}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="absolute left-[11%] top-[13%] h-8 w-3 rotate-[-18deg] rounded-full bg-[#ffcf00]" />
            <span className="absolute left-[18%] top-[20%] size-3 rounded-full bg-[#3dfb27]" />
            <span className="absolute left-[30%] top-[9%] h-7 w-2 rotate-[29deg] rounded-full bg-[#3dfb27]" />
            <span className="absolute left-[42%] top-[11%] h-8 w-3 rotate-[-19deg] rounded-full bg-[#ffcf00]" />
            <span className="absolute right-[20%] top-[9%] h-3 w-3 rounded-sm bg-[#ffcf00]" />
            <span className="absolute right-[14%] top-[18%] h-7 w-3 rotate-[24deg] rounded-full bg-[#2fbaf0]" />
            <span className="absolute right-[9%] top-[31%] h-8 w-3 rotate-[-24deg] rounded-full bg-[#ffcf00]" />
            <span className="absolute left-[9%] bottom-[21%] h-9 w-3 rotate-[18deg] rounded-full bg-[#8b4ff6]" />
            <span className="absolute left-[17%] bottom-[18%] size-4 rotate-[32deg] bg-[#2fbaf0]" />
            <span className="absolute right-[18%] bottom-[22%] h-4 w-8 rotate-[12deg] bg-[#f3165b]" />
            <span className="absolute right-[9%] bottom-[14%] size-4 rounded-full bg-[#f3168a]" />
          </div>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-success-title"
            className="relative w-full max-w-[460px] rounded-[3px] border border-border/60 bg-background px-9 py-9 text-left shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setIsCompletedModalOpen(false)}
              className="absolute right-5 top-5 rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close payment success dialog"
            >
              <X className="size-5" aria-hidden="true" />
            </button>

            <div className="grid size-10 place-items-center rounded-full bg-[#77bf5f] text-white">
              <Check className="size-5" aria-hidden="true" />
            </div>

            <h2
              id="payment-success-title"
              className="mt-6 text-3xl font-semibold tracking-[-0.03em]"
            >
              Payment succeeded!
            </h2>
            <p className="mt-3 max-w-[22rem] text-base leading-6 text-muted-foreground">
              Thank you for completing invoice {displayReference}. Snitchpay.co has
              recorded this payment as complete.
            </p>

            {confirmedExplorerUrl ? (
              <a
                href={confirmedExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-[4px] bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Explorer
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
