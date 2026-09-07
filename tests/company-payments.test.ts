import assert from "node:assert/strict";
import { test } from "node:test";
import { sendCompanyWalletPayment } from "../src/components/auth/company-payment-request";
import { verifyCompanyPayment, type CompanyPaymentReader } from "../src/lib/company-payment-verification";
import type { CompanyAccount } from "../src/lib/company-types";

const from = "0x1111111111111111111111111111111111111111";
const to = "0x2222222222222222222222222222222222222222";
const other = "0x3333333333333333333333333333333333333333";
const transactionHash = `0x${"ab".repeat(32)}`;
const blockHash = `0x${"cd".repeat(32)}`;
const company: CompanyAccount = {
  id: "company-id", purpose: "playground", name: "Snitchpay.co", ownerUserId: "owner", cfoUserId: "owner",
  createdAt: "2026-09-11", updatedAt: "2026-09-11", baselineWalletAddresses: [],
  wallet: { status: "ready", address: from, privyWalletId: "wallet-id" },
};
const transaction = { hash: transactionHash, chainId: BigInt(11155111), from, to, value: BigInt(1), data: "0x" };
const receipt = { hash: transactionHash, from, to, status: 1, blockNumber: 123, blockHash };
function reader(overrides: Partial<CompanyPaymentReader> = {}): CompanyPaymentReader {
  return {
    getNetwork: async () => ({ chainId: BigInt(11155111) }),
    getTransaction: async () => transaction,
    getTransactionReceipt: async () => receipt,
    getBlock: async () => ({ hash: blockHash, timestamp: 1789140000 }),
    ...overrides,
  };
}
const verify = (provider: CompanyPaymentReader) => verifyCompanyPayment({
  from, to, amount: "0.000000000000000001", transactionHash, provider,
});

test("company signing pins the owned wallet, Sepolia, exact wei and Privy's confirmation UI", async () => {
  let calls = 0;
  const result = await sendCompanyWalletPayment({
    company, userId: "owner", input: { to, amount: "0.000000000000000001" }, signal: new AbortController().signal,
    sendTransaction: async (tx, options) => {
      calls += 1;
      assert.deepEqual(tx, { from, to, value: BigInt(1), data: "0x", chainId: 11155111 });
      assert.equal(options.address, from);
      assert.equal(options.uiOptions.showWalletUIs, true);
      assert.equal(options.uiOptions.isCancellable, true);
      return { hash: transactionHash };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { from, to, amount: "0.000000000000000001", transactionHash });
});

test("a returned broadcast hash survives logout instead of inviting a resend", async () => {
  const controller = new AbortController();
  const result = await sendCompanyWalletPayment({
    company, userId: "owner", input: { to, amount: "1" }, signal: controller.signal,
    sendTransaction: async () => { controller.abort(); return { hash: transactionHash }; },
  });
  assert.equal(result.transactionHash, transactionHash);
});

test("signing rejects stale sessions, another owner, pending wallets and invalid amounts before Privy", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const defaults = { company, userId: "owner", input: { to, amount: "1" }, signal: new AbortController().signal,
    sendTransaction: async () => { calls += 1; return { hash: transactionHash }; } };
  await assert.rejects(sendCompanyWalletPayment({ ...defaults, signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(sendCompanyWalletPayment({ ...defaults, userId: "another-owner" }), /Only the company wallet owner/);
  await assert.rejects(sendCompanyWalletPayment({ ...defaults, company: { ...company, wallet: { status: "pending" } } }), /Finish setting up/);
  await assert.rejects(sendCompanyWalletPayment({ ...defaults, input: { to, amount: "0" } }), /greater than zero/);
  await assert.rejects(sendCompanyWalletPayment({ ...defaults, input: { to, amount: "0.0000000000000000001" } }), /18 decimal/);
  assert.equal(calls, 0);
});

test("a user-rejected Privy confirmation propagates without a fabricated transaction", async () => {
  await assert.rejects(sendCompanyWalletPayment({
    company, userId: "owner", input: { to, amount: "1" }, signal: new AbortController().signal,
    sendTransaction: async () => { throw new Error("User rejected"); },
  }), /User rejected/);
});

test("matching confirmed company transfer reports exact receipt and block timestamp", async () => {
  assert.deepEqual(await verify(reader()), {
    status: "Succeeded", transactionHash, blockNumber: 123,
    confirmedAt: new Date(1789140000 * 1000).toISOString(), explorerUrl: `https://sepolia.etherscan.io/tx/${transactionHash}`,
  });
});

for (const [name, override] of [
  ["another sender", { from: other }], ["another recipient", { to: other }],
  ["a different wei amount", { value: BigInt(2) }], ["another chain", { chainId: BigInt(1) }],
  ["a different hash", { hash: blockHash }], ["contract calldata", { data: "0x1234" }],
] as const) {
  test(`company transfer verification rejects ${name}`, async () => {
    await assert.rejects(verify(reader({ getTransaction: async () => ({ ...transaction, ...override }) })), /does not match/);
  });
}

test("verification rejects a mainnet RPC even when the transaction looks like Sepolia", async () => {
  await assert.rejects(verify(reader({ getNetwork: async () => ({ chainId: BigInt(1) }) })), /requires Ethereum Sepolia/);
});

test("unmined transactions and unknown receipts remain Incomplete", async () => {
  assert.equal((await verify(reader({ getTransaction: async () => null, getTransactionReceipt: async () => null }))).status, "Incomplete");
  assert.equal((await verify(reader({ getTransactionReceipt: async () => null }))).status, "Incomplete");
  assert.equal((await verify(reader({ getTransactionReceipt: async () => ({ ...receipt, status: null }) }))).status, "Incomplete");
});

test("a matched reverted transfer is Failed and a mismatched revert is never accepted", async () => {
  assert.equal((await verify(reader({ getTransactionReceipt: async () => ({ ...receipt, status: 0 }) }))).status, "Failed");
  await assert.rejects(verify(reader({ getTransactionReceipt: async () => ({ ...receipt, from: other, status: 0 }) })), /does not match/);
});

test("a receipt removed from the canonical block is not reported as successful", async () => {
  assert.equal((await verify(reader({ getBlock: async () => ({ hash: transactionHash, timestamp: 1789140000 }) }))).status, "Incomplete");
});
