import { formatEther } from "ethers";
import { parseEthAmount } from "../../services/ethereum";

export type WalletActivity = {
  id: string;
  kind: "payment" | "payout";
  counterparty: string;
  reference: string;
  amount: string;
  network: "Ethereum Sepolia" | "Base Sepolia";
  status: "Succeeded" | "Failed" | "Incomplete" | "Refunded" | "Disputed";
  dateTime: string;
  /** Unformatted timestamp for UTC charts; display dates may use the viewer's timezone. */
  occurredAt?: string;
  explorerUrl?: string;
};

type NetworkActivity = {
  network: WalletActivity["network"];
  received: bigint;
  paidOut: bigint;
  count: number;
};

function formatAmount(wei: bigint): string {
  return formatEther(wei).replace(/\.0$/, "");
}

/** Recorded incoming and outgoing activity; these totals are not a wallet balance. */
export function summarizeWalletActivity(items: readonly WalletActivity[]) {
  let received = BigInt(0);
  let paidOut = BigInt(0);
  let receivedCount = 0;
  let paidOutCount = 0;
  let pendingCount = 0;
  const networks = new Map<WalletActivity["network"], NetworkActivity>();

  for (const item of items) {
    if (item.status === "Incomplete") pendingCount += 1;
    if (item.status !== "Succeeded") continue;
    if (item.network !== "Ethereum Sepolia" && item.network !== "Base Sepolia") continue;
    if (item.kind !== "payment" && item.kind !== "payout") continue;

    let amount: bigint;
    try {
      amount = parseEthAmount(item.amount);
    } catch {
      continue;
    }

    const network = networks.get(item.network) ?? {
      network: item.network,
      received: BigInt(0),
      paidOut: BigInt(0),
      count: 0,
    };

    if (item.kind === "payment") {
      received += amount;
      receivedCount += 1;
      network.received += amount;
    } else {
      paidOut += amount;
      paidOutCount += 1;
      network.paidOut += amount;
    }
    network.count += 1;
    networks.set(item.network, network);
  }

  return {
    received: formatAmount(received),
    paidOut: formatAmount(paidOut),
    receivedCount,
    paidOutCount,
    pendingCount,
    net: formatAmount(received - paidOut),
    networks: [...networks.values()].map(network => ({
      network: network.network,
      received: formatAmount(network.received),
      paidOut: formatAmount(network.paidOut),
      count: network.count,
    })),
  };
}
