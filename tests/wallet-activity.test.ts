import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeWalletActivity, type WalletActivity } from "../src/lib/wallet-activity";

function activity(overrides: Partial<WalletActivity> = {}): WalletActivity {
  return {
    id: "TX-1",
    kind: "payment",
    counterparty: "Company",
    reference: "INV-024",
    amount: "1",
    network: "Ethereum Sepolia",
    status: "Succeeded",
    dateTime: "2026-09-10T12:00:00Z",
    ...overrides,
  };
}

test("wallet activity preserves a single wei even alongside amounts above Number precision", () => {
  const summary = summarizeWalletActivity([
    activity({ amount: "9007199254740993" }),
    activity({ amount: "0.000000000000000001" }),
    activity({ kind: "payout", amount: "9007199254740993" }),
  ]);

  assert.equal(summary.received, "9007199254740993.000000000000000001");
  assert.equal(summary.paidOut, "9007199254740993");
  assert.equal(summary.net, "0.000000000000000001");
  assert.equal(summary.receivedCount, 2);
  assert.equal(summary.paidOutCount, 1);
  assert.deepEqual(summary.networks, [{
    network: "Ethereum Sepolia",
    received: "9007199254740993.000000000000000001",
    paidOut: "9007199254740993",
    count: 3,
  }]);
});

test("only successful records contribute amounts; incomplete records count as pending", () => {
  const statuses = ["Failed", "Incomplete", "Refunded", "Disputed"] as const;
  const summary = summarizeWalletActivity([
    ...statuses.flatMap(status => [
      activity({ status, amount: "100" }),
      activity({ status, kind: "payout", amount: "200", network: "Base Sepolia" }),
    ]),
    activity({ status: "Incomplete", amount: "invalid" }),
    activity({ amount: "0.3" }),
    activity({ kind: "payout", amount: "0.1" }),
  ]);

  assert.deepEqual(summary, {
    received: "0.3",
    paidOut: "0.1",
    net: "0.2",
    receivedCount: 1,
    paidOutCount: 1,
    pendingCount: 3,
    networks: [{ network: "Ethereum Sepolia", received: "0.3", paidOut: "0.1", count: 2 }],
  });
});

test("each supported network reports its own incoming and outgoing activity", () => {
  const items = Object.freeze([
    Object.freeze(activity({ network: "Base Sepolia", amount: "0.4" })),
    Object.freeze(activity({ amount: "0.1" })),
    Object.freeze(activity({ kind: "payout", amount: "0.03", network: "Base Sepolia" })),
    Object.freeze(activity({ kind: "payout", amount: "0.02" })),
  ]);
  assert.deepEqual(summarizeWalletActivity(items), {
    received: "0.5",
    paidOut: "0.05",
    net: "0.45",
    receivedCount: 2,
    paidOutCount: 2,
    pendingCount: 0,
    networks: [
      { network: "Base Sepolia", received: "0.4", paidOut: "0.03", count: 2 },
      { network: "Ethereum Sepolia", received: "0.1", paidOut: "0.02", count: 2 },
    ],
  });
});

test("net activity can be negative without being treated as a wallet balance", () => {
  const summary = summarizeWalletActivity([
    activity({ amount: "0.1" }),
    activity({ kind: "payout", amount: "0.100000000000000001" }),
  ]);
  assert.equal(summary.net, "-0.000000000000000001");
  assert.equal(summary.received, "0.1");
  assert.equal(summary.paidOut, "0.100000000000000001");
});

test("empty or malformed successful activity cannot inflate totals or counts", () => {
  const emptySummary = {
    received: "0",
    paidOut: "0",
    net: "0",
    receivedCount: 0,
    paidOutCount: 0,
    pendingCount: 0,
    networks: [],
  };
  assert.deepEqual(summarizeWalletActivity([]), emptySummary);

  const invalidAmounts = ["", " ", "0", "0.000", "-1", "1e3", "NaN", "Infinity", "1,000", "0.0000000000000000001"];
  assert.deepEqual(summarizeWalletActivity(invalidAmounts.flatMap(amount => [
    activity({ amount }),
    activity({ amount, kind: "payout", network: "Base Sepolia" }),
  ])), emptySummary);

  assert.deepEqual(summarizeWalletActivity([
    activity({ network: "Unsupported" as WalletActivity["network"] }),
    activity({ kind: "invalid" as WalletActivity["kind"] }),
  ]), emptySummary);
});
