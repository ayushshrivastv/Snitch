import { formatEther } from "ethers";
import {
  isEthereumTransactionHash,
  normalizeEthereumAddress,
  parseEthAmount,
} from "../../services/ethereum";

export type PendingCompanyPayout = {
  companyId: string;
  transactionHash: string;
  from: string;
  to: string;
  amount: string;
  receiverName: string;
  memo: string;
  createdAt: string;
};

export type PendingPayoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const MAX_RECORDS = 100;
const MAX_STORED_LENGTH = 256_000;
const KEY_PREFIX = "snitch:pending-company-payouts:v1:";

function storageKey(ownerId: string): string | null {
  if (typeof ownerId !== "string" || !ownerId.trim() || ownerId.length > 256) return null;
  return `${KEY_PREFIX}${encodeURIComponent(ownerId)}`;
}

function resolveStorage(storage?: PendingPayoutStorage | null): PendingPayoutStorage | null {
  if (storage !== undefined) return storage;
  return typeof window === "undefined" ? null : window.localStorage;
}

function validRecord(value: unknown): PendingCompanyPayout | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || "status" in value) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.companyId !== "string" || !/^[a-zA-Z0-9_:-]{1,128}$/.test(record.companyId) ||
    !isEthereumTransactionHash(record.transactionHash) ||
    typeof record.from !== "string" || record.from.length > 42 ||
    typeof record.to !== "string" || record.to.length > 42 ||
    typeof record.amount !== "string" || record.amount.length > 100 ||
    typeof record.receiverName !== "string" || !record.receiverName.trim() || record.receiverName.length > 200 ||
    typeof record.memo !== "string" || record.memo.length > 1_000 ||
    typeof record.createdAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.createdAt)
  ) return null;

  try {
    if (new Date(record.createdAt).toISOString() !== record.createdAt) return null;
    // Project only public transfer fields: no session material or claimed confirmation is persisted.
    return {
      companyId: record.companyId,
      transactionHash: record.transactionHash.toLowerCase(),
      from: normalizeEthereumAddress(record.from),
      to: normalizeEthereumAddress(record.to),
      amount: formatEther(parseEthAmount(record.amount)),
      receiverName: record.receiverName.trim(),
      memo: record.memo.trim(),
      createdAt: record.createdAt,
    };
  } catch {
    return null;
  }
}

function load(storage: PendingPayoutStorage, key: string): PendingCompanyPayout[] {
  const raw = storage.getItem(key);
  if (!raw || raw.length > MAX_STORED_LENGTH) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const records: PendingCompanyPayout[] = [];
  const hashes = new Set<string>();
  for (const value of data.slice(0, MAX_RECORDS)) {
    const record = validRecord(value);
    if (!record || hashes.has(record.transactionHash)) continue;
    hashes.add(record.transactionHash);
    records.push(record);
  }
  return records;
}

/** Recovery hints only. The authenticated server must verify ownership and chain receipts. */
export function readPendingCompanyPayouts(
  ownerId: string,
  storage?: PendingPayoutStorage | null,
): PendingCompanyPayout[] {
  try {
    const key = storageKey(ownerId);
    const resolved = resolveStorage(storage);
    return key && resolved ? load(resolved, key) : [];
  } catch {
    return [];
  }
}

/** Call immediately after broadcasting; a storage failure must never turn into a resend. */
export function rememberPendingCompanyPayout(
  ownerId: string,
  record: PendingCompanyPayout,
  storage?: PendingPayoutStorage | null,
): boolean {
  try {
    const key = storageKey(ownerId);
    const resolved = resolveStorage(storage);
    const validated = validRecord(record);
    if (!key || !resolved || !validated) return false;
    const records = [validated, ...load(resolved, key).filter(item => item.transactionHash !== validated.transactionHash)];
    resolved.setItem(key, JSON.stringify(records.slice(0, MAX_RECORDS)));
    return true;
  } catch {
    return false;
  }
}

export function forgetPendingCompanyPayout(
  ownerId: string,
  transactionHash: string,
  storage?: PendingPayoutStorage | null,
): boolean {
  try {
    const key = storageKey(ownerId);
    const resolved = resolveStorage(storage);
    if (!key || !resolved || !isEthereumTransactionHash(transactionHash)) return false;
    const records = load(resolved, key).filter(item => item.transactionHash !== transactionHash.toLowerCase());
    if (records.length) resolved.setItem(key, JSON.stringify(records));
    else resolved.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
