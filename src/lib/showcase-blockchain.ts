import { formatRecordDateTime } from "./record-date";
import ethereumRecords from "@/data/showcase-ethereum.json";
import baseRecords from "@/data/showcase-base.json";

export type ShowcaseTransfer = {
  network: "Ethereum Sepolia" | "Base Sepolia";
  chainId: 11155111 | 84532;
  hash: string;
  from: string;
  to: string;
  valueWei: string;
  amountEth: string;
  blockNumber: number;
  blockHash: string;
  blockTimestamp: string;
  status: "success";
  verifiedAt: string;
  explorerUrl: string;
  sourceRpc: string;
};

// These are public historical transfers, assigned to illustrative company records.
// They are not payments made by the named customers or by Snitch.
const ethereumIds = [
  "TX_137BEFAA", "TX_7B51DA90", "TX_D40B33A5", "TX_5E1F902B",
  "TX_A61D2E95", "TX_7A5C90BD", "PO_8B29A1F72C90", "PO_5E72A9C0D334",
];
const baseIds = [
  "TX_1038F9A2", "TX_BASE_DEMO_01", "TX_F17A0B2D", "TX_84D20C7A",
  "TX_B5E701AF", "TX_E2A93C54", "PO_C14E7D8A92F3", "PO_68AB1C32D4F0",
  "PO_6F3AD5B98210", "PO_E51C892DF604",
];

function bindRecords(ids: string[], records: ShowcaseTransfer[]) {
  if (ids.length !== records.length || records.some(record => record.status !== "success")) {
    throw new Error("The showcase requires a verified transfer for every successful record.");
  }
  return Object.fromEntries(ids.map((id, index) => [id, records[index]]));
}

export const showcaseTransfers: Readonly<Record<string, ShowcaseTransfer>> = {
  ...bindRecords(ethereumIds, ethereumRecords as ShowcaseTransfer[]),
  ...bindRecords(baseIds, baseRecords as ShowcaseTransfer[]),
};

export function getShowcaseTransfer(id: string, network: ShowcaseTransfer["network"]) {
  const transfer = showcaseTransfers[id];
  if (!transfer || transfer.network !== network) {
    throw new Error("A verified transfer on the correct network is required.");
  }
  return transfer;
}

export function formatBlockchainDate(timestamp: string) {
  return formatRecordDateTime(new Date(timestamp), { timeZone: "UTC", showTimeZone: true });
}

export function blockchainAddressUrl(transfer: ShowcaseTransfer, address: string) {
  const host = transfer.chainId === 84532 ? "https://sepolia.basescan.org" : "https://sepolia.etherscan.io";
  return `${host}/address/${address}`;
}
