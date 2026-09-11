"use client";

import { useEffect, useState } from "react";
import { useCompanyWallets } from "@/components/auth/company-wallet-provider";
import { useWorkspaceSession } from "@/components/auth/workspace-session";
import { SHOWCASE_COMPANY } from "@/lib/showcase-company";
import { showcaseUsdTreasury } from "@/data/showcase-treasury";
import type { WalletActivity } from "@/lib/wallet-activity";
import { ETHEREUM_CHAIN_ID, ETHEREUM_CURRENCY } from "../../../services/ethereum";
import { WalletPage } from "./wallet-page";

type BalanceSnapshot = {
  attempt: number;
  state: "ready" | "error";
  balance: string | null;
  updatedAt?: string;
};

export function ShowcaseTreasuryPanel({
  activity,
  onViewPayments,
  onViewPayouts,
  onManageCompanies,
  onManageAccess,
}: {
  activity: WalletActivity[];
  onViewPayments: () => void;
  onViewPayouts: () => void;
  onManageCompanies: () => void;
  onManageAccess?: () => void;
}) {
  const session = useWorkspaceSession();
  const companyWallets = useCompanyWallets();
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<BalanceSnapshot | null>(null);
  const currentSnapshot = snapshot?.attempt === attempt ? snapshot : null;
  const isCfo = session?.user.id === SHOWCASE_COMPANY.cfoUserId;

  useEffect(() => {
    const controller = new AbortController();
    let reading = false;

    async function readBalance() {
      if (reading || controller.signal.aborted) return;
      reading = true;
      try {
        const response = await fetch("/api/showcase/balance", {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        if (!response.ok) throw new Error("Balance unavailable");
        const data = await response.json();
        controller.signal.throwIfAborted();
        if (
          data?.address?.toLowerCase() !== SHOWCASE_COMPANY.walletAddress.toLowerCase() ||
          typeof data.balance !== "string" || !/^\d+(\.\d{1,18})?$/.test(data.balance) ||
          data.currency !== ETHEREUM_CURRENCY || data.chainId !== ETHEREUM_CHAIN_ID
        ) throw new Error("Invalid balance response");
        setSnapshot({ attempt, state: "ready", balance: data.balance, updatedAt: new Date().toISOString() });
      } catch {
        if (!controller.signal.aborted) setSnapshot({ attempt, state: "error", balance: null });
      } finally { reading = false; }
    }

    const refreshVisible = () => {
      if (document.visibilityState === "visible") void readBalance();
    };
    void readBalance();
    const interval = window.setInterval(refreshVisible, 30000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [attempt]);

  return <WalletPage
    companyName={SHOWCASE_COMPANY.name}
    environment="Playground"
    usdOverview={showcaseUsdTreasury}
    wallet={{ address: SHOWCASE_COMPANY.walletAddress, cfoName: SHOWCASE_COMPANY.cfoName, createdAt: SHOWCASE_COMPANY.createdAt }}
    balance={currentSnapshot?.balance ?? null}
    balanceState={currentSnapshot?.state ?? "loading"}
    balanceError="We couldn’t refresh the balance. Please try again."
    updatedAt={currentSnapshot?.updatedAt}
    activity={activity}
    onRefresh={() => setAttempt(value => value + 1)}
    // The provider reloads company authority on the server and requires the CFO's
    // wallet signature before Privy opens its protected key export window.
    onExportWallet={isCfo && companyWallets
      ? (onStage, signal) => companyWallets.exportCompanyWallet(SHOWCASE_COMPANY.id, onStage, signal)
      : undefined}
    onViewPayments={onViewPayments}
    onViewPayouts={onViewPayouts}
    onManageCompanies={onManageCompanies}
    onManageAccess={onManageAccess}
  />;
}
