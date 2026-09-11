import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ETHEREUM_CHAIN_ID,
  getInvoicePaymentData,
  normalizeEthereumAddress,
  parseEthAmount,
  PaymentVerificationError,
  sendEthPayment,
  verifyEthPayment,
  type EthereumPaymentReader,
  type EthereumWallet,
} from "../services/ethereum";
import {
  PaymentConfirmationConflictError,
  type ConfirmedInvoicePayment,
} from "../src/lib/payment-confirmations";
import { InvoiceStore } from "../src/lib/invoice-store";

const treasury = "0x1111111111111111111111111111111111111111";
const payer = "0x2222222222222222222222222222222222222222";
const transactionHash = `0x${"ab".repeat(32)}`;
const blockHash = `0x${"45".repeat(32)}`;
const blockTimestamp = 1789140000;
const invoice = { id: "INV-TEST", amount: "0.001", treasury, chainId: ETHEREUM_CHAIN_ID } as const;
const transaction = {
  hash: transactionHash,
  chainId: BigInt(ETHEREUM_CHAIN_ID),
  from: payer,
  to: treasury,
  value: BigInt("1000000000000000"),
  data: getInvoicePaymentData(invoice.id),
};
const receipt = { hash: transactionHash, from: payer, to: treasury, status: 1, blockNumber: 123, blockHash };
const reader: EthereumPaymentReader = {
  getNetwork: async () => ({ chainId: BigInt(ETHEREUM_CHAIN_ID) }),
  getTransaction: async () => transaction,
  getTransactionReceipt: async () => receipt,
  getBlock: async () => ({ hash: blockHash, timestamp: blockTimestamp }),
};

test("ETH amounts preserve wei precision and reject rounding, zero, and malformed inputs", () => {
  assert.equal(parseEthAmount("0.000000000000000001"), BigInt(1));
  assert.equal(parseEthAmount("1.234567890123456789"), BigInt("1234567890123456789"));
  for (const value of ["0", "-1", "1e3", "NaN", "1,000", "0.0000000000000000001"]) {
    assert.throws(() => parseEthAmount(value));
  }
  assert.throws(() => normalizeEthereumAddress("0x0000000000000000000000000000000000000000"));
  assert.throws(() => normalizeEthereumAddress("not-an-address"));
});

test("wallet switches to Sepolia and submits native ETH with the invoice reference", async () => {
  let chainId = "0x1";
  const calls: Array<{ method: string; params?: unknown[] }> = [];
  const wallet: EthereumWallet = {
    async request(args) {
      calls.push(args);
      if (args.method === "eth_chainId") return chainId;
      if (args.method === "wallet_switchEthereumChain") { chainId = "0xaa36a7"; return null; }
      if (args.method === "eth_requestAccounts") return [payer];
      if (args.method === "eth_sendTransaction") return transactionHash;
      throw new Error(`Unexpected method ${args.method}`);
    },
  };
  assert.deepEqual(await sendEthPayment({ to: treasury, amount: invoice.amount, invoiceId: invoice.id, wallet }), { transactionHash, payer });
  assert.deepEqual(calls.at(-1), {
    method: "eth_sendTransaction",
    params: [{ from: payer, to: treasury, value: "0x38d7ea4c68000", data: transaction.data, chainId: "0xaa36a7" }],
  });
  assert.ok(calls.some(call => call.method === "wallet_switchEthereumChain"));
});

test("wallet cannot submit if the account prompt changes networks", async () => {
  let chainId = "0xaa36a7";
  let sent = false;
  const wallet: EthereumWallet = {
    async request({ method }) {
      if (method === "eth_chainId") return chainId;
      if (method === "eth_requestAccounts") { chainId = "0x1"; return [payer]; }
      if (method === "eth_sendTransaction") sent = true;
      return null;
    },
  };
  await assert.rejects(sendEthPayment({ to: treasury, amount: "0.001", wallet }), /Sepolia/);
  assert.equal(sent, false);
});

test("wallet rejection does not submit a transaction", async () => {
  const wallet: EthereumWallet = {
    async request({ method }) {
      if (method === "eth_chainId") return "0x1";
      if (method === "wallet_switchEthereumChain") throw { code: 4001 };
      assert.fail("No further wallet actions after rejected network switch");
    },
  };
  await assert.rejects(sendEthPayment({ to: treasury, amount: "0.001", wallet }), { code: 4001 });
});

test("successful verification requires a mined Sepolia payment matching the stored invoice", async () => {
  assert.deepEqual(await verifyEthPayment({ invoice, transactionHash, provider: reader }), { payer, treasury, blockNumber: 123, confirmedAt: new Date(blockTimestamp * 1000).toISOString() });
});

test("invoice verification requires a matching receipt in the canonical mined block", async () => {
  for (const change of [{ hash: blockHash }, { from: treasury }, { to: payer }, { to: null }, { blockNumber: 0 }, { status: 2 }]) {
    await assert.rejects(verifyEthPayment({ invoice, transactionHash,
      provider: { ...reader, getTransactionReceipt: async () => ({ ...receipt, ...change }) },
    }), PaymentVerificationError);
  }
  for (const block of [null, { hash: transactionHash, timestamp: blockTimestamp }]) {
    await assert.rejects(verifyEthPayment({ invoice, transactionHash, provider: { ...reader, getBlock: async () => block } }),
      (error: unknown) => error instanceof PaymentVerificationError && error.status === 202);
  }
  await assert.rejects(verifyEthPayment({ invoice, transactionHash, provider: { ...reader, getBlock: async () => ({ hash: blockHash, timestamp: NaN }) } }), PaymentVerificationError);
});

test("verified broadcasts are saved before receipt lookup, and invalid candidates are never saved", async () => {
  let persisted = false;
  await assert.rejects(verifyEthPayment({ invoice, transactionHash,
    onTransactionVerified: async () => { persisted = true; },
    provider: { ...reader, getTransactionReceipt: async () => { assert.equal(persisted, true); return null; } },
  }), (error: unknown) => error instanceof PaymentVerificationError && error.code === "transaction_pending");
  persisted = false;
  await assert.rejects(verifyEthPayment({ invoice, transactionHash,
    onTransactionVerified: async () => { persisted = true; },
    provider: { ...reader, getTransaction: async () => ({ ...transaction, value: BigInt(1) }) },
  }), PaymentVerificationError);
  assert.equal(persisted, false);
  await assert.rejects(verifyEthPayment({ invoice, transactionHash,
    onTransactionVerified: async () => { throw new Error("Storage unavailable"); }, provider: reader,
  }), /Storage unavailable/);
});

test("pending and failed transactions are never accepted", async () => {
  for (const [result, status] of [[null, 202], [{ ...receipt, status: 0 }, 422]] as const) {
    await assert.rejects(
      verifyEthPayment({ invoice, transactionHash, provider: { ...reader, getTransactionReceipt: async () => result } }),
      (error: unknown) => error instanceof PaymentVerificationError && error.status === status,
    );
  }
});

test("wrong chain, amount, recipient, or invoice reference cannot confirm payment", async () => {
  const variations = [
    { chainId: BigInt(1) },
    { to: payer },
    { to: null },
    { value: BigInt(1) },
    { data: "0x" },
    { data: getInvoicePaymentData("INV-OTHER") },
  ];
  for (const change of variations) {
    await assert.rejects(verifyEthPayment({
      invoice, transactionHash,
      provider: { ...reader, getTransaction: async () => ({ ...transaction, ...change }) },
    }), (error: unknown) => error instanceof PaymentVerificationError && error.status === 422);
  }
  await assert.rejects(verifyEthPayment({
    invoice, transactionHash,
    provider: { ...reader, getNetwork: async () => ({ chainId: BigInt(1) }) },
  }), (error: unknown) => error instanceof PaymentVerificationError && error.status === 503);
});

test("a transaction can confirm one invoice only, including case variants and concurrent retries", async () => {
  const store = new InvoiceStore(":memory:");
  (await store.saveInvoice({ ...invoice, currency: "ETH", customerName: "Customer", title: "Invoice", memo: "", dueDate: "2026-09-12", createdAt: "2026-09-11", paymentTerms: "Due on receipt", treasuryAccount: "Company" }));
  const payment: ConfirmedInvoicePayment = {
    invoiceId: invoice.id, amount: invoice.amount, currency: "ETH", chainId: ETHEREUM_CHAIN_ID,
    transactionHash, payer, treasury, blockNumber: 123, status: "Succeeded",
    confirmationStatus: "confirmed", confirmedAt: new Date().toISOString(), explorerUrl: "https://sepolia.etherscan.io/tx/" + transactionHash,
  };
  try {
    const saved = (await store.savePayment(payment));
    assert.deepEqual((await store.savePayment(payment)), saved);
    assert.equal((await store.getInvoiceIdForTransaction(`0x${"AB".repeat(32)}`)), invoice.id);
    (await assert.rejects(async () => (await store.savePayment({ ...payment, invoiceId: "INV-OTHER", transactionHash: `0x${"AB".repeat(32)}` })), PaymentConfirmationConflictError));
    (await assert.rejects(async () => (await store.savePayment({ ...payment, transactionHash: `0x${"cd".repeat(32)}` })), PaymentConfirmationConflictError));
  } finally { store.close(); }
});
