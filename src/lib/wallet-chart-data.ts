import { formatEther } from "ethers";
import { parseEthAmount } from "../../services/ethereum";
import type { WalletActivity } from "./wallet-activity";

export type WalletActivityRange = "7d" | "30d" | "all";
export type WalletActivityDay = { date: string; received: string; paidOut: string };

const DAY_MS = 86_400_000;
const NETWORKS: WalletActivity["network"][] = ["Ethereum Sepolia", "Base Sepolia"];

/** Exact decimal presentation, including zero. Invalid amounts are never displayed as zero. */
export function formatExactEthAmount(value: string): string {
  if (typeof value !== "string") return "—";
  const amount = value.trim();
  if (!/^\d+(?:\.\d{1,18})?$/.test(amount)) return "—";
  const [whole, fraction = ""] = amount.split(".");
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${fraction.replace(/0+$/, "").padEnd(2, "0")}`;
}

function formatWei(amount: bigint): string {
  return formatEther(amount).replace(/\.0$/, "");
}

function timestampOf(value: string): number | null {
  if (typeof value !== "string") return null;
  // An explicit offset is required. Locale-formatted display strings are ambiguous.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function utcDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

type Bucket = { received: bigint; paidOut: bigint };
type NetworkBucket = Bucket & { count: number };

/** Successful recorded transfer volume only. These points never represent wallet balance history. */
export function buildWalletActivityChart(
  items: readonly WalletActivity[],
  { range = "all", now = new Date() }: { range?: WalletActivityRange; now?: Date } = {},
) {
  const currentTime = now.getTime();
  if (!Number.isFinite(currentTime)) throw new Error("A valid current date is required.");
  const currentDay = Math.floor(currentTime / DAY_MS) * DAY_MS;
  const rangeStart = range === "7d" ? currentDay - 6 * DAY_MS : range === "30d" ? currentDay - 29 * DAY_MS : null;
  const buckets = new Map<string, Bucket>();
  const networks = new Map<WalletActivity["network"], NetworkBucket>();
  let received = BigInt(0);
  let paidOut = BigInt(0);
  let receivedCount = 0;
  let paidOutCount = 0;

  for (const item of items) {
    if (item.status !== "Succeeded" || !NETWORKS.includes(item.network) || (item.kind !== "payment" && item.kind !== "payout")) continue;
    const timestamp = timestampOf(item.occurredAt ?? item.dateTime);
    if (timestamp === null || (rangeStart !== null && (timestamp < rangeStart || timestamp > currentTime))) continue;
    let amount: bigint;
    try { amount = parseEthAmount(item.amount); } catch { continue; }
    const date = utcDate(timestamp);
    const bucket = buckets.get(date) ?? { received: BigInt(0), paidOut: BigInt(0) };
    const network = networks.get(item.network) ?? { received: BigInt(0), paidOut: BigInt(0), count: 0 };
    if (item.kind === "payment") {
      bucket.received += amount;
      network.received += amount;
      received += amount;
      receivedCount += 1;
    } else {
      bucket.paidOut += amount;
      network.paidOut += amount;
      paidOut += amount;
      paidOutCount += 1;
    }
    network.count += 1;
    buckets.set(date, bucket);
    networks.set(item.network, network);
  }

  const observedDates = [...buckets.keys()].sort();
  const startDate = rangeStart === null ? observedDates[0] ?? null : utcDate(rangeStart);
  const endDate = rangeStart === null ? observedDates.at(-1) ?? null : utcDate(currentDay);
  let dates = observedDates;
  let dailyIsSparse = false;
  if (startDate && endDate) {
    const firstDay = Date.parse(`${startDate}T00:00:00.000Z`);
    const lastDay = Date.parse(`${endDate}T00:00:00.000Z`);
    const dayCount = Math.round((lastDay - firstDay) / DAY_MS) + 1;
    // Keep all totals and observed dates for longer histories without allocating years of empty points.
    dailyIsSparse = dayCount > 366;
    if (!dailyIsSparse) dates = Array.from({ length: dayCount }, (_, index) => utcDate(firstDay + index * DAY_MS));
  }
  const daily: WalletActivityDay[] = dates.map(date => {
    const bucket = buckets.get(date);
    return { date, received: formatWei(bucket?.received ?? BigInt(0)), paidOut: formatWei(bucket?.paidOut ?? BigInt(0)) };
  });

  return {
    daily,
    dailyIsSparse,
    startDate,
    endDate,
    totals: { received: formatWei(received), paidOut: formatWei(paidOut), totalVolume: formatWei(received + paidOut), count: receivedCount + paidOutCount, receivedCount, paidOutCount },
    networks: NETWORKS.flatMap(network => {
      const bucket = networks.get(network);
      return bucket ? [{ network, received: formatWei(bucket.received), paidOut: formatWei(bucket.paidOut), volume: formatWei(bucket.received + bucket.paidOut), count: bucket.count }] : [];
    }),
  };
}
