import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWalletActivityChart, formatExactEthAmount } from "../src/lib/wallet-chart-data";
import type { WalletActivity } from "../src/lib/wallet-activity";

function activity(overrides: Partial<WalletActivity> = {}): WalletActivity {
  return { id: "TX-1", kind: "payment", counterparty: "Company", reference: "INV-024", amount: "1", network: "Ethereum Sepolia", status: "Succeeded", dateTime: "Sep 11, 2026, 12:00 PM", occurredAt: "2026-09-11T12:00:00.000Z", ...overrides };
}
const now = new Date("2026-09-11T12:00:00.000Z");

test("ETH display groups exact decimals without approximating large values or a single wei", () => {
  assert.equal(formatExactEthAmount("9007199254740993.000000000000000001"), "9,007,199,254,740,993.000000000000000001");
  assert.equal(formatExactEthAmount("0.000000000000000001"), "0.000000000000000001");
  assert.equal(formatExactEthAmount("00002400.100000"), "2,400.10");
  assert.equal(formatExactEthAmount("1234567.123456789012345678"), "1,234,567.123456789012345678");
  assert.equal(formatExactEthAmount("0"), "0.00");
  assert.equal(formatExactEthAmount(" 12 "), "12.00");
  for (const amount of ["", " ", "NaN", "Infinity", "1e3", "-1", "1,000", "0.0000000000000000001", "1."]) assert.equal(formatExactEthAmount(amount), "—");
});

test("daily UTC volumes and network totals preserve exact wei independently", () => {
  const chart = buildWalletActivityChart([
    activity({ amount: "9007199254740993", occurredAt: "2026-09-10T12:00:00Z" }),
    activity({ amount: "0.000000000000000001", occurredAt: "2026-09-10T15:00:00Z", network: "Base Sepolia" }),
    activity({ amount: "9007199254740993", kind: "payout", network: "Base Sepolia" }),
  ], { now });
  assert.deepEqual(chart.daily, [
    { date: "2026-09-10", received: "9007199254740993.000000000000000001", paidOut: "0" },
    { date: "2026-09-11", received: "0", paidOut: "9007199254740993" },
  ]);
  assert.deepEqual(chart.totals, { received: "9007199254740993.000000000000000001", paidOut: "9007199254740993", totalVolume: "18014398509481986.000000000000000001", count: 3, receivedCount: 2, paidOutCount: 1 });
  assert.deepEqual(chart.networks, [
    { network: "Ethereum Sepolia", received: "9007199254740993", paidOut: "0", volume: "9007199254740993", count: 1 },
    { network: "Base Sepolia", received: "0.000000000000000001", paidOut: "9007199254740993", volume: "9007199254740993.000000000000000001", count: 2 },
  ]);
});

test("UTC day bucketing honors explicit offsets and ignores ambiguous or invalid calendar timestamps", () => {
  const chart = buildWalletActivityChart([
    activity({ amount: "1", occurredAt: "2026-09-11T00:30:00+05:30" }),
    activity({ amount: "2", occurredAt: "2026-09-10T22:30:00-04:00" }),
    activity({ amount: "3", occurredAt: undefined, dateTime: "2026-09-11T04:00:00Z" }),
    ...["not a date", "2026-02-30T12:00:00Z", "2025-02-29T12:00:00Z", "2026-09-11T12:00:00", "2026-09-11", "2026-09-11T24:00:00Z", "2026-09-11T12:00:00+25:00", "September 11, 2026, 12:00 PM"].map(occurredAt => activity({ amount: "100", occurredAt })),
  ], { now });
  assert.deepEqual(chart.daily, [{ date: "2026-09-10", received: "1", paidOut: "0" }, { date: "2026-09-11", received: "5", paidOut: "0" }]);
  assert.equal(chart.totals.totalVolume, "6");
  assert.equal(buildWalletActivityChart([activity({ occurredAt: "2024-02-29T12:00:00Z" })], { now }).totals.count, 1);
});

test("only successful valid transfers contribute, rather than fabricated balance history", () => {
  const invalidStatuses = ["Failed", "Incomplete", "Refunded", "Disputed"] as const;
  const chart = buildWalletActivityChart([
    ...invalidStatuses.map(status => activity({ status })),
    ...["0", "-1", "1e3", "invalid", "0.0000000000000000001"].map(amount => activity({ amount })),
    activity({ network: "Unsupported" as WalletActivity["network"] }),
    activity({ kind: "other" as WalletActivity["kind"] }),
    activity({ amount: "0.3" }), activity({ amount: "0.2", kind: "payout" }),
  ], { now });
  assert.deepEqual(chart.daily, [{ date: "2026-09-11", received: "0.3", paidOut: "0.2" }]);
  assert.equal(chart.totals.totalVolume, "0.5");
  assert.equal(chart.totals.count, 2);
});

test("7 and 30 day ranges are inclusive UTC windows anchored to now, excluding later timestamps", () => {
  const items = [
    activity({ occurredAt: "2026-09-04T23:59:59Z", amount: "100" }),
    activity({ occurredAt: "2026-09-05T00:00:00Z", amount: "1" }),
    activity({ amount: "2" }),
    activity({ occurredAt: "2026-09-11T12:00:01Z", amount: "200" }),
    activity({ occurredAt: "2026-09-12T00:00:00Z", amount: "300" }),
  ];
  const week = buildWalletActivityChart(items, { range: "7d", now });
  assert.equal(week.startDate, "2026-09-05");
  assert.equal(week.endDate, "2026-09-11");
  assert.equal(week.daily.length, 7);
  assert.deepEqual(week.daily[1], { date: "2026-09-06", received: "0", paidOut: "0" });
  assert.equal(week.totals.totalVolume, "3");
  const month = buildWalletActivityChart(items, { range: "30d", now });
  assert.equal(month.startDate, "2026-08-13");
  assert.equal(month.daily.length, 30);
  assert.equal(month.totals.totalVolume, "103");
  assert.equal(buildWalletActivityChart(items, { now }).totals.totalVolume, "603");
});

test("all time fills empty days without truncating totals for older or future dated records", () => {
  const items = [activity({ occurredAt: "2026-09-09T00:00:00Z" }), activity({ occurredAt: "2026-09-12T00:00:00Z", kind: "payout", amount: "2" })];
  const chart = buildWalletActivityChart(items, { now });
  assert.equal(chart.daily.length, 4);
  assert.deepEqual(chart.daily[1], { date: "2026-09-10", received: "0", paidOut: "0" });
  assert.equal(chart.totals.totalVolume, "3");
  assert.equal(chart.dailyIsSparse, false);
  const longHistory = buildWalletActivityChart([...items, activity({ occurredAt: "2020-01-01T00:00:00Z" })], { now });
  assert.equal(longHistory.dailyIsSparse, true);
  assert.equal(longHistory.daily.length, 3);
  assert.equal(longHistory.totals.totalVolume, "4");
});

test("empty histories retain zero volumes and stable range boundaries", () => {
  const all = buildWalletActivityChart([], { now });
  assert.deepEqual(all.daily, []);
  assert.equal(all.startDate, null);
  assert.equal(all.endDate, null);
  assert.equal(all.totals.totalVolume, "0");
  assert.deepEqual(all.networks, []);
  assert.equal(buildWalletActivityChart([], { range: "7d", now }).daily.length, 7);
});
