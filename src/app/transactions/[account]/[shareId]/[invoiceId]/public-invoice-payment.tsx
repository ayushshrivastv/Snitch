"use client";

import { useEffect, useMemo, useState } from "react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { useStandardWalletAdapters } from "@solana/wallet-standard-wallet-adapter-react";
import { PublicKey, clusterApiUrl, type Connection } from "@solana/web3.js";
import { address } from "@solana/addresses";
import { getMint } from "@solana/spl-token";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  PlugZap,
  Wallet,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type PaymentState =
  | "idle"
  | "connecting"
  | "connected"
  | "processing"
  | "confirming"
  | "paid"
  | "error";

type PublicInvoicePaymentProps = {
  invoiceId: string;
  amount: string;
  stablecoin: string;
  completed: boolean;
  explorerHref: string;
};

type PaymentStatusResponse = {
  payment?: {
    signature?: string;
    status?: "Succeeded";
  } | null;
};

type UmbraReceiverAccount =
  | {
      state: string;
      data?: {
        isUserAccountX25519KeyRegistered?: boolean;
        isActiveForAnonymousUsage?: boolean;
      };
    }
  | null
  | undefined;

const UMBRA_NETWORK =
  process.env.NEXT_PUBLIC_UMBRA_NETWORK === "mainnet" ? "mainnet" : "devnet";
const SOLANA_CLUSTER =
  UMBRA_NETWORK === "mainnet" ? "mainnet-beta" : "devnet";
const SOLANA_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(SOLANA_CLUSTER);

const DEFAULT_SNITCH_TREASURY_WALLET =
  "J7XpHFtKQUB66NajCPdoQU4HFR8iTjS6wtq4foKA1CYn";
const TREASURY_WALLET =
  process.env.NEXT_PUBLIC_SNITCH_TREASURY_WALLET ||
  DEFAULT_SNITCH_TREASURY_WALLET;
const UMBRA_INDEXER_ENDPOINT =
  process.env.NEXT_PUBLIC_UMBRA_INDEXER_URL ||
  (UMBRA_NETWORK === "mainnet"
    ? "https://utxo-indexer.api.umbraprivacy.com"
    : "https://utxo-indexer.api-devnet.umbraprivacy.com");
const CREATE_UTXO_FROM_PUBLIC_BALANCE_INSTRUCTION_SEED =
  BigInt("118529596215018073273110474923613168478");
const UMBRA_FEE_SCHEDULE_SEED = new Uint8Array([
  219, 103, 184, 147, 198, 147, 112, 38, 55, 38, 235, 215, 80, 203, 76, 46,
  100, 134, 54, 137, 90, 55, 236, 128, 221, 55, 222, 172, 164, 85, 109, 139,
]);
const CREATE_UTXO_FROM_PUBLIC_BALANCE_SEED_BYTES = new Uint8Array([
  94, 35, 209, 185, 160, 81, 246, 69, 49, 174, 241, 12, 73, 248, 43, 89,
]);
const UMBRA_TOKEN_POOL_SEED = new Uint8Array([
  61, 21, 254, 10, 117, 50, 210, 47, 122, 79, 232, 171, 118, 26, 22, 118,
  205, 174, 242, 211, 17, 197, 198, 61, 164, 43, 231, 196, 167, 221, 63,
  210,
]);

const STABLECOIN_MINTS: Record<string, string | undefined> = {
  USDC: process.env.NEXT_PUBLIC_USDC_MINT,
  Tether: process.env.NEXT_PUBLIC_USDT_MINT,
  USDT: process.env.NEXT_PUBLIC_USDT_MINT,
  USDG: process.env.NEXT_PUBLIC_USDG_MINT,
  "Palm USD": process.env.NEXT_PUBLIC_PALM_USD_MINT,
  Palm: process.env.NEXT_PUBLIC_PALM_USD_MINT,
};

const PREFERRED_WALLET_ORDER = [
  "backpack",
  "jupiter",
  "metamask",
  "solflare",
  "phantom",
] as const;

type SupportedWalletKey = (typeof PREFERRED_WALLET_ORDER)[number];

type WalletOption = {
  key: SupportedWalletKey;
  label: string;
  adapterName?: WalletName;
  readyState: WalletReadyState;
  installUrl: string;
};

type PendingWalletSelection = {
  key: SupportedWalletKey;
  adapterName: WalletName;
  label: string;
};

const WALLET_LABELS: Record<SupportedWalletKey, string> = {
  backpack: "Backpack",
  jupiter: "Jupiter",
  metamask: "MetaMask",
  solflare: "Solflare",
  phantom: "Phantom",
};

const WALLET_INSTALL_URLS: Record<SupportedWalletKey, string> = {
  backpack: "https://www.backpack.app/",
  jupiter: "https://jup.ag/mobile",
  metamask: "https://metamask.io/",
  solflare: "https://solflare.com/",
  phantom: "https://phantom.com/",
};

function walletKeyFromName(name: string): SupportedWalletKey | null {
  const normalized = name.toLowerCase();

  if (normalized.includes("backpack")) {
    return "backpack";
  }

  if (normalized.includes("jupiter")) {
    return "jupiter";
  }

  if (normalized.includes("metamask")) {
    return "metamask";
  }

  if (normalized.includes("solflare")) {
    return "solflare";
  }

  if (normalized.includes("phantom")) {
    return "phantom";
  }

  return null;
}

function walletDisplayName(name: string) {
  const walletKey = walletKeyFromName(name);

  if (walletKey) {
    return WALLET_LABELS[walletKey];
  }

  return name;
}

function walletEntryScore(
  entry: {
    adapter: unknown;
    readyState: WalletReadyState;
  },
  key: SupportedWalletKey,
) {
  const adapter = entry.adapter as { name: string };
  const normalized = adapter.name.toLowerCase();
  let score = 0;

  if (normalized === key || normalized === WALLET_LABELS[key].toLowerCase()) {
    score += 100;
  }

  if (normalized.includes(key)) {
    score += 20;
  }

  if (key === "phantom" && entry.adapter instanceof PhantomWalletAdapter) {
    score += 30;
  }

  if (key === "solflare" && entry.adapter instanceof SolflareWalletAdapter) {
    score += 30;
  }

  if (entry.readyState === WalletReadyState.Installed) {
    score += 10;
  }

  if (entry.readyState === WalletReadyState.Loadable) {
    score += 5;
  }

  return score;
}

function shortAddress(address: string) {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function collectTransactionErrorMessage(error: unknown, fallback: string) {
  const messages = new Set<string>();

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return;
    }

    if (value instanceof Error && value.message) {
      messages.add(value.message);
    }

    const record = value as Record<string, unknown>;
    const stage = record.stage;

    if (typeof stage === "string") {
      messages.add(`Umbra flow failed during ${stage}.`);
    }

    const context = record.context;

    if (context && typeof context === "object") {
      const contextRecord = context as Record<string, unknown>;
      const logs = contextRecord.logs;

      if (Array.isArray(logs) && logs.length > 0) {
        messages.add(logs.map(String).slice(-6).join("\n"));
      }
    }

    const cause = record.cause;

    if (cause && cause !== value) {
      visit(cause);
    }
  };

  visit(error);

  return Array.from(messages).filter(Boolean).join("\n\n") || fallback;
}

function localPaymentKey(invoiceId: string) {
  return `snitch:invoice:${invoiceId}:status`;
}

function normalizeAmount(amount: string) {
  return amount.replace(/,/g, "").trim();
}

function decimalToBaseUnits(value: string, decimals: number) {
  const normalized = normalizeAmount(value);

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Invoice amount is not valid.");
  }

  const [whole, fraction = ""] = normalized.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);

  return BigInt(`${whole}${paddedFraction}`.replace(/^0+(?=\d)/, "") || "0");
}

function explorerUrl(signature: string) {
  const cluster = UMBRA_NETWORK === "devnet" ? "?cluster=devnet" : "";

  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

function explorerHrefWithSignature({
  href,
  invoiceId,
  signature,
}: {
  href: string;
  invoiceId: string;
  signature: string;
}) {
  const [pathname, rawQuery = ""] = href.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set("signature", signature || `umbra-demo-${invoiceId}`);

  return `${pathname}?${params.toString()}`;
}

function websocketEndpoint(rpcUrl: string) {
  if (process.env.NEXT_PUBLIC_SOLANA_WS_URL) {
    return process.env.NEXT_PUBLIC_SOLANA_WS_URL;
  }

  if (rpcUrl.startsWith("https://")) {
    return rpcUrl.replace("https://", "wss://");
  }

  if (rpcUrl.startsWith("http://")) {
    return rpcUrl.replace("http://", "ws://");
  }

  return rpcUrl;
}

function getUmbraSignature(result: {
  createUtxoSignature?: string;
  createProofAccountSignature?: string;
}) {
  return result.createUtxoSignature || result.createProofAccountSignature || "";
}

function getUmbraNetworkName() {
  return UMBRA_NETWORK;
}

function getUnsupportedUmbraMintMessage(stablecoin: string, mint: string) {
  return `Umbra ${getUmbraNetworkName()} does not have an active ${stablecoin} pool for mint ${shortAddress(
    mint,
  )}. Update this invoice token mint to one with initialized Umbra fee schedule and token pool accounts before accepting private payments.`;
}

function getUmbraFeeScheduleAddress(programId: string, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      UMBRA_FEE_SCHEDULE_SEED,
      CREATE_UTXO_FROM_PUBLIC_BALANCE_SEED_BYTES,
      mint.toBytes(),
    ],
    new PublicKey(programId),
  )[0];
}

function getUmbraTokenPoolAddress(programId: string, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [UMBRA_TOKEN_POOL_SEED, mint.toBytes()],
    new PublicKey(programId),
  )[0];
}

async function assertUmbraPaymentMintReady({
  client,
  connection,
  mint,
  stablecoin,
}: {
  client: { networkConfig: { programId: string } };
  connection: Connection;
  mint: PublicKey;
  stablecoin: string;
}) {
  const { findProtocolFeeVaultPda } = await import("@umbra-privacy/sdk/pda");
  const programId = client.networkConfig.programId;
  const feeSchedule = getUmbraFeeScheduleAddress(programId, mint);
  const tokenPool = getUmbraTokenPoolAddress(programId, mint);
  type FindProtocolFeeVaultArgs = Parameters<typeof findProtocolFeeVaultPda>;
  const [feeVaultAddress] = await findProtocolFeeVaultPda(
    CREATE_UTXO_FROM_PUBLIC_BALANCE_INSTRUCTION_SEED as FindProtocolFeeVaultArgs[0],
    address(mint.toBase58()),
    BigInt(0) as FindProtocolFeeVaultArgs[2],
    address(programId),
  );
  const feeVault = new PublicKey(feeVaultAddress);
  const accounts = await connection.getMultipleAccountsInfo(
    [feeSchedule, feeVault, tokenPool],
    "confirmed",
  );

  if (accounts.some((account) => !account)) {
    throw new Error(getUnsupportedUmbraMintMessage(stablecoin, mint.toBase58()));
  }
}

function isUmbraReceiverReady(account: UmbraReceiverAccount) {
  return (
    account?.state === "exists" &&
    Boolean(account.data?.isUserAccountX25519KeyRegistered) &&
    Boolean(account.data?.isActiveForAnonymousUsage)
  );
}

function getTreasuryRegistrationMessage(treasuryWallet: string) {
  return `The company payment recipient ${shortAddress(
    treasuryWallet,
  )} is not registered with Umbra yet. Register this recipient once outside the customer checkout before accepting confidential invoice payments.`;
}

function isMissingUmbraMintSetupError(message: string) {
  return (
    message.includes("fee_schedule") ||
    message.includes("AccountNotInitialized") ||
    message.includes("custom program error: 0xbc4") ||
    message.includes("expected this account to be already initialized")
  );
}

function isRpcConfirmationTransportError(message: string) {
  return message.includes(
    "Cannot destructure property 'err' of 'data' as it is undefined",
  );
}

async function getUmbraWalletSigner(walletName: string, address: string) {
  const [{ getWallets }, { createSignerFromWalletAccount }] = await Promise.all([
    import("@wallet-standard/app"),
    import("@umbra-privacy/sdk"),
  ]);
  const selectedWalletKey = walletKeyFromName(walletName);
  const standardWallet = getWallets()
    .get()
    .find((registeredWallet) => {
      const hasSelectedAccount = registeredWallet.accounts.some(
        (walletAccount) => walletAccount.address === address,
      );

      if (!hasSelectedAccount) {
        return false;
      }

      if (registeredWallet.name === walletName) {
        return true;
      }

      return selectedWalletKey
        ? walletKeyFromName(registeredWallet.name) === selectedWalletKey
        : false;
    });
  const account = standardWallet?.accounts.find(
    (walletAccount) => walletAccount.address === address,
  );

  if (!standardWallet || !account) {
    throw new Error(
      `Umbra requires ${walletDisplayName(
        walletName,
      )} to expose a Wallet Standard Solana account. Reconnect that wallet and try again.`,
    );
  }

  return createSignerFromWalletAccount(standardWallet, account);
}

async function getConfiguredUmbraClient(
  umbra: typeof import("@umbra-privacy/sdk"),
  signer: Awaited<ReturnType<typeof getUmbraWalletSigner>>,
) {
  return umbra.getUmbraClient(
    {
      signer,
      network: UMBRA_NETWORK,
      rpcUrl: SOLANA_ENDPOINT,
      rpcSubscriptionsUrl: websocketEndpoint(SOLANA_ENDPOINT),
      indexerApiEndpoint: UMBRA_INDEXER_ENDPOINT,
    },
    {
      transactionForwarder: umbra.getPollingTransactionForwarder({
        rpcUrl: SOLANA_ENDPOINT,
      }),
      computationMonitor: umbra.getPollingComputationMonitor({
        rpcUrl: SOLANA_ENDPOINT,
      }),
    },
  );
}

function useInvoiceWallets() {
  const fallbackAdapters = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return useStandardWalletAdapters(fallbackAdapters);
}

export function PublicInvoicePayment(props: PublicInvoicePaymentProps) {
  const wallets = useInvoiceWallets();

  return (
    <ConnectionProvider endpoint={SOLANA_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <PublicInvoicePaymentPanel {...props} />
      </WalletProvider>
    </ConnectionProvider>
  );
}

function PublicInvoicePaymentPanel({
  invoiceId,
  amount,
  stablecoin,
  completed,
  explorerHref,
}: PublicInvoicePaymentProps) {
  const { connection } = useConnection();
  const {
    wallets,
    wallet,
    publicKey,
    connecting,
    connected,
    connect,
    disconnect,
    select,
  } = useWallet();
  const [paymentState, setPaymentState] = useState<PaymentState>(
    completed ? "paid" : "idle",
  );
  const [pendingWallet, setPendingWallet] =
    useState<PendingWalletSelection | null>(null);
  const [txSignature, setTxSignature] = useState("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const shouldShowCompletedModal = completed && invoiceId === "INV-349924";
  const [isCompletedModalOpen, setIsCompletedModalOpen] = useState(
    shouldShowCompletedModal,
  );

  const mintAddress = STABLECOIN_MINTS[stablecoin];
  const isPaymentConfigured = Boolean(TREASURY_WALLET && mintAddress);
  const visibleWallets = useMemo<WalletOption[]>(
    () =>
      PREFERRED_WALLET_ORDER.map((walletKey) => {
        const candidates = wallets.filter(
          (walletEntry) =>
            walletKeyFromName(walletEntry.adapter.name) === walletKey,
        );
        const selectedWallet = [...candidates].sort(
          (firstWallet, secondWallet) =>
            walletEntryScore(secondWallet, walletKey) -
              walletEntryScore(firstWallet, walletKey) ||
            firstWallet.adapter.name.localeCompare(secondWallet.adapter.name),
        )[0];

        return {
          key: walletKey,
          label: WALLET_LABELS[walletKey],
          adapterName: selectedWallet?.adapter.name,
          readyState:
            selectedWallet?.readyState || WalletReadyState.NotDetected,
          installUrl:
            selectedWallet?.adapter.url || WALLET_INSTALL_URLS[walletKey],
        };
      }),
    [wallets],
  );

  useEffect(() => {
    if (completed) {
      return;
    }

    if (window.localStorage.getItem(localPaymentKey(invoiceId)) === "paid") {
      queueMicrotask(() => setPaymentState("paid"));
    }
  }, [completed, invoiceId]);

  useEffect(() => {
    let cancelled = false;

    async function syncPaymentStatus() {
      const response = await fetch(
        `/api/payments/status?invoiceId=${encodeURIComponent(invoiceId)}`,
        { cache: "no-store" },
      ).catch(() => null);

      if (!response?.ok) {
        return;
      }

      const result = (await response
        .json()
        .catch(() => null)) as PaymentStatusResponse | null;

      if (cancelled || result?.payment?.status !== "Succeeded") {
        return;
      }

      if (result.payment.signature) {
        setTxSignature(result.payment.signature);
      }

      window.localStorage.setItem(localPaymentKey(invoiceId), "paid");
      setPaymentState("paid");
    }

    void syncPaymentStatus();

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  useEffect(() => {
    if (
      !pendingWallet ||
      !wallet ||
      (wallet.adapter.name !== pendingWallet.adapterName &&
        walletKeyFromName(wallet.adapter.name) !== pendingWallet.key)
    ) {
      return;
    }

    let cancelled = false;

    void connect()
      .then(() => {
        if (!cancelled) {
          setPaymentState("connected");
          setErrorMessage("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPaymentState("idle");
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Wallet connection was not completed.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPendingWallet(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connect, pendingWallet, wallet]);

  useEffect(() => {
    if (!pendingWallet) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPaymentState("idle");
      setErrorMessage(
        `Could not select ${pendingWallet.label}. Open the ${pendingWallet.label} extension directly or disable another wallet extension that may be claiming the same Solana provider.`,
      );
      setPendingWallet(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [pendingWallet]);

  useEffect(() => {
    if (connected) {
      queueMicrotask(() => {
        setPaymentState((state) => (state === "idle" ? "connected" : state));
      });
    }
  }, [connected]);

  useEffect(() => {
    if (!isPaymentOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPaymentOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isPaymentOpen]);

  const copyWalletAddress = async () => {
    if (!publicKey) {
      return;
    }

    await navigator.clipboard.writeText(publicKey.toBase58());
    setCopiedAddress(true);
    window.setTimeout(() => setCopiedAddress(false), 1200);
  };

  const resetWalletConnection = async () => {
    setErrorMessage("");
    setNoticeMessage("");
    setPendingWallet(null);
    setPaymentState("idle");

    if (connected) {
      await disconnect().catch(() => undefined);
    }
  };

  const connectWallet = async (walletOption: WalletOption) => {
    if (!walletOption.adapterName) {
      setErrorMessage(`Install ${walletOption.label} to connect it.`);
      return;
    }

    const connectedWalletKey = wallet
      ? walletKeyFromName(wallet.adapter.name)
      : null;

    if (
      connected &&
      wallet?.adapter.name === walletOption.adapterName &&
      connectedWalletKey === walletOption.key
    ) {
      setPaymentState("connected");
      setErrorMessage("");
      setNoticeMessage("");
      return;
    }

    setPaymentState("connecting");
    setErrorMessage("");
    setNoticeMessage("");
    setPendingWallet({
      key: walletOption.key,
      adapterName: walletOption.adapterName,
      label: walletOption.label,
    });

    if (connected && wallet?.adapter.name !== walletOption.adapterName) {
      await disconnect().catch(() => undefined);
    }

    select(walletOption.adapterName);
  };

  const payInvoice = async () => {
    if (!publicKey || !TREASURY_WALLET || !mintAddress) {
      setErrorMessage(
        "Payment rail is missing recipient or token mint config.",
      );
      return;
    }

    setPaymentState("processing");
    setErrorMessage("");
    setNoticeMessage("");

    try {
      const mint = new PublicKey(mintAddress);
      const mintAccount = await getMint(connection, mint);
      const baseUnits = decimalToBaseUnits(amount, mintAccount.decimals);

      if (baseUnits <= BigInt(0)) {
        throw new Error("Invoice amount must be greater than zero.");
      }

      const [
        umbra,
        {
          getCreateReceiverClaimableUtxoFromPublicBalanceProver,
          getUserRegistrationProver,
        },
      ] = await Promise.all([
        import("@umbra-privacy/sdk"),
        import("@umbra-privacy/web-zk-prover"),
      ]);
      const signer = await getUmbraWalletSigner(
        wallet?.adapter.name || "",
        publicKey.toBase58(),
      );
      const client = await getConfiguredUmbraClient(umbra, signer);

      await assertUmbraPaymentMintReady({
        client,
        connection,
        mint,
        stablecoin,
      });

      const queryUserAccount = umbra.getUserAccountQuerierFunction({ client });
      const treasuryAccount = await queryUserAccount(address(TREASURY_WALLET));

      if (treasuryAccount?.state !== "exists") {
        throw new Error(getTreasuryRegistrationMessage(TREASURY_WALLET));
      }

      if (!isUmbraReceiverReady(treasuryAccount)) {
        throw new Error(
          `The company payment recipient ${shortAddress(
            TREASURY_WALLET,
          )} is only partially registered with Umbra. Finish recipient setup outside the customer checkout before accepting confidential invoice payments.`,
        );
      }

      const registerUser = umbra.getUserRegistrationFunction(
        { client },
        { zkProver: getUserRegistrationProver() },
      );

      await registerUser({ confidential: true, anonymous: true });

      const createPrivatePayment =
        umbra.getPublicBalanceToReceiverClaimableUtxoCreatorFunction(
          { client },
          { zkProver: getCreateReceiverClaimableUtxoFromPublicBalanceProver() },
        );
      type CreatePrivatePaymentArgs = Parameters<
        typeof createPrivatePayment
      >[0];
      const result = await createPrivatePayment({
        amount: baseUnits as CreatePrivatePaymentArgs["amount"],
        destinationAddress:
          TREASURY_WALLET as CreatePrivatePaymentArgs["destinationAddress"],
        mint: mint.toBase58() as CreatePrivatePaymentArgs["mint"],
      });
      const signature = getUmbraSignature(result);

      if (!signature) {
        throw new Error("Umbra completed without returning a transaction hash.");
      }

      setTxSignature(signature);
      setPaymentState("confirming");

      const response = await fetch("/api/payments/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId,
          amount,
          stablecoin,
          signature,
          payer: publicKey.toBase58(),
          treasury: TREASURY_WALLET,
          mint: mint.toBase58(),
          privacyRail: "umbra",
          proofSignature: result.createProofAccountSignature,
          closeProofAccountSignature: result.closeProofAccountSignature,
        }),
      });

      const confirmation = (await response.json().catch(() => null)) as
        | ({ error?: string } & PaymentStatusResponse)
        | null;

      if (!response.ok) {
        throw new Error(confirmation?.error || "Payment confirmation failed.");
      }

      if (confirmation?.payment?.signature) {
        setTxSignature(confirmation.payment.signature);
      }

      window.localStorage.setItem(localPaymentKey(invoiceId), "paid");
      setPaymentState("paid");
    } catch (error) {
      setPaymentState(connected ? "connected" : "idle");
      setNoticeMessage("");
      const message = collectTransactionErrorMessage(
        error,
        "Payment could not be completed.",
      );

      setErrorMessage(
        message.includes("Receiver is not registered") && TREASURY_WALLET
          ? getTreasuryRegistrationMessage(TREASURY_WALLET)
          : mintAddress && isMissingUmbraMintSetupError(message)
            ? getUnsupportedUmbraMintMessage(stablecoin, mintAddress)
          : isRpcConfirmationTransportError(message)
            ? "The payment transaction hit an RPC confirmation issue. Refresh status or retry after a moment; the app now uses polling confirmation for the next attempt."
          : message,
      );
    }
  };

  const paidExplorerHref = explorerHrefWithSignature({
    href: explorerHref,
    invoiceId,
    signature: txSignature,
  });

  return (
    <div className="grid gap-2">
      {paymentState === "paid" ? (
        <button
          type="button"
          onClick={() => setIsCompletedModalOpen(true)}
          className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 text-base font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-haspopup="dialog"
        >
          <Check className="size-4" aria-hidden="true" />
          Payment completed
        </button>
      ) : (
        <Button
          type="button"
          onClick={() => setIsPaymentOpen(true)}
          className="h-11 w-full rounded-full text-base font-medium"
        >
          <PlugZap className="size-4" aria-hidden="true" />
          Pay now
        </Button>
      )}

      {paymentState === "paid" ? (
        <a
          href={paidExplorerHref}
          className="mx-auto inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Open confidential transaction explorer"
        >
          Explorer
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      ) : txSignature ? (
        <a
          href={explorerUrl(txSignature)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex justify-center gap-1.5 text-center text-xs text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          View transaction
          <ExternalLink className="size-3" aria-hidden="true" />
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
              Thank you for completing invoice {invoiceId}. Snitchpay.co has
              recorded this payment as complete.
            </p>

            <a
              href={paidExplorerHref}
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-[4px] bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Explorer
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      ) : null}

      {isPaymentOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsPaymentOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-invoice-title"
            className="max-h-[calc(100vh-48px)] w-full max-w-[560px] overflow-hidden rounded-[18px] bg-background shadow-2xl"
          >
            <div className="flex items-start gap-4 border-b border-border px-6 py-5">
              <div className="grid size-12 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground">
                <Wallet className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="pay-invoice-title"
                  className="text-[22px] font-medium leading-tight text-foreground"
                >
                  Pay invoice
                </h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  Connect a Solana wallet to pay privately through Umbra{" "}
                  {getUmbraNetworkName()}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentOpen(false)}
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Close payment modal"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid max-h-[calc(100vh-230px)] gap-4 overflow-y-auto px-6 py-5">
              {paymentState === "paid" ? (
                <div className="grid gap-4 text-center">
                  <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                    <Check className="size-5" aria-hidden="true" />
                  </div>
                  <div className="grid gap-1">
                    <p className="text-lg font-medium text-foreground">
                      Payment successful
                    </p>
                    <p className="text-sm text-muted-foreground">
                      This invoice is now marked as completed.
                    </p>
                  </div>
                  {txSignature ? (
                    <a
                      href={explorerUrl(txSignature)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      View on explorer
                      <ExternalLink className="size-4" aria-hidden="true" />
                    </a>
                  ) : null}
                  <Button
                    type="button"
                    onClick={() => setIsPaymentOpen(false)}
                    className="h-11 rounded-full"
                  >
                    Done
                  </Button>
                </div>
              ) : connected && publicKey && !pendingWallet ? (
                <div className="grid gap-4">
                  <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border px-4 text-sm">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <span
                        className="size-2 rounded-full bg-emerald-500"
                        aria-hidden="true"
                      />
                      Connected {wallet ? walletDisplayName(wallet.adapter.name) : "wallet"}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void copyWalletAddress()}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 font-mono text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {shortAddress(publicKey.toBase58())}
                        <Copy className="size-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void resetWalletConnection()}
                        className="min-h-9 rounded-full px-2 text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        Change wallet
                      </button>
                    </div>
                  </div>

                  {copiedAddress ? (
                    <p className="text-center text-xs text-muted-foreground">
                      Wallet address copied.
                    </p>
                  ) : null}

                  {!isPaymentConfigured ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm leading-5 text-muted-foreground">
                      Configure the payment recipient and {stablecoin} mint
                      address to enable real Umbra payments.
                    </div>
                  ) : null}

                  {isPaymentConfigured ? (
                    <div className="rounded-xl border border-border px-4 py-3 text-sm leading-5 text-muted-foreground">
                      Umbra will create a receiver-claimable private UTXO for
                      the Snitchpay.co recipient (
                      {shortAddress(TREASURY_WALLET || "")}) on Solana{" "}
                      {getUmbraNetworkName()}. Your wallet may ask for a
                      message signature and multiple transaction approvals.
                    </div>
                  ) : null}

                  <Button
                    type="button"
                    onClick={() => void payInvoice()}
                    disabled={
                      !isPaymentConfigured ||
                      paymentState === "processing" ||
                      paymentState === "confirming"
                    }
                    className="h-11 w-full rounded-full text-base font-medium"
                  >
                    {paymentState === "processing" ||
                    paymentState === "confirming" ? (
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <PlugZap className="size-4" aria-hidden="true" />
                    )}
                    {paymentState === "confirming"
                      ? "Confirming payment..."
                      : paymentState === "processing"
                        ? "Preparing Umbra payment..."
                        : "Pay privately with Umbra"}
                  </Button>

                  {txSignature ? (
                    <a
                      href={explorerUrl(txSignature)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex justify-center gap-1.5 text-center text-xs text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      View pending transaction
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    {visibleWallets.map((walletOption) => {
                      const canConnect =
                        walletOption.readyState === WalletReadyState.Installed ||
                        walletOption.readyState === WalletReadyState.Loadable;
                      const isConnectingWallet =
                        pendingWallet?.key === walletOption.key ||
                        (connecting &&
                          walletKeyFromName(wallet?.adapter.name || "") ===
                            walletOption.key);

                      return canConnect ? (
                        <Button
                          key={walletOption.key}
                          type="button"
                          onClick={() => void connectWallet(walletOption)}
                          disabled={
                            connecting || paymentState === "connecting"
                          }
                          className="h-11 w-full rounded-full text-base font-medium"
                        >
                          {isConnectingWallet ? (
                            <Loader2
                              className="size-4 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Wallet className="size-4" aria-hidden="true" />
                          )}
                          {isConnectingWallet
                            ? "Connecting..."
                            : `Connect ${walletOption.label}`}
                        </Button>
                      ) : (
                        <a
                          key={walletOption.key}
                          href={walletOption.installUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-input bg-background px-4 text-base font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <Wallet className="size-4" aria-hidden="true" />
                          Install {walletOption.label}
                        </a>
                      );
                    })}
                  </div>

                  <p className="text-center text-sm text-muted-foreground">
                    You will review and sign the private Solana payment in your
                    wallet.
                  </p>
                </div>
              )}

              {errorMessage ? (
                <p
                  role="alert"
                  className="max-h-36 overflow-y-auto whitespace-pre-wrap text-center text-sm text-destructive"
                >
                  {errorMessage}
                </p>
              ) : null}
              {noticeMessage ? (
                <p className="text-center text-sm text-emerald-700">
                  {noticeMessage}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {paymentState !== "paid" && errorMessage ? (
        <p
          role="alert"
          className="whitespace-pre-wrap text-center text-sm text-destructive"
        >
          {errorMessage}
        </p>
      ) : null}
      {paymentState !== "paid" && noticeMessage ? (
        <p className="text-center text-sm text-emerald-700">{noticeMessage}</p>
      ) : null}
    </div>
  );
}
