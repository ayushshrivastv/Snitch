"use client";

import Image from "next/image";
import { useId, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Building2, Check, ChevronRight, Copy, Download, KeyRound, RefreshCw, Search, ShieldCheck, Users, Wallet } from "lucide-react";
import { summarizeWalletActivity, type WalletActivity } from "@/lib/wallet-activity";
import { cn } from "@/lib/utils";
import { formatExactEthAmount } from "@/lib/wallet-chart-data";
import { WalletAnalytics } from "./wallet-analytics";
import { TreasuryOverview, type UsdTreasurySnapshot } from "./treasury-overview";
import { PrivyBrand } from "./privy-brand";
import { WalletExportDialog } from "./wallet-export-dialog";
import type { WalletExportStage } from "@/components/auth/company-wallet-export-request";

export type WalletPageProps = {
  companyName: string;
  environment: "Playground" | "Testnet";
  wallet?: { address: string; cfoName?: string; createdAt?: string };
  usdOverview?: UsdTreasurySnapshot;
  balance: string | null;
  balanceState: "loading" | "ready" | "error" | "unavailable";
  balanceError?: string;
  updatedAt?: string;
  activity: WalletActivity[];
  onRefresh?: () => void;
  onExportWallet?: (onStage: (stage: WalletExportStage) => void, signal: AbortSignal) => Promise<void>;
  onSetupWallet?: () => Promise<unknown>;
  onViewPayments: () => void;
  onViewPayouts: () => void;
  onManageCompanies: () => void;
  onManageAccess?: () => void;
  setupLabel?: string;
  signInToConnect?: boolean;
};

const actionClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
const linkClass = "inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const labelClass = "font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground";
const tabs = ["Overview", "Activity", "Wallet settings"] as const;

function NetworkMark({ network }: { network: WalletActivity["network"] }) {
  const isBase = network === "Base Sepolia";
  return <span className="inline-flex items-center gap-2 whitespace-nowrap"><Image src={isBase ? "/payment-methods/base.svg" : "/payment-methods/ethereum.svg"} alt="" width={20} height={20} className="size-5" />{isBase ? "Base Sepolia" : "Ethereum Sepolia"}</span>;
}

function ActivityStatus({ status }: { status: WalletActivity["status"] }) {
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium", status === "Succeeded" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : status === "Failed" ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-muted text-muted-foreground")}><span className="size-1.5 rounded-full bg-current" />{status}</span>;
}

export function WalletPage({ companyName, wallet, usdOverview, balance, balanceState, balanceError, updatedAt, activity, onRefresh, onExportWallet, onSetupWallet, onViewPayments, onViewPayouts, onManageCompanies, onManageAccess, setupLabel, signInToConnect }: WalletPageProps) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [filter, setFilter] = useState<"all" | "payment" | "payout">("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<"setup" | null>(null);
  const [actionError, setActionError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const actionLock = useRef(false);
  const walletDetailsRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const totals = useMemo(() => summarizeWalletActivity(activity), [activity]);
  const sortedActivity = useMemo(() => [...activity].sort((a, b) => Date.parse(b.dateTime) - Date.parse(a.dateTime)), [activity]);
  const filteredActivity = sortedActivity.filter(item => (filter === "all" || item.kind === filter) && `${item.counterparty} ${item.reference} ${item.network} ${item.status}`.toLowerCase().includes(search.trim().toLowerCase()));
  const visibleActivity = tab === "Overview" ? sortedActivity.slice(0, 5) : filteredActivity;

  async function perform(kind: "setup", action?: () => Promise<unknown>) {
    if (!action || actionLock.current) return;
    actionLock.current = true; setBusy(kind); setActionError("");
    try { await action(); }
    catch (error) { setActionError(error instanceof Error ? error.message : "This action could not be completed. Please try again."); }
    finally { actionLock.current = false; setBusy(null); }
  }

  async function copyAddress() {
    if (!wallet) return;
    try { await navigator.clipboard.writeText(wallet.address); setCopied(true); setActionError(""); }
    catch { setActionError("Could not copy the address. Select and copy it below."); }
  }

  function showWalletDetails() {
    walletDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    walletDetailsRef.current?.focus({ preventScroll: true });
  }

  const exportControl = <button type="button" className={cn(actionClass, "border-foreground bg-foreground text-background hover:bg-foreground/90")} onClick={() => setExportOpen(true)}><Download className="size-4 shrink-0" aria-hidden="true" />Export Privy company wallet</button>;

  const setupControl = signInToConnect
    ? <a href="/login" className={actionClass}>Sign in to connect <ArrowRight className="size-4" aria-hidden="true" /></a>
    : <button type="button" className={actionClass} disabled={Boolean(busy)} onClick={() => onSetupWallet ? void perform("setup", onSetupWallet) : onManageCompanies()}>{busy === "setup" ? "Setting up…" : onSetupWallet ? setupLabel || "Finish wallet setup" : "Company accounts"}<ArrowRight className="size-4" aria-hidden="true" /></button>;

  const connectionLabel = <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("size-1.5 rounded-full", wallet ? "bg-emerald-600" : "bg-muted-foreground/60")} />{wallet ? "Connected" : "Not connected"}</span>;

  const addressControl = wallet ? <div className="mt-3 flex items-stretch overflow-hidden rounded-md border border-border bg-background">
    <code className="min-w-0 flex-1 select-all break-all px-3 py-3 font-mono text-xs leading-5">{wallet.address}</code>
    <button type="button" aria-label={copied ? "Wallet address copied" : "Copy wallet address"} onClick={() => void copyAddress()} className="flex min-h-10 w-11 shrink-0 items-center justify-center border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}</button>
  </div> : null;

  const walletDetails = <section ref={walletDetailsRef} tabIndex={-1} aria-label="Company wallet details" className="flex min-w-0 flex-col rounded-lg border border-border bg-muted/25 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><PrivyBrand size="md" />{connectionLabel}</div>
    <div className="mt-6"><p className={labelClass}>Company wallet</p><h2 className="mt-2 text-lg font-semibold tracking-tight">{companyName}</h2></div>
    {wallet ? <>
      {addressControl}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground"><NetworkMark network="Ethereum Sepolia" /><a className={cn(linkClass, "text-xs")} href={"https://sepolia.etherscan.io/address/" + wallet.address} target="_blank" rel="noreferrer">Explorer <ArrowUpRight className="size-3.5" aria-hidden="true" /></a></div>
      {usdOverview ? <div className="mb-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs">
        <div><p className="text-muted-foreground">Onchain balance</p><p className="mt-1 font-medium tabular-nums">{balanceState === "loading" ? "Loading…" : balanceState === "ready" && balance !== null ? `${formatExactEthAmount(balance)} ETH` : "Unavailable"}</p></div>
        {onRefresh ? <button type="button" aria-label="Refresh onchain balance" onClick={onRefresh} disabled={balanceState === "loading"} className="flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><RefreshCw className={cn("size-4", balanceState === "loading" && "motion-safe:animate-spin")} aria-hidden="true" /></button> : null}
      </div> : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs"><span className="text-muted-foreground">Chief Financial Officer</span><span className="font-medium">{wallet.cfoName || "Assigned CFO"}</span></div>
    </> : <>
      <p className="mb-5 mt-2 max-w-sm text-sm leading-6 text-muted-foreground">A dedicated wallet for your company’s funds, secured by Privy.</p>
      <div className="mt-auto">{setupControl}</div>
    </>}
  </section>;

  const walletSettings = <div className="space-y-6">

      <section aria-label="Wallet export" className="flex min-w-0 flex-col rounded-lg border border-border bg-muted/25 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4"><span className={labelClass}>Private key access</span><KeyRound className="size-4 text-muted-foreground" aria-hidden="true" /></div>
        <PrivyBrand size="lg" className="mt-8" />
        <h2 className="mt-6 font-serif text-3xl leading-tight tracking-tight">Your wallet.<br />Your access.</h2>
        <p className="mb-7 mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Export your company wallet through Privy. Access is reserved for your Chief Financial Officer.</p>
        <div className="mt-auto border-t border-border pt-5">{exportControl}<p className="mt-3 text-xs leading-5 text-muted-foreground">Your private key stays in Privy’s protected export window.</p></div>
      </section>
    <section aria-label="Company wallet configuration">
      <p className={cn(labelClass, "mb-3")}>Manage this wallet</p>
      <div className="grid gap-3 md:grid-cols-2">
        <button type="button" className="group flex min-h-24 items-center gap-4 rounded-lg border border-border bg-background p-5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onManageCompanies}><Building2 className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Company account</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Manage the company behind this wallet.</span></span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" /></button>
        {onManageAccess ? <button type="button" className="group flex min-h-24 items-center gap-4 rounded-lg border border-border bg-background p-5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onManageAccess}><Users className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Team access</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">View your CFO and company roles in Connect.</span></span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" /></button> : null}
      </div>
    </section>
  </div>;

  return <div className="relative mx-auto w-full max-w-[1400px] px-4 py-6 text-foreground sm:px-7 lg:px-8 lg:py-8">
    <div className="mb-6 flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><Wallet className="size-3.5 shrink-0" aria-hidden="true" /><span>Wallets</span><ChevronRight className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{companyName}</span></div>
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div><h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-[42px]">Your company treasury.</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Balances, transfers, and wallet access. All in one place.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" className={actionClass} onClick={onViewPayments}>View payments <ArrowUpRight className="size-4" aria-hidden="true" /></button>{exportControl}</div>
    </header>

    <div role="tablist" aria-label="Wallet sections" className="mt-7 flex gap-6 border-b border-border">
      {tabs.map((item, index) => <button key={item} ref={element => { tabRefs.current[index] = element; }} type="button" role="tab" id={`${id}-tab-${index}`} aria-selected={tab === item} aria-controls={`${id}-panel`} tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)} onKeyDown={event => { let next: number; if (event.key === "ArrowRight") next = (index + 1) % tabs.length; else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length; else if (event.key === "Home") next = 0; else if (event.key === "End") next = tabs.length - 1; else return; event.preventDefault(); setTab(tabs[next]); tabRefs.current[next]?.focus(); }} className={cn("relative min-h-11 whitespace-nowrap border-b-2 px-0.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === item ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{item}</button>)}
    </div>
    {actionError ? <p role="alert" className="mt-4 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{actionError}</p> : null}

    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tabs.indexOf(tab)}`} className="pt-6">
      {tab === "Overview" ? <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className={labelClass}>Treasury at a glance</h2><span className="text-xs text-muted-foreground">{usdOverview ? "USD" : "ETH · Ethereum Sepolia"}</span></div>
        {usdOverview ? <>
          <TreasuryOverview data={usdOverview} onWalletDetails={showWalletDetails} onViewPayments={onViewPayments} onViewPayouts={onViewPayouts} />
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2 px-1 text-xs text-muted-foreground">
            <span><strong className="mr-1.5 font-semibold text-foreground tabular-nums">{totals.receivedCount}</strong>payments received</span>
            <span><strong className="mr-1.5 font-semibold text-foreground tabular-nums">{totals.paidOutCount}</strong>payouts completed</span>
            <span><strong className="mr-1.5 font-semibold text-foreground tabular-nums">{totals.pendingCount}</strong>pending requests</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">{walletDetails}<WalletAnalytics activity={activity} networkOnly /></div>
        </> : <>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <section aria-label="Treasury balance" className="relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
            <div className="relative flex-1 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground"><Wallet className="size-4" aria-hidden="true" /></span><h2 className="text-sm font-medium text-muted-foreground">Available balance</h2></div>{onRefresh ? <button type="button" aria-label="Refresh treasury balance" disabled={balanceState === "loading"} onClick={onRefresh} className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><RefreshCw className={cn("size-4", balanceState === "loading" && "motion-safe:animate-spin")} aria-hidden="true" /></button> : null}</div>
              {balanceState === "loading" ? <div role="status" aria-label="Loading wallet balance" className="my-6 h-12 w-48 rounded-lg bg-muted motion-safe:animate-pulse" /> : <p className="mt-6 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 tabular-nums"><span className={cn("break-all font-medium leading-tight tracking-tight", balance && balance.length > 14 ? "text-2xl sm:text-4xl" : "text-4xl sm:text-5xl")}>{balanceState === "error" ? "Unavailable" : balance === null ? "—" : formatExactEthAmount(balance)}</span>{balance !== null && balanceState === "ready" ? <span className="text-lg font-medium text-muted-foreground">ETH</span> : null}</p>}
              <p className={cn("mt-3 text-xs leading-5", balanceState === "error" ? "text-destructive" : "text-muted-foreground")}>{balanceState === "error" ? balanceError || "Could not load balance. Try refreshing." : wallet ? <><span className="mr-2 inline-block size-1.5 rounded-full bg-emerald-500" />Ethereum Sepolia{updatedAt ? ` · Updated ${new Date(updatedAt).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}` : ""}</> : "Connect your company wallet to view its balance."}</p>
              <div className="mt-5 flex flex-wrap gap-2">{wallet ? <button type="button" className={actionClass} onClick={showWalletDetails}><ArrowDownLeft className="size-4" aria-hidden="true" />Receive ETH</button> : null}<button type="button" className={actionClass} onClick={onViewPayouts}><ArrowUpRight className="size-4" aria-hidden="true" />Payouts</button><button type="button" className={cn(linkClass, "px-2 text-muted-foreground")} onClick={showWalletDetails}><KeyRound className="size-3.5" aria-hidden="true" />Wallet details <ChevronRight className="size-3.5" aria-hidden="true" /></button></div>
            </div>
            <div className="relative grid grid-cols-3 divide-x divide-border/70 border-t border-border/70 bg-muted/20 px-2 py-4 sm:px-4">
              <div className="px-3"><p className="text-xs text-muted-foreground">Payments</p><p className="mt-1 text-xl font-semibold tabular-nums">{totals.receivedCount}<span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">received</span></p></div>
              <div className="px-3"><p className="text-xs text-muted-foreground">Payouts</p><p className="mt-1 text-xl font-semibold tabular-nums">{totals.paidOutCount}<span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">completed</span></p></div>
              <div className="px-3"><p className="text-xs text-muted-foreground">Pending</p><p className="mt-1 text-xl font-semibold tabular-nums">{totals.pendingCount}<span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">requests</span></p></div>
            </div>
          </section>
          {walletDetails}
        </div>
        <WalletAnalytics activity={activity} />
        </>}

      </div> : null}

      {tab === "Wallet settings" ? walletSettings : null}

      {tab !== "Wallet settings" ? <section aria-label="Wallet activity" className={cn("overflow-hidden rounded-lg border border-border bg-background", tab === "Overview" && "mt-6")}>
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><h2 className="text-sm font-semibold">{tab === "Overview" ? "Recent activity" : "All activity"}</h2><p className="mt-1 text-xs text-muted-foreground">{"Payments and payouts for this company."}</p></div>{tab === "Overview" ? <button type="button" className={linkClass} onClick={() => setTab("Activity")}>View all activity <ArrowRight className="size-4" aria-hidden="true" /></button> : <label className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" /><span className="sr-only">Search wallet activity</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search activity" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-60" /></label>}</header>
        {tab === "Activity" ? <div aria-label="Activity type" className="flex flex-wrap gap-2 border-t border-border px-5 py-3">{([['all','All activity'],['payment','Payments'],['payout','Payouts']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn("min-h-10 rounded-lg px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", filter === value ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50")}>{label}</button>)}</div> : null}
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-y border-border bg-muted/25 text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Transaction</th><th className="px-4 py-3 font-medium">Network</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Date</th><th className="px-5 py-3 text-right font-medium">Amount</th></tr></thead><tbody className="divide-y divide-border">{visibleActivity.map(item => <tr key={`${item.kind}-${item.id}`} className="hover:bg-muted/20"><td className="px-5 py-3.5"><div className="flex items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">{item.kind === "payment" ? <ArrowDownLeft className="size-4" aria-hidden="true" /> : <ArrowUpRight className="size-4" aria-hidden="true" />}</span><div className="min-w-0"><p className="max-w-56 truncate font-medium" title={item.counterparty}>{item.counterparty}</p>{item.explorerUrl ? <a href={item.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-7 max-w-56 items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`View ${item.reference} on explorer`}><span className="truncate">{item.reference}</span><ArrowUpRight className="size-3 shrink-0" aria-hidden="true" /></a> : <p className="mt-1 max-w-56 truncate text-xs text-muted-foreground" title={item.reference}>{item.reference}</p>}</div></div></td><td className="px-4 py-3.5 text-xs text-muted-foreground"><NetworkMark network={item.network} /></td><td className="px-4 py-3.5"><ActivityStatus status={item.status} /></td><td className="whitespace-nowrap px-4 py-3.5 text-xs text-muted-foreground" title={item.dateTime}>{new Date(item.dateTime).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"})}</td><td className="whitespace-nowrap px-5 py-3.5 text-right text-xs font-medium tabular-nums">{formatExactEthAmount(item.amount)}<span className="ml-1 font-normal text-muted-foreground">ETH</span></td></tr>)}</tbody></table></div>
        {!visibleActivity.length ? <div className="px-5 py-12 text-center"><Wallet className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true" /><h3 className="text-sm font-medium">{activity.length ? "No matching activity" : "Your activity will appear here"}</h3><p className="mt-1 text-xs text-muted-foreground">{activity.length ? "Try another name, reference, or activity type." : "Create your first payment request to get started."}</p>{!activity.length ? <button type="button" className={cn(actionClass, "mt-4")} onClick={onViewPayments}>View payments <ArrowRight className="size-4" aria-hidden="true" /></button> : null}</div> : null}
        {tab === "Activity" ? <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{filteredActivity.length} {filteredActivity.length === 1 ? "record" : "records"}</p> : null}
      </section> : null}
    </div>
    <footer className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4"><p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />Your company wallet, secured by Privy.</p><a href="https://docs.privy.io/wallets/wallets/export" target="_blank" rel="noreferrer" className={cn(linkClass, "text-xs text-muted-foreground")}>About wallet access <ArrowUpRight className="size-3.5" aria-hidden="true" /></a></footer>
    <span className="sr-only" role="status">{copied ? "Wallet address copied" : ""}</span>
    {exportOpen ? <WalletExportDialog key={companyName + ":" + (wallet?.address ?? "unconnected")} companyName={companyName} wallet={wallet} onVerify={onExportWallet} onClose={() => setExportOpen(false)} /> : null}
  </div>;
}
