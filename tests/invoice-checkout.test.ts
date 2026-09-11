import assert from "node:assert/strict";
import { test } from "node:test";
import { runInvoiceCheckout } from "../src/lib/invoice-checkout";
import { ETHEREUM_CHAIN_ID, getInvoicePaymentData } from "../services/ethereum";

const hash = `0x${"ab".repeat(32)}`;
const from = "0x1111111111111111111111111111111111111111";
const treasury = "0x2222222222222222222222222222222222222222";

function scenario() {
  let pending: string | null = null;
  let sends = 0;
  let connections = 0;
  const controller = new AbortController();
  const input = {
    invoiceId: "INV-TEST", amount: "0.001", treasury, available: true, signal: controller.signal,
    pendingHash: () => pending,
    checkStatus: async () => false,
    rememberHash: (value: string) => { pending = value; },
    confirm: async (value: string) => { assert.equal(value, hash); },
    getWallet: async () => {
      connections++;
      return { request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === "eth_chainId") return `0x${ETHEREUM_CHAIN_ID.toString(16)}`;
        if (method === "eth_requestAccounts") return [from];
        assert.equal(method, "eth_sendTransaction");
        const tx = params?.[0] as { to: string; data: string; value: string };
        assert.equal(tx.to, treasury);
        assert.equal(tx.data, getInvoicePaymentData("INV-TEST"));
        assert.equal(BigInt(tx.value), BigInt("1000000000000000"));
        sends++;
        return hash;
      } };
    },
  };
  return { input, controller, sends: () => sends, connections: () => connections };
}

test("checkout connects, sends exact invoice value once, and retains its broadcast for confirmation", async () => {
  const state = scenario();
  await runInvoiceCheckout(state.input);
  assert.equal(state.sends(), 1);
  assert.equal(state.input.pendingHash(), hash);
});

test("confirmation failure followed by recovery cannot send the invoice twice", async () => {
  const state = scenario();
  await assert.rejects(runInvoiceCheckout({ ...state.input, confirm: async () => { throw new Error("RPC offline"); } }), /RPC offline/);
  await runInvoiceCheckout({ ...state.input, checkStatus: async () => true });
  assert.equal(state.sends(), 1);
  assert.equal(state.connections(), 1);
});

test("checking a reverted payment does not send again even if recovery clears the hash", async () => {
  const state = scenario();
  state.input.rememberHash(hash);
  await runInvoiceCheckout({ ...state.input, checkStatus: async () => { state.input.rememberHash(""); return false; } });
  assert.equal(state.sends(), 0);
  assert.equal(state.connections(), 0);
});

test("another payer completing during wallet connection cancels the new send", async () => {
  const state = scenario();
  let checks = 0;
  await runInvoiceCheckout({ ...state.input, checkStatus: async () => ++checks === 2 });
  assert.equal(state.sends(), 0);
});

test("an unavailable status check fails closed before connecting or sending", async () => {
  const state = scenario();
  await assert.rejects(runInvoiceCheckout({ ...state.input, checkStatus: async () => { throw new Error("Storage unavailable"); } }), /Storage unavailable/);
  assert.equal(state.connections(), 0);
  assert.equal(state.sends(), 0);
});

test("closing checkout while signing still saves the returned broadcast for another session", async () => {
  const state = scenario();
  let saved = false;
  await runInvoiceCheckout({
    ...state.input,
    rememberHash: value => { state.input.rememberHash(value); state.controller.abort(); },
    confirm: async (value, signal) => { assert.equal(value, hash); assert.equal(signal.aborted, false); saved = true; },
  });
  assert.equal(saved, true);
  assert.equal(state.sends(), 1);
  assert.equal(state.input.pendingHash(), hash);
});
