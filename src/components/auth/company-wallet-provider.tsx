"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useCreateWallet, useExportWallet, useSendTransaction, useSignMessage, useWallets } from "@privy-io/react-auth";
import type { CompanyAccount } from "@/lib/company-types";
import { approveCompanyWalletExport, type WalletExportStage } from "./company-wallet-export-request";
import { useWorkspaceSession } from "./workspace-session";
import { requestCompanyWallet } from "./company-wallet-request";
import { sendCompanyWalletPayment, type CompanyPaymentInput, type CompanyPaymentBroadcast, type CompanyPaymentConfirmation } from "./company-payment-request";
import type { CompanyPayoutRecord, RecordCompanyPayoutInput } from "@/lib/company-payout-types";

type CompanyWalletContextValue = {
  companies: CompanyAccount[];
  loading: boolean;
  error: string;
  reload: () => Promise<CompanyAccount[]>;
  createCompany: (name: string, requestId: string) => Promise<CompanyAccount>;
  connectPlaygroundWallet: () => Promise<CompanyAccount>;
  resumeWallet: (companyId: string) => Promise<CompanyAccount>;
  renameCompany: (companyId: string, name: string) => Promise<void>;
  deleteCompany: (companyId: string) => Promise<void>;
  exportCompanyWallet: (companyId: string, onStage?: (stage: WalletExportStage) => void, requestSignal?: AbortSignal) => Promise<void>;
  sendCompanyPayment: (companyId: string, payment: CompanyPaymentInput) => Promise<CompanyPaymentBroadcast>;
  confirmCompanyPayment: (companyId: string, payment: RecordCompanyPayoutInput) => Promise<CompanyPaymentConfirmation>;
  listCompanyPayouts: (companyId: string) => Promise<CompanyPayoutRecord[]>;
  recordCompanyPayout: (companyId: string, payment: RecordCompanyPayoutInput) => Promise<CompanyPayoutRecord>;
};
const CompanyWalletContext = createContext<CompanyWalletContextValue | null>(null);
export const useCompanyWallets = () => useContext(CompanyWalletContext);

export function CompanyWalletProvider({ children }: { children: ReactNode }) {
  const session = useWorkspaceSession();
  const { createWallet } = useCreateWallet();
  const { exportWallet } = useExportWallet();
  const { signMessage } = useSignMessage();
  const { sendTransaction } = useSendTransaction();
  const { wallets, ready: walletsReady } = useWallets();
  const [companies, setCompanies] = useState<CompanyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const sending = useRef(false);
  const exporting = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const getAccessToken = session?.getAccessToken;
  const userId = session?.user.id;

  const captureLifetime = useCallback(() => {
    const signal = lifetime.current?.signal;
    if (!signal) throw new Error("Sign in again to continue.");
    signal.throwIfAborted();
    return signal;
  }, []);

  const request = useCallback(async <T,>(path: string, signal: AbortSignal, init?: RequestInit): Promise<T> => {
    signal.throwIfAborted();
    if (!getAccessToken) throw new Error("Sign in again to continue.");
    return requestCompanyWallet<T>(path, { signal, getAccessToken }, init);
  }, [getAccessToken]);

  const reloadFor = useCallback(async (signal: AbortSignal) => {
    const data = await request<{ companies: CompanyAccount[] }>("/api/companies", signal);
    signal.throwIfAborted();
    setCompanies(data.companies);
    setError("");
    return data.companies;
  }, [request]);
  const reload = useCallback(() => reloadFor(captureLifetime()), [reloadFor, captureLifetime]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    busy.current = false;
    sending.current = false;
    exporting.current = false;
    void request<{ companies: CompanyAccount[] }>("/api/companies", controller.signal)
      .then(data => { if (!controller.signal.aborted) { setCompanies(data.companies); setError(""); } })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn’t load your company accounts. Please try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    // Each mount/effect owns a distinct signal. Strict Mode or a new session must
    // never revive requests and queued wallet work from the previous lifetime.
    return () => controller.abort();
  }, [request, userId]);

  const provision = async (companyId: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    const execute = async () => {
      signal.throwIfAborted();
      const current = (await reloadFor(signal)).find(company => company.id === companyId);
      signal.throwIfAborted();
      if (!current) throw new Error("Company account not found.");
      if (current.ownerUserId !== userId) throw new Error("Sign in again to continue.");
      if (current.wallet.status === "ready") return current;
      if (current.walletProvisioningError) throw new Error(current.walletProvisioningError);
      let address = current.walletCandidateAddress;
      if (!address) {
        // Explicit company creation is the only trigger. Privy retains key material;
        // no app-controlled signer or authorization key is attached.
        try {
          signal.throwIfAborted();
          const wallet = await createWallet({ createAdditional: true });
          signal.throwIfAborted();
          address = wallet.address;
        } catch {
          signal.throwIfAborted();
          throw new Error("Wallet setup wasn’t completed. Your company is saved. Use Finish wallet setup to continue.");
        }
      }
      signal.throwIfAborted();
      const { company } = await request<{ company: CompanyAccount }>(`/api/companies/${companyId}/wallet`, signal, {
        method: "POST", body: JSON.stringify({ address }),
      });
      signal.throwIfAborted();
      setCompanies(items => items.map(item => item.id === company.id ? company : item));
      return company;
    };
    // Serialize the same owner's company provisioning across browser tabs.
    return navigator.locks
      ? navigator.locks.request(`snitch-company-wallet:${userId}`, { signal }, execute)
      : execute();
  };

  const runExclusive = async <T,>(work: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const signal = captureLifetime();
    if (busy.current) throw new Error("Your company wallet is already being prepared.");
    busy.current = true;
    try { return await work(signal); }
    catch (failure) {
      // Refresh a completed reservation/wallet binding after an interrupted response.
      if (!signal.aborted) await reloadFor(signal).catch(() => undefined);
      throw failure;
    } finally {
      if (lifetime.current?.signal === signal && !signal.aborted) busy.current = false;
    }
  };

  const createCompany = (name: string, requestId: string) => runExclusive(async signal => {
    const { company } = await request<{ company: CompanyAccount }>("/api/companies", signal, {
      method: "POST", body: JSON.stringify({ name, requestId }),
    });
    signal.throwIfAborted();
    setCompanies(items => [...items.filter(item => item.id !== company.id), company]);
    return provision(company.id, signal);
  });

  const connectPlaygroundWallet = () => runExclusive(async signal => {
    const { company } = await request<{ company: CompanyAccount }>("/api/companies/playground", signal, {
      method: "POST", body: JSON.stringify({}),
    });
    signal.throwIfAborted();
    setCompanies(items => [...items.filter(item => item.id !== company.id), company]);
    return provision(company.id, signal);
  });

  const sendCompanyPayment = async (companyId: string, payment: CompanyPaymentInput) => {
    const signal = captureLifetime();
    if (sending.current) throw new Error("Finish the current wallet confirmation before sending another payment.");
    sending.current = true;
    try {
      const company = (await reloadFor(signal)).find(item => item.id === companyId);
      signal.throwIfAborted();
      if (!company || !userId) throw new Error("Company account not found. Sign in again to continue.");
      if (!walletsReady) throw new Error("Your Privy wallet is still loading. Please try again shortly.");
      if (!wallets.some(wallet => wallet.walletClientType === "privy" &&
        wallet.address.toLowerCase() === company.wallet.address?.toLowerCase())) {
        throw new Error("Sign in with the account that controls this company’s Privy wallet to send a payout.");
      }
      const send = () => sendCompanyWalletPayment({ company, userId, input: payment, signal, sendTransaction });
      return navigator.locks
        ? await navigator.locks.request(`snitch-company-send:${companyId}`, { ifAvailable: true }, async lock => {
          if (!lock) throw new Error("A payout is awaiting approval in another tab. Finish it before sending another.");
          return send();
        })
        : await send();
    } finally {
      if (lifetime.current?.signal === signal) sending.current = false;
    }
  };

  const listCompanyPayouts = useCallback(async (companyId: string) => {
    const result = await request<{ payouts: CompanyPayoutRecord[] }>(`/api/companies/${companyId}/payouts`, captureLifetime());
    return result.payouts;
  }, [request, captureLifetime]);

  const recordCompanyPayout = useCallback(async (companyId: string, payment: RecordCompanyPayoutInput) => {
    const result = await request<{ payout: CompanyPayoutRecord }>(`/api/companies/${companyId}/payouts`, captureLifetime(), {
      method: "POST", body: JSON.stringify(payment),
    });
    return result.payout;
  }, [request, captureLifetime]);

  return <CompanyWalletContext.Provider value={{
    companies, loading, error, reload, createCompany, connectPlaygroundWallet, sendCompanyPayment, listCompanyPayouts, recordCompanyPayout,
    confirmCompanyPayment: (companyId, payment) => request<CompanyPaymentConfirmation>(`/api/companies/${companyId}/payouts/confirm`, captureLifetime(), {
      method: "POST", body: JSON.stringify(payment),
    }),
    resumeWallet: companyId => runExclusive(signal => provision(companyId, signal)),
    renameCompany: async (companyId, name) => {
      const signal = captureLifetime();
      const { company } = await request<{ company: CompanyAccount }>(`/api/companies/${companyId}`, signal, {
        method: "PATCH", body: JSON.stringify({ name }),
      });
      signal.throwIfAborted();
      setCompanies(items => items.map(item => item.id === company.id ? company : item));
    },
    deleteCompany: async companyId => {
      const signal = captureLifetime();
      const { deletedCompanyId } = await request<{ deletedCompanyId: string }>(`/api/companies/${companyId}`, signal, {
        method: "DELETE",
      });
      signal.throwIfAborted();
      setCompanies(items => items.filter(item => item.id !== deletedCompanyId));
    },
    exportCompanyWallet: async (companyId, onStage, requestSignal) => {
      const lifetimeSignal = captureLifetime();
      if (exporting.current) throw new Error("Finish the current export approval first.");
      requestSignal?.throwIfAborted();
      const controller = new AbortController();
      const abort = () => controller.abort();
      lifetimeSignal.addEventListener("abort", abort, { once: true });
      requestSignal?.addEventListener("abort", abort, { once: true });
      const signal = controller.signal;
      exporting.current = true;
      try {
        const company = (await reloadFor(signal)).find(item => item.id === companyId);
        signal.throwIfAborted();
        if (!company || !userId) throw new Error("Company account not found. Sign in again to continue.");
        const path = `/api/companies/${encodeURIComponent(company.id)}/wallet/export-approval`;
        await approveCompanyWalletExport({
          company, userId, signal, signMessage, exportWallet, onStage,
          requestApproval: () => request(path, signal, { method: "POST", body: JSON.stringify({}) }),
          confirmApproval: input => request(path, signal, { method: "PUT", body: JSON.stringify(input) }),
        });
      } finally {
        lifetimeSignal.removeEventListener("abort", abort);
        requestSignal?.removeEventListener("abort", abort);
        if (lifetime.current?.signal === lifetimeSignal) exporting.current = false;
      }
    },
  }}>{children}</CompanyWalletContext.Provider>;
}
