"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspaceSession } from "@/components/auth/workspace-session";
import { useCompanyWallets } from "@/components/auth/company-wallet-provider";
import { PLAYGROUND_ACCOUNT_ID, resolveWalletCompany } from "@/lib/company-selection";
import {
  ETHEREUM_CURRENCY,
  ETHEREUM_NETWORK_NAME,
  normalizeEthereumAddress,
  parseEthAmount,
} from "../../../services/ethereum";
import {
  CreationDialog,
  creationInputClass,
  creationLabelClass,
} from "./creation-dialog";

export type CreatedPayoutInput = {
  receiverName: string;
  receiverWallet: string;
  destinationAsset: "ETH";
  network: "Ethereum Sepolia";
  payoutAmount: string;
  approvalPolicy: string;
  treasuryAccount: string;
  memo: string;
  screenReceiverWallet: boolean;
};

type FieldErrors = {
  receiverWallet?: string;
  payoutAmount?: string;
};

export function CreatePayoutDialog({
  accountName,
  companyId,
  onClose,
  onCreatePayout,
}: {
  accountName: string;
  companyId: string;
  onClose: () => void;
  onCreatePayout: (payout: CreatedPayoutInput) => string | null | Promise<string | null>;
}) {
  const formId = useId();
  const session = useWorkspaceSession();
  const companyWallets = useCompanyWallets();
  const company = resolveWalletCompany(companyWallets?.companies ?? [], companyId);
  const walletReady = company?.wallet.status === "ready" && Boolean(company.wallet.address);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const walletInput = useRef<HTMLInputElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");

  async function connectWallet() {
    if (!companyWallets || connectingWallet) return;
    setConnectingWallet(true); setSubmitError("");
    try {
      if (companyId === PLAYGROUND_ACCOUNT_ID) await companyWallets.connectPlaygroundWallet();
      else if (company) await companyWallets.resumeWallet(company.id);
      else throw new Error("The selected company could not be loaded. Please try again.");
    } catch (error) { setSubmitError(error instanceof Error ? error.message : "Wallet setup could not be completed."); }
    finally { setConnectingWallet(false); }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || !session || !walletReady) return;

    const formData = new FormData(event.currentTarget);
    const receiverName = String(formData.get("receiverName") ?? "").trim();
    const rawWallet = String(formData.get("receiverWallet") ?? "").trim();
    const payoutAmount = String(formData.get("payoutAmount") ?? "").trim();
    const memo = String(formData.get("memo") ?? "").trim();
    const nextErrors: FieldErrors = {};
    let receiverWallet = "";

    try {
      receiverWallet = normalizeEthereumAddress(rawWallet);
    } catch {
      nextErrors.receiverWallet = rawWallet
        ? "Enter a valid, nonzero Ethereum wallet address."
        : "Enter the recipient’s wallet address.";
    }
    try {
      parseEthAmount(payoutAmount);
    } catch {
      nextErrors.payoutAmount = "Enter an ETH amount greater than 0, with up to 18 decimal places.";
    }

    setErrors(nextErrors);
    setSubmitError("");
    if (nextErrors.receiverWallet || nextErrors.payoutAmount) {
      (nextErrors.receiverWallet ? walletInput : amountInput).current?.focus();
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);
    try {
      const createdId = await onCreatePayout({
        receiverName: receiverName || "Unnamed receiver",
        receiverWallet,
        destinationAsset: ETHEREUM_CURRENCY,
        network: ETHEREUM_NETWORK_NAME,
        payoutAmount,
        approvalPolicy: "Owner approval in Privy",
        screenReceiverWallet: false,
        treasuryAccount: accountName,
        memo,
      });
      if (!createdId) {
        setSubmitError("Could not create this payout. Please try again.");
        return;
      }
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not create this payout. Please try again.");
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <CreationDialog
      title="Create payout"
      description="Send test ETH from this company’s wallet."
      accountName={accountName}
      onClose={onClose}
      busy={isSubmitting || connectingWallet}
      suspended={isSubmitting || connectingWallet}
      onSubmit={handleSubmit}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-xs leading-5 text-muted-foreground">
            Approve with Privy.
          </p>
          <Button type="button" variant="ghost" className="h-10 rounded-lg px-4" disabled={isSubmitting} onClick={onClose}>
            Cancel
          </Button>
          {!session ? <a href="/login" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Sign in to continue</a> : !walletReady ? <Button type="button" disabled={connectingWallet || companyWallets?.loading || !companyWallets} className="h-10 rounded-lg px-4" onClick={() => void connectWallet()}>{companyWallets?.loading ? "Loading wallet…" : "Connect wallet"}</Button> : <Button type="submit" className="h-10 min-w-32 rounded-lg px-4" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? "Opening Privy…" : "Review in Privy"}
          </Button>}
        </div>
      }
    >
      <fieldset disabled={isSubmitting} className="grid min-w-0 gap-4">
        <legend className="sr-only">Payout request</legend>

        <label htmlFor={`${formId}-name`} className={creationLabelClass}>
          <span>Recipient name <span className="font-normal text-muted-foreground">(optional)</span></span>
          <input
            id={`${formId}-name`}
            name="receiverName"
            maxLength={120}
            type="text"
            autoComplete="name"
            spellCheck={false}
            placeholder="Sophia Mendes"
            className={creationInputClass}
          />
        </label>

        <div className="grid gap-1.5">
          <label htmlFor={`${formId}-wallet`} className={creationLabelClass}>
            <span>Wallet address <span className="font-normal text-muted-foreground">(required)</span></span>
            <input
              ref={walletInput}
              id={`${formId}-wallet`}
              name="receiverWallet"
              type="text"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="0x…"
              aria-invalid={Boolean(errors.receiverWallet)}
              aria-describedby={errors.receiverWallet ? `${formId}-wallet-error` : undefined}
              onChange={() => setErrors(current => ({ ...current, receiverWallet: undefined }))}
              className={cn(creationInputClass, "font-mono")}
            />
          </label>
          {errors.receiverWallet ? (
            <p id={`${formId}-wallet-error`} role="alert" className="text-xs leading-5 text-destructive">{errors.receiverWallet}</p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <label htmlFor={`${formId}-amount`} className={creationLabelClass}>
            <span>Amount <span className="sr-only">in ETH </span><span className="font-normal text-muted-foreground">(required)</span></span>
            <span className="relative block">
              <input
                ref={amountInput}
                id={`${formId}-amount`}
                name="payoutAmount"
                type="text"
                inputMode="decimal"
                required
                autoComplete="off"
                spellCheck={false}
                placeholder="0.01"
                aria-invalid={Boolean(errors.payoutAmount)}
                aria-describedby={errors.payoutAmount ? `${formId}-amount-error` : undefined}
                onChange={() => setErrors(current => ({ ...current, payoutAmount: undefined }))}
                className={cn(creationInputClass, "pr-14 tabular-nums")}
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">ETH</span>
            </span>
          </label>
          {errors.payoutAmount ? (
            <p id={`${formId}-amount-error`} role="alert" className="text-xs leading-5 text-destructive">{errors.payoutAmount}</p>
          ) : null}
        </div>

        <details className="group">
          <summary
            aria-disabled={isSubmitting || undefined}
            tabIndex={isSubmitting ? -1 : 0}
            onClick={event => { if (isSubmitting) event.preventDefault(); }}
            className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 rounded-sm text-sm font-normal text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
          >
            Add a note
            <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </summary>
          <label htmlFor={`${formId}-memo`} className={cn(creationLabelClass, "mt-2")}>
            <span className="sr-only">Payout note (optional)</span>
            <textarea
              id={`${formId}-memo`}
              name="memo"
              maxLength={1000}
              rows={2}
              autoComplete="off"
              placeholder="What is this payout for?"
              className={cn(creationInputClass, "h-auto min-h-20 resize-y py-2")}
            />
          </label>
        </details>
      </fieldset>
      {submitError ? <p role="alert" className="mt-4 text-sm leading-5 text-destructive">{submitError}</p> : null}
    </CreationDialog>
  );
}
