import assert from "node:assert/strict";
import { test } from "node:test";
import { forgetPendingInvoicePayment, readPendingInvoicePayment, rememberPendingInvoicePayment } from "../src/lib/pending-invoice-payment";

const hash = `0x${"ab".repeat(32)}`;
const data = new Map<string, string>();
const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };

test("a delayed reverted attempt cannot erase a newer payment from another tab", () => {
  data.clear();
  const newerHash = `0x${"cd".repeat(32)}`;
  rememberPendingInvoicePayment("invoice-a", hash, storage);
  rememberPendingInvoicePayment("invoice-a", newerHash, storage);
  forgetPendingInvoicePayment("invoice-a", hash, storage);
  assert.equal(readPendingInvoicePayment("invoice-a", storage), newerHash);
  forgetPendingInvoicePayment("invoice-a", newerHash, storage);
  assert.equal(readPendingInvoicePayment("invoice-a", storage), null);
});

test("a submitted invoice hash is restored by a fresh session and isolated by invoice", () => {
  data.clear();
  rememberPendingInvoicePayment("invoice-a", hash.toUpperCase().replace("0X", "0x"), storage);
  assert.equal(readPendingInvoicePayment("invoice-a", { ...storage }), hash);
  assert.equal(readPendingInvoicePayment("invoice-b", storage), null);
  rememberPendingInvoicePayment("invoice-a", null, storage);
  assert.equal(readPendingInvoicePayment("invoice-a", storage), null);
});

test("malformed recovery data and unavailable storage cannot claim payment success", () => {
  data.clear();
  storage.setItem("snitch:sepolia:pending:invoice-a", JSON.stringify({ status: "Succeeded" }));
  assert.equal(readPendingInvoicePayment("invoice-a", storage), null);
  const unavailable = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(readPendingInvoicePayment("invoice-a", unavailable), null);
  assert.doesNotThrow(() => rememberPendingInvoicePayment("invoice-a", hash, unavailable));
  assert.doesNotThrow(() => rememberPendingInvoicePayment("invoice-a", null, unavailable));
});
