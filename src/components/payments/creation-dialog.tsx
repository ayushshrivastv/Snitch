"use client";

import { useId, useLayoutEffect, useRef, type FormEventHandler, type ReactNode } from "react";
import { Building2, X } from "lucide-react";

export const creationInputClass = "h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 aria-invalid:border-destructive";
export const creationLabelClass = "grid gap-1.5 text-sm font-medium";

export function CreationDialog({ title, description, accountName, onClose, busy = false, suspended = false, onSubmit, children, footer }: {
  title: string;
  description: string;
  accountName: string;
  onClose: () => void;
  busy?: boolean;
  suspended?: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  footer: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    if (suspended) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>("input:not([disabled])")?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [suspended]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[480px] overflow-hidden rounded-2xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/35 backdrop:backdrop-blur-[2px]"
    >
      <form noValidate onSubmit={onSubmit} aria-busy={busy} className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <h2 id={headingId} className="text-xl font-semibold tracking-tight">{title}</h2>
            <p id={descriptionId} className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} aria-label={`Close ${title.toLowerCase()} dialog`} className="-mr-2 -mt-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 pb-5 sm:px-6">
          <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-muted/60 px-3 py-2.5 text-xs">
            <span className="inline-flex min-w-0 max-w-full items-center gap-2 font-medium"><Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate" title={accountName}>{accountName}</span></span>
            <span className="shrink-0 text-muted-foreground">ETH · Ethereum Sepolia</span>
          </div>
          <fieldset disabled={busy} className="min-w-0 space-y-4">{children}</fieldset>
        </div>

        <footer className="shrink-0 border-t border-border px-5 py-4 sm:px-6">{footer}</footer>
      </form>
    </dialog>
  );
}
