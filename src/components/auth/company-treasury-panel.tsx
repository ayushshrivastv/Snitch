"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Wallet } from "lucide-react";
import { WalletPage } from "@/components/wallets/wallet-page";
import type { WalletActivity } from "@/lib/wallet-activity";
import { ETHEREUM_CHAIN_ID, ETHEREUM_CURRENCY } from "../../../services/ethereum";
import { useWorkspaceSession } from "./workspace-session";
import { useCompanyWallets } from "./company-wallet-provider";
import { requestCompanyWallet } from "./company-wallet-request";

type BalanceSnapshot = {
  requestKey: string;
  state: "ready" | "error";
  balance: string | null;
  error?: string;
  updatedAt?: string;
};

export function CompanyTreasuryPanel({
  companyId,
  environment = "Testnet",
  activity,
  onViewPayments,
  onViewPayouts,
  onManageCompanies,
  onManageAccess,
}: {
  companyId: string;
  environment?: "Playground" | "Testnet";
  activity: WalletActivity[];
  onViewPayments: () => void;
  onViewPayouts: () => void;
  onManageCompanies: () => void;
  onManageAccess?: () => void;
}) {
  const session = useWorkspaceSession();
  const companyWallets = useCompanyWallets();
  const company = companyWallets?.companies.find(
    item => item.id === companyId && item.ownerUserId === session?.user.id,
  );
  const [snapshot, setSnapshot] = useState<BalanceSnapshot | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const getAccessToken = session?.getAccessToken;
  const address = company?.wallet.status === "ready" ? company.wallet.address : undefined;
  // A balance belongs to the exact account and refresh that requested it. Never
  // display a previous account's balance while the next request is loading.
  const requestKey = `${session?.user.id}:${companyId}:${address}:${attempt}`;
  const currentSnapshot = snapshot?.requestKey === requestKey ? snapshot : null;

  useEffect(() => {
    if (!address || !getAccessToken) return;
    const controller = new AbortController();
    let reading = false;

    async function readBalance() {
      if (reading || controller.signal.aborted) return;
      reading = true;
      try {
        const data = await requestCompanyWallet<{
          balance?: unknown;
          currency?: unknown;
          chainId?: unknown;
        }>(`/api/companies/${encodeURIComponent(companyId)}/balance`, {
          signal: controller.signal,
          getAccessToken: getAccessToken!,
        });
        controller.signal.throwIfAborted();
        if (
          typeof data.balance !== "string" ||
          !/^\d+(\.\d{1,18})?$/.test(data.balance) ||
          data.currency !== ETHEREUM_CURRENCY ||
          data.chainId !== ETHEREUM_CHAIN_ID
        ) throw new Error("Invalid balance response");

        setSnapshot({
          requestKey,
          state: "ready",
          balance: data.balance,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        if (!controller.signal.aborted) {
          setSnapshot({
            requestKey,
            state: "error",
            balance: null,
            error: "We couldn’t refresh the balance. Please try again.",
          });
        }
      } finally { reading = false; }
    }

    const refreshVisible = () => {
      if (document.visibilityState === "visible") void readBalance();
    };
    void readBalance();
    // Pick up funds received elsewhere and payments completed in another tab.
    // Hidden tabs stay idle; the same account snapshot remains visible during a refresh.
    const interval = window.setInterval(refreshVisible, 30000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [address, companyId, getAccessToken, requestKey]);

  async function retryCompanies() {
    if (!companyWallets || retrying) return;
    setRetrying(true);
    setRetryError("");
    try { await companyWallets.reload(); }
    catch { setRetryError("We couldn’t load your company wallet. Please try again."); }
    finally { setRetrying(false); }
  }

  if (!company || !companyWallets) {
    const loading = companyWallets?.loading || retrying;
    const message = retryError || companyWallets?.error;
    return (
      <div className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10">
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <section className="mt-7 flex min-h-72 flex-col items-center justify-center rounded-xl border border-border px-6 py-12 text-center" aria-busy={loading}>
          {loading ? <LoaderCircle className="size-6 motion-safe:animate-spin text-muted-foreground" aria-hidden="true" /> : <Wallet className="size-6 text-muted-foreground" aria-hidden="true" />}
          <h2 className="mt-4 text-base font-medium">{loading ? "Loading your company wallet" : "Select a company to view its wallet"}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground" role={message ? "alert" : "status"}>
            {message || (loading ? "Getting your treasury details ready." : "Manage your company accounts to open a treasury wallet.")}
          </p>
          {!loading ? <div className="mt-5 flex flex-wrap justify-center gap-3">
            {companyWallets ? <button type="button" onClick={() => void retryCompanies()} className="min-h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Try again</button> : null}
            <button type="button" onClick={onManageCompanies} className="min-h-10 rounded-lg bg-foreground px-4 text-sm font-medium text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Company accounts</button>
          </div> : null}
        </section>
      </div>
    );
  }

  return (
    <WalletPage
      key={company.id}
      companyName={company.name}
      environment={environment}
      wallet={address ? { address, cfoName: company.cfoUserId === session?.user.id ? session?.user.name : "Assigned CFO", createdAt: company.createdAt } : undefined}
      balance={currentSnapshot?.balance ?? null}
      balanceState={!address ? "unavailable" : currentSnapshot?.state ?? "loading"}
      balanceError={currentSnapshot?.error}
      updatedAt={currentSnapshot?.updatedAt}
      activity={activity}
      onRefresh={address && getAccessToken ? () => setAttempt(value => value + 1) : undefined}
      onExportWallet={address && company.cfoUserId === session?.user.id ? (onStage, signal) => companyWallets.exportCompanyWallet(company.id, onStage, signal) : undefined}
      onSetupWallet={!address ? () => companyWallets.resumeWallet(company.id) : undefined}
      onViewPayments={onViewPayments}
      onViewPayouts={onViewPayouts}
      onManageCompanies={onManageCompanies}
      onManageAccess={onManageAccess}
    />
  );
}
