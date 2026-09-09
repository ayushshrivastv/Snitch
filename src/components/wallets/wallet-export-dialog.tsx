"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { LoaderCircle, ShieldCheck, X } from "lucide-react";
import type { WalletExportStage } from "@/components/auth/company-wallet-export-request";
import { PrivyBrand } from "./privy-brand";

type WalletExportDialogProps = {
  companyName: string;
  wallet?: { address: string; cfoName?: string };
  onVerify?: (onStage: (stage: WalletExportStage) => void, signal: AbortSignal) => Promise<void>;
  onClose: () => void;
};

const stageLabels: Record<WalletExportStage, string> = {
  requesting: "Preparing verification…",
  signing: "Verify your CFO access in Privy.",
  verifying: "Verifying CFO access…",
  exporting: "Continue in Privy to export your wallet.",
};

const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function WalletExportDialog({ companyName, wallet, onVerify, onClose }: WalletExportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const verifyRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const headingId = useId();
  const descriptionId = useId();
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<WalletExportStage>("requesting");
  const [error, setError] = useState("");
  const unavailableReason = !wallet?.address
    ? "Connect the company wallet before exporting."
    : !onVerify
      ? "Sign in as the company’s Chief Financial Officer to export this wallet."
      : "";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  useLayoutEffect(() => {
    if (pending) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    if (verifyRef.current && !verifyRef.current.disabled) verifyRef.current.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [pending]);

  function close() {
    requestRef.current?.abort();
    dialogRef.current?.close();
    onClose();
  }

  async function verify() {
    if (requestRef.current || unavailableReason || !onVerify) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setError("");
    setStage("requesting");
    // Relinquish the native top layer before Privy opens its signing interface.
    dialogRef.current?.close();
    setPending(true);
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      controller.signal.throwIfAborted();
      await onVerify(nextStage => {
        if (mountedRef.current && !controller.signal.aborted) setStage(nextStage);
      }, controller.signal);
      controller.signal.throwIfAborted();
      if (mountedRef.current) onClose();
    } catch (cause) {
      if (mountedRef.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Verification could not be completed. Please try again.");
        setPending(false);
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        onCancel={event => { event.preventDefault(); close(); }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[440px] overflow-y-auto rounded-2xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/35 backdrop:backdrop-blur-[2px]"
      >
        <div className="p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <PrivyBrand size="sm" />
            <button type="button" onClick={close} aria-label="Close wallet export" className="-mr-2 -mt-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <h2 id={headingId} className="text-xl font-semibold tracking-tight">Export company wallet</h2>
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted-foreground">Only the company’s Chief Financial Officer can export this wallet’s private key.</p>

          <div className="mt-5 rounded-xl border border-border bg-muted/25 p-3.5">
            <p className="break-words text-sm font-medium">{companyName}</p>
            {wallet?.address ? <code className="mt-2 block select-text break-all text-xs leading-5 text-muted-foreground">{wallet.address}</code> : null}
            {wallet?.cfoName ? <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">Chief Financial Officer <span className="ml-1 font-medium text-foreground">{wallet.cfoName}</span></p> : null}
          </div>

          <div className="mt-4 flex items-start gap-2.5 text-sm leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>Verify your CFO access with a wallet signature to continue in Privy.</p>
          </div>
          {unavailableReason ? <p className="mt-4 text-sm leading-5 text-muted-foreground">{unavailableReason}</p> : null}
          {error ? <p role="alert" className="mt-4 text-sm leading-5 text-destructive">{error}</p> : null}

          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button type="button" onClick={close} className={secondaryButton}>Cancel</button>
            <button ref={verifyRef} type="button" disabled={Boolean(unavailableReason) || pending} onClick={() => void verify()} className="inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">Verify</button>
          </div>
        </div>
      </dialog>

      {pending ? (
        <div className="fixed bottom-5 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-[440px] -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-background p-3 shadow-lg">
          <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
          <p role="status" aria-live="polite" className="min-w-0 flex-1 text-sm leading-5">{stageLabels[stage]}</p>
          <button type="button" onClick={close} className={secondaryButton}>Cancel</button>
        </div>
      ) : null}
    </>
  );
}
