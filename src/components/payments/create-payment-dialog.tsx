"use client";

import { useRef, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceSession } from "@/components/auth/workspace-session";
import { useCompanyWallets } from "@/components/auth/company-wallet-provider";
import { PLAYGROUND_ACCOUNT_ID, resolveWalletCompany } from "@/lib/company-selection";
import { CreationDialog, creationInputClass, creationLabelClass } from "./creation-dialog";
import { ETHEREUM_CURRENCY, ETHEREUM_NETWORK_NAME, parseEthAmount } from "../../../services/ethereum";

export type CreatedPaymentInput = {
  companyId: string;
  walletCompanyId?: string;
  invoiceId: string;
  customerName: string;
  invoiceTitle: string;
  memo: string;
  dueDate: string;
  amount: string;
  currency: "ETH";
  paymentTerms: string;
  treasuryAccount: string;
};

export function CreatePaymentDialog({ accountName, companyId, onClose, onCreatePayment }: {
  accountName: string;
  companyId: string;
  onClose: () => void;
  onCreatePayment: (payment: CreatedPaymentInput) => void;
}) {
  const session = useWorkspaceSession();
  const companyWallets = useCompanyWallets();
  const company = resolveWalletCompany(companyWallets?.companies ?? [], companyId);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [dateError, setDateError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [today] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  const isShowcase = companyId === PLAYGROUND_ACCOUNT_ID;
  const requiresSignIn = !session || needsSignIn;
  const walletReady = company?.wallet.status === "ready" && Boolean(company.wallet.address);

  async function connectWallet() {
    if (!companyWallets || connectingWallet) return;
    setConnectingWallet(true); setSubmitError("");
    try {
      if (isShowcase) await companyWallets.connectPlaygroundWallet();
      else if (company) await companyWallets.resumeWallet(company.id);
      else throw new Error("The selected company could not be loaded. Please try again.");
    } catch (error) { setSubmitError(error instanceof Error ? error.message : "Wallet setup could not be completed."); }
    finally { setConnectingWallet(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || requiresSignIn || !walletReady || !company) return;
    setSubmitError(""); setAmountError(""); setDateError("");
    if (!companyId) { setSubmitError("The selected company is unavailable. Close this form and try again."); return; }

    const formData = new FormData(event.currentTarget);
    const customerName = String(formData.get("customerName") ?? "").trim() || "Unnamed customer";
    const invoiceTitle = String(formData.get("invoiceTitle") ?? "").trim() || "ETH invoice";
    const invoiceAmount = String(formData.get("invoiceAmount") ?? "").trim();
    const dueDate = String(formData.get("dueDate") ?? "").trim() || today;
    const memo = String(formData.get("memo") ?? "").trim();
    try { parseEthAmount(invoiceAmount); }
    catch { setAmountError("Enter a positive ETH amount, up to 18 decimal places."); amountRef.current?.focus(); return; }
    const dueTimestamp = Date.parse(dueDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(dueTimestamp) || new Date(dueTimestamp).toISOString().slice(0, 10) !== dueDate) {
      setDateError("Enter a valid due date."); dateRef.current?.focus(); return;
    }
    if (dueDate < today) {
      setDateError("The due date cannot be in the past."); dateRef.current?.focus(); return;
    }

    setIsSubmitting(true);
    try {
      const payment: Omit<CreatedPaymentInput, "invoiceId"> = { companyId, walletCompanyId: company.id, customerName, invoiceTitle, memo, dueDate, amount: invoiceAmount, currency: ETHEREUM_CURRENCY, paymentTerms: "Due on receipt", treasuryAccount: accountName };
      const accessToken = await session?.getAccessToken();
      if (!accessToken) { setNeedsSignIn(true); setSubmitError("Sign in again to create this invoice."); return; }
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ companyId: company.id, customerName, invoiceTitle, invoiceAmount, dueDate, memo, currency: ETHEREUM_CURRENCY, network: ETHEREUM_NETWORK_NAME, paymentTerms: "Due on receipt", treasuryAccount: accountName }),
      });
      if (!response.ok) {
        if (response.status === 401) setNeedsSignIn(true);
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error ?? "Could not create this payment. Please try again.");
      }
      const invoice = await response.json() as { invoiceId?: string };
      if (!invoice.invoiceId) throw new Error("The invoice reference was missing. Check your transactions before trying again.");
      onCreatePayment({ ...payment, invoiceId: invoice.invoiceId });
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not create this payment. Please try again.");
    } finally { setIsSubmitting(false); }
  }

  return (
    <CreationDialog
      title="Create payment"
      description={requiresSignIn ? "Sign in to create a payment to your company wallet." : walletReady ? "Request a payment to your company wallet." : "Connect this company’s Privy wallet to receive test ETH."}
      accountName={accountName}
      onClose={onClose}
      busy={isSubmitting || connectingWallet}
      suspended={connectingWallet}
      onSubmit={event => void submit(event)}
      footer={<div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" className="h-10 rounded-lg px-4" disabled={isSubmitting} onClick={onClose}>Cancel</Button>
        {requiresSignIn ? <a href="/login" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Sign in to continue</a>
          : !walletReady ? <Button type="button" disabled={connectingWallet || companyWallets?.loading || !companyWallets} className="h-10 rounded-lg px-4" onClick={() => void connectWallet()}>{connectingWallet ? "Connecting…" : companyWallets?.loading ? "Loading wallet…" : "Connect wallet"}</Button>
          : <Button type="submit" disabled={isSubmitting} className="h-10 rounded-lg px-4">{isSubmitting ? "Creating…" : "Create payment"}</Button>}
      </div>}
    >
      <label className={creationLabelClass}>
        <span>Customer <span className="font-normal text-muted-foreground">(optional)</span></span>
        <input name="customerName" autoComplete="organization" spellCheck={false} placeholder="Company or customer name" className={creationInputClass} />
      </label>
      <label className={creationLabelClass}>
        <span>Payment for <span className="font-normal text-muted-foreground">(optional)</span></span>
        <input name="invoiceTitle" placeholder="Design services" className={creationInputClass} />
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={creationLabelClass}>
          <span>Amount <span className="text-muted-foreground">*</span></span>
          <span className="relative">
            <input ref={amountRef} name="invoiceAmount" type="text" inputMode="decimal" autoComplete="off" required placeholder="0.00" aria-invalid={Boolean(amountError)} aria-describedby={amountError ? "payment-amount-error" : undefined} onChange={() => { if (amountError) setAmountError(""); }} className={`${creationInputClass} pr-14 tabular-nums`} />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">ETH</span>
          </span>
          {amountError ? <span id="payment-amount-error" role="alert" className="text-xs font-normal text-destructive">{amountError}</span> : null}
        </label>
        <label className={creationLabelClass}>
          Due date
          <input ref={dateRef} name="dueDate" type="date" min={today} defaultValue={today} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? "payment-date-error" : undefined} onChange={() => { if (dateError) setDateError(""); }} className={creationInputClass} />
          {dateError ? <span id="payment-date-error" role="alert" className="text-xs font-normal text-destructive">{dateError}</span> : null}
        </label>
      </div>
      <details className="group">
        <summary className="flex min-h-8 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">Add a note <ChevronDown className="size-3.5 group-open:rotate-180" aria-hidden="true" /></summary>
        <label className={`${creationLabelClass} mt-2`}>
          <span className="sr-only">Invoice note</span>
          <textarea name="memo" rows={2} placeholder="A note for your customer" className={`${creationInputClass} h-auto resize-y py-2`} />
        </label>
      </details>
      {submitError ? <p role="alert" className="text-sm text-destructive">{submitError}</p> : null}
    </CreationDialog>
  );
}
