"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useConnectWallet, usePrivy, useWallets } from "@privy-io/react-auth";

import { Button } from "@/components/ui/button";
import { SnitchAuthProvider } from "@/components/auth/privy-provider";
import { runInvoiceCheckout } from "@/lib/invoice-checkout";
import { forgetPendingInvoicePayment, readPendingInvoicePayment, rememberPendingInvoicePayment } from "@/lib/pending-invoice-payment";
import { getEthereumExplorerUrl, isEthereumTransactionHash, type EthereumWallet } from "../../../../../../services/ethereum";

type CheckoutProps = {
  invoiceId: string;
  amount: string;
  treasury?: string;
  merchantName: string;
  available: boolean;
  unavailableReason: string;
  completed: boolean;
  explorerUrl?: string;
  children: ReactNode;
};

type PaymentStatusResponse = {
  error?: string;
  code?: string;
  pendingPayment?: { transactionHash: string } | null;
  failedPayment?: { transactionHash: string } | null;
  payment?: { status?: "Succeeded"; explorerUrl?: string } | null;
};

type PaymentAction = {
  busy: boolean;
  statusReady: boolean;
  available: boolean;
  pendingHash: string | null;
  message: string;
  unavailableReason: string;
  pay: () => Promise<void>;
};
const PaymentContext = createContext<PaymentAction | null>(null);

function savedHash(invoiceId: string): string | null {
  try {
    // Migrate pending checkouts from the former tab-only storage.
    const hash = readPendingInvoicePayment(invoiceId, window.localStorage) ||
      readPendingInvoicePayment(invoiceId, window.sessionStorage);
    if (hash) rememberPendingInvoicePayment(invoiceId, hash, window.localStorage);
    return hash;
  } catch { return null; }
}

function saveHash(invoiceId: string, hash: string | null) {
  try { rememberPendingInvoicePayment(invoiceId, hash, window.localStorage); } catch { /* Storage can be disabled. */ }
  try { rememberPendingInvoicePayment(invoiceId, hash, window.sessionStorage); } catch { /* Retain in-memory recovery too. */ }
}

/** Wallet connection requires no customer profile or workspace login. */
function PrivyCheckout(props: CheckoutProps) {
  const { ready } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const connection = useRef<{ resolve: (wallet: EthereumWallet) => void; reject: (error: Error) => void } | null>(null);
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      const pending = connection.current;
      connection.current = null;
      if (!pending) return;
      if (wallet.type !== "ethereum") { pending.reject(new Error("Choose an Ethereum wallet.")); return; }
      void wallet.getEthereumProvider().then(pending.resolve, () => pending.reject(new Error("Unable to open this wallet. Please try again.")));
    },
    onError: () => {
      connection.current?.reject(new Error("Wallet connection was cancelled. You can try again."));
      connection.current = null;
    },
  });
  useEffect(() => () => {
    connection.current?.reject(new Error("Checkout closed before wallet connection completed."));
    connection.current = null;
  }, []);
  const getWallet = async (): Promise<EthereumWallet> => {
    if (!ready) throw new Error("Your wallet connection is loading. Please try again shortly.");
    // Never silently select a company treasury or an arbitrary wallet among several.
    const external = wallets.filter(wallet => wallet.walletClientType !== "privy");
    if (walletsReady && external.length === 1) return external[0].getEthereumProvider();
    return new Promise((resolve, reject) => {
      connection.current = { resolve, reject };
      try { connectWallet({ walletChainType: "ethereum-only", description: "Connect your wallet to pay this invoice." }); }
      catch { connection.current = null; reject(new Error("Unable to open wallet connection. Please try again.")); }
    });
  };
  return <CheckoutState {...props} getWallet={getWallet} />;
}

export function PublicInvoiceCheckout(props: CheckoutProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  return appId
    ? <SnitchAuthProvider appId={appId}><PrivyCheckout {...props} /></SnitchAuthProvider>
    : <CheckoutState {...props} getWallet={async () => {
      const wallet = (window as Window & { ethereum?: EthereumWallet }).ethereum;
      if (!wallet) throw new Error("Connect an Ethereum wallet to pay this invoice.");
      return wallet;
    }} />;
}

function CheckoutState({ invoiceId, amount, treasury, merchantName, available, unavailableReason, completed, explorerUrl, children, getWallet }: CheckoutProps & { getWallet: () => Promise<EthereumWallet> }) {
  const [payment, setPayment] = useState<PaymentStatusResponse["payment"]>(null);
  const [pendingHash, setPendingHash] = useState<string | null>(null);
  const [statusReady, setStatusReady] = useState(completed);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<string | null>(null);
  const inFlight = useRef(false);
  const polling = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const isPaid = completed || payment?.status === "Succeeded";

  useEffect(() => { if (isPaid) successHeading.current?.focus(); }, [isPaid]);

  const remember = useCallback((hash: string | null) => {
    pending.current = hash;
    saveHash(invoiceId, hash);
    if (!lifetime.current?.signal.aborted) setPendingHash(hash);
  }, [invoiceId]);

  const forgetReverted = useCallback((hash: string) => {
    try { forgetPendingInvoicePayment(invoiceId, hash, window.localStorage); } catch { /* Storage can be disabled. */ }
    try { forgetPendingInvoicePayment(invoiceId, hash, window.sessionStorage); } catch { /* Keep other attempts. */ }
    if (pending.current?.toLowerCase() === hash.toLowerCase()) {
      pending.current = savedHash(invoiceId);
      if (!lifetime.current?.signal.aborted) setPendingHash(pending.current);
    }
  }, [invoiceId]);

  const acceptSuccess = useCallback((value: NonNullable<PaymentStatusResponse["payment"]>) => {
    if (lifetime.current?.signal.aborted) return;
    setPayment(value);
    remember(null);
    setMessage("");
    setStatusReady(true);
  }, [remember]);

  const confirm = useCallback(async (hash: string, signal: AbortSignal) => {
    const response = await fetch("/api/payments/confirm", {
      method: "POST", signal, keepalive: true, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId, transactionHash: hash }),
    });
    const result = await response.json() as PaymentStatusResponse;
    if (response.ok && result.payment?.status === "Succeeded") { acceptSuccess(result.payment); return; }
    if (result.code === "transaction_reverted") {
      forgetReverted(hash);
      throw new Error("The transaction reverted. You can submit a new payment.");
    }
    throw new Error(result.error || "Waiting for blockchain confirmation. This page will update automatically.");
  }, [invoiceId, acceptSuccess, forgetReverted]);

  const syncStatus = useCallback(async (signal: AbortSignal) => {
    const response = await fetch(`/api/payments/status?invoiceId=${encodeURIComponent(invoiceId)}`, { cache: "no-store", signal });
    const result = await response.json() as PaymentStatusResponse;
    if (!response.ok || !("payment" in result)) throw new Error(result.error || "Unable to check payment status. Please try again.");
    signal.throwIfAborted();
    setStatusReady(true);
    if (result.payment?.status === "Succeeded") { acceptSuccess(result.payment); return true; }
    const localHash = savedHash(invoiceId) || pending.current;
    if (localHash && result.failedPayment?.transactionHash.toLowerCase() === localHash.toLowerCase()) {
      forgetReverted(localHash);
      setMessage("The transaction reverted. You can submit a new payment.");
      return false;
    }
    const hash = localHash || result.pendingPayment?.transactionHash;
    if (isEthereumTransactionHash(hash)) {
      remember(hash);
      await confirm(hash, signal);
      return true;
    }
    return false;
  }, [invoiceId, acceptSuccess, remember, forgetReverted, confirm]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const refresh = async () => {
      if (isPaid || !treasury || polling.current || inFlight.current || controller.signal.aborted) return;
      polling.current = true;
      try { await syncStatus(controller.signal); }
      catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to check payment status. Please try again.");
      } finally { polling.current = false; }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, [isPaid, treasury, syncStatus]);

  async function pay() {
    if (inFlight.current || isPaid) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    const signal = lifetime.current?.signal;
    const execute = async () => {
      if (!signal) return;
      await runInvoiceCheckout({
        invoiceId, amount, treasury, available, signal,
        pendingHash: () => pending.current || savedHash(invoiceId),
        checkStatus: syncStatus, getWallet, rememberHash: remember, confirm,
      });
    };
    try {
      if (navigator.locks) await navigator.locks.request(`snitch-invoice:${invoiceId}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error("This invoice is open for payment in another tab. Check its status before continuing.");
        await execute();
      });
      else await execute();
    } catch (error) {
      if (!signal?.aborted) setMessage(error instanceof Error ? error.message : "Unable to process payment. Please try again.");
    } finally {
      inFlight.current = false;
      if (!signal?.aborted) setBusy(false);
    }
  }

  if (isPaid) {
    const confirmedUrl = payment?.explorerUrl || explorerUrl;
    return <section className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col items-center justify-center px-2 pb-10 text-center" aria-labelledby="payment-success-title">
      <div className="grid size-24 place-items-center rounded-full bg-emerald-100 sm:size-28" aria-hidden="true">
        <div className="grid size-16 place-items-center rounded-full bg-emerald-500 sm:size-20"><Check className="size-9 text-white sm:size-11" strokeWidth={2.5} /></div>
      </div>
      <h1 ref={successHeading} id="payment-success-title" className="mt-7 text-3xl font-semibold tracking-tight outline-none sm:text-4xl" tabIndex={-1}>Payment successful</h1>
      <p className="mt-4 max-w-sm text-base leading-6 text-muted-foreground" role="status">Your payment to {merchantName} has been confirmed and recorded.</p>
      {confirmedUrl ? <a href={confirmedUrl} target="_blank" rel="noreferrer" className="mt-8 inline-flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">View at Explorer <ExternalLink className="size-4" aria-hidden="true" /></a> : null}
    </section>;
  }
  if (pendingHash) return <section className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col items-center justify-center px-2 pb-8 text-center" aria-labelledby="payment-pending-title">
    <Loader2 className="size-10 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
    <h1 id="payment-pending-title" className="mt-7 text-3xl font-semibold tracking-tight">Confirming payment</h1>
    <p className="mt-4 text-sm leading-6 text-muted-foreground" role="status">{message || "Your transaction has been submitted. This page updates when the blockchain confirms it."}</p>
    <a href={getEthereumExplorerUrl(pendingHash)} target="_blank" rel="noreferrer" className="mt-7 inline-flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">View at Explorer <ExternalLink className="size-4" aria-hidden="true" /></a>
    <button type="button" disabled={busy} onClick={() => void pay()} className="mt-3 min-h-10 rounded-lg px-4 text-sm text-muted-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Check payment status</button>
  </section>;
  return <PaymentContext.Provider value={{ busy, statusReady, available, pendingHash, message, unavailableReason, pay }}>{children}</PaymentContext.Provider>;
}

export function PublicInvoicePayment() {
  const action = useContext(PaymentContext);
  if (!action) return null;
  return <div className="grid gap-2">
    <Button type="button" disabled={(!action.available && !action.pendingHash) || action.busy} onClick={() => void action.pay()} className="min-h-12 w-full whitespace-normal rounded-lg text-sm font-medium">
      {action.busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
      {action.busy ? action.pendingHash ? "Confirming payment…" : "Open your wallet…" : !action.available ? "Payments unavailable" : action.pendingHash || !action.statusReady ? "Check payment status" : "Pay"}
    </Button>
    {!action.available && !action.pendingHash ? <p className="text-center text-xs text-muted-foreground">{action.unavailableReason}</p> : null}
    {action.message ? <p role="status" aria-live="polite" className="text-center text-xs leading-4 text-muted-foreground">{action.message}</p> : null}
    {action.pendingHash ? <a href={getEthereumExplorerUrl(action.pendingHash)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center text-xs underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View pending transaction</a> : null}
  </div>;
}
