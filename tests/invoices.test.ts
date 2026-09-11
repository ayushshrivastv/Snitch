import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { fixtureUserId, installPrivyAuthFixture } from "./helpers/privy-auth";
import { installCompanyFixture } from "./helpers/company-wallet";
import { closeInvoiceStore, getInvoiceStore, InvoiceStore } from "../src/lib/invoice-store";
import { AsyncDatabase } from "../src/lib/database";
import { getCompanyDatabasePath } from "../src/lib/company-store";
import { PaymentConfirmationConflictError } from "../src/lib/payment-confirmations";

const treasury = "0x1111111111111111111111111111111111111111";
const payer = "0x2222222222222222222222222222222222222222";
const otherRecipient = "0x3333333333333333333333333333333333333333";
const blockHash = `0x${"45".repeat(32)}`;
const blockTimestamp = 1789140000;
const amount = "0.001000000000000001";
const validBody = {
  currency: "ETH",
  network: "Ethereum Sepolia",
  invoiceAmount: amount,
  dueDate: "2028-02-29",
  customerName: "Test customer",
  invoiceTitle: "Test invoice",
};

type RpcRequest = { id: number; method: string; params?: string[] };
type RpcRecord = Record<string, unknown>;
const transactions = new Map<string, RpcRecord>();
const receipts = new Map<string, RpcRecord | null>();
const rpcMethods: string[] = [];
let rpcUnavailable = false;
let nextHash = 1;
let server: Server;
let invoiceRoute: typeof import("../src/app/api/invoices/route");
let confirmationRoute: typeof import("../src/app/api/payments/confirm/route");
let statusRoute: typeof import("../src/app/api/payments/status/route");
let listRoute: typeof import("../src/app/api/companies/[companyId]/invoices/route");
let invoiceStore: typeof import("../src/lib/invoices");
let ethereum: typeof import("../services/ethereum");
let auth: ReturnType<typeof installPrivyAuthFixture>;
let companies: Awaited<ReturnType<typeof installCompanyFixture>>;
let companyId: string;
const previousTreasury = process.env.NEXT_PUBLIC_ETHEREUM_TREASURY_ADDRESS;
const previousRpc = process.env.ETHEREUM_RPC_URL;

before(async () => {
  auth = installPrivyAuthFixture();
  // This legacy address must never receive a company invoice's payment.
  process.env.NEXT_PUBLIC_ETHEREUM_TREASURY_ADDRESS = otherRecipient;
  companies = await installCompanyFixture();
  companyId = (await companies.create(fixtureUserId, "Verified company", treasury)).id;
  server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    const requests = JSON.parse(body) as RpcRequest | RpcRequest[];
    const respond = ({ id, method, params }: RpcRequest) => {
      rpcMethods.push(method);
      if (rpcUnavailable) return { jsonrpc: "2.0", id, error: { code: -32000, message: "RPC offline" } };
      let result: unknown;
      switch (method) {
        case "eth_chainId": result = "0xaa36a7"; break;
        case "eth_getTransactionByHash": result = transactions.get(params![0].toLowerCase()) ?? null; break;
        case "eth_getTransactionReceipt": result = receipts.get(params![0].toLowerCase()) ?? null; break;
        case "eth_getBlockByNumber": result = { hash: blockHash, timestamp: `0x${blockTimestamp.toString(16)}` }; break;
        default: return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unexpected RPC method: ${method}` } };
      }
      return { jsonrpc: "2.0", id, result };
    };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(Array.isArray(requests) ? requests.map(respond) : respond(requests)));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  process.env.ETHEREUM_RPC_URL = `http://127.0.0.1:${address.port}`;

  // The treasury is read when the service loads, so import routes after setting it.
  invoiceRoute = await import("../src/app/api/invoices/route");
  confirmationRoute = await import("../src/app/api/payments/confirm/route");
  statusRoute = await import("../src/app/api/payments/status/route");
  listRoute = await import("../src/app/api/companies/[companyId]/invoices/route");
  invoiceStore = await import("../src/lib/invoices");
  ethereum = await import("../services/ethereum");
});

after(async () => {
  auth?.restore();
  (await companies?.restore());
  if (server) {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  if (previousTreasury === undefined) delete process.env.NEXT_PUBLIC_ETHEREUM_TREASURY_ADDRESS;
  else process.env.NEXT_PUBLIC_ETHEREUM_TREASURY_ADDRESS = previousTreasury;
  if (previousRpc === undefined) delete process.env.ETHEREUM_RPC_URL;
  else process.env.ETHEREUM_RPC_URL = previousRpc;
});

function post(path: string, body: unknown, userId = fixtureUserId) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(path === "/api/invoices" ? { Authorization: `Bearer ${auth.token({ userId })}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createInvoice(overrides: Record<string, unknown> = {}) {
  const response = await invoiceRoute.POST(post("/api/invoices", { ...validBody, companyId, ...overrides }));
  assert.equal(response.status, 201);
  const result = await response.json();
  const invoice = (await invoiceStore.getInvoice(result.invoiceId));
  assert.ok(invoice);
  return invoice;
}

function registerTransaction(invoiceId: string, changes: RpcRecord = {}, receiptStatus: number | null = 1) {
  const hash = `0x${(nextHash++).toString(16).padStart(64, "0")}`;
  transactions.set(hash, {
    hash,
    from: payer,
    to: treasury,
    chainId: "0xaa36a7",
    blockHash,
    blockNumber: "0x7b",
    transactionIndex: "0x0",
    type: "0x2",
    nonce: "0x0",
    gas: "0x186a0",
    gasPrice: "0x3b9aca00",
    maxFeePerGas: "0x77359400",
    maxPriorityFeePerGas: "0x3b9aca00",
    value: `0x${ethereum.parseEthAmount(amount).toString(16)}`,
    input: ethereum.getInvoicePaymentData(invoiceId),
    accessList: [],
    v: "0x0",
    r: `0x${"01".repeat(32)}`,
    s: `0x${"02".repeat(32)}`,
    ...changes,
  });
  receipts.set(hash, receiptStatus === null ? null : {
    transactionHash: hash,
    transactionIndex: "0x0",
    blockHash,
    blockNumber: "0x7b",
    from: transactions.get(hash)!.from,
    to: transactions.get(hash)!.to,
    contractAddress: null,
    cumulativeGasUsed: "0x7530",
    gasUsed: "0x7530",
    effectiveGasPrice: "0x3b9aca00",
    logs: [],
    logsBloom: `0x${"00".repeat(256)}`,
    status: `0x${receiptStatus.toString(16)}`,
    type: "0x2",
  });
  return hash;
}

async function status(invoiceId: string) {
  const response = await statusRoute.GET(new Request(`http://localhost/api/payments/status?invoiceId=${encodeURIComponent(invoiceId)}`));
  assert.equal(response.status, 200);
  return response.json();
}

test("invoice creation fixes the recipient from the verified company's wallet and preserves exact ETH amounts", async () => {
  const invoice = await createInvoice({ id: "CLIENT-ID", treasury: otherRecipient, treasuryAddress: otherRecipient, treasuryAccount: "Forged company", chainId: 1 });
  assert.match(invoice.id, /^INV-[0-9A-F-]{36}$/);
  assert.equal(invoice.treasury, treasury);
  assert.equal(invoice.chainId, 11155111);
  assert.equal(invoice.currency, "ETH");
  assert.equal(invoice.amount, amount);
  assert.equal(invoice.companyId, companyId);
  assert.equal(invoice.treasuryAccount, "Verified company");
  assert.deepEqual(await status(invoice.id), { ok: true, payment: null, status: "Incomplete", pendingPayment: null, failedPayment: null });
});

test("invoice creation requires a company and never falls back to the global treasury", async () => {
  for (const value of [undefined, null, "", "  ", 123, {}, []]) {
    const response = await invoiceRoute.POST(post("/api/invoices", { ...validBody, companyId: value, treasury: otherRecipient }));
    assert.equal(response.status, 400);
  }
  const unknown = await invoiceRoute.POST(post("/api/invoices", { ...validBody, companyId: "company-missing" }));
  assert.equal(unknown.status, 404);

  const pendingOwnerId = "did:privy:pending-owner";
  const pending = (await companies.create(pendingOwnerId, "Pending company"));
  const response = await invoiceRoute.POST(post("/api/invoices", {
    ...validBody, companyId: pending.id, treasury: treasury, wallet: { status: "ready", address: treasury },
  }, pendingOwnerId));
  assert.equal(response.status, 409);

  (await assert.rejects(async () => (await invoiceStore.createInvoice({
    amount, companyId, ownerId: fixtureUserId, customerName: "Customer", title: "Invoice", memo: "",
    dueDate: "2028-02-29", paymentTerms: "Due on receipt", treasuryAccount: "Verified company",
  })), /company treasury wallet is required/i));
});

test("a forged owner cannot create invoices for another user's company", async () => {
  const foreign = (await companies.create("did:privy:another-owner", "Other company", "0x4444444444444444444444444444444444444444"));
  const response = await invoiceRoute.POST(post("/api/invoices", {
    ...validBody, companyId: foreign.id, ownerId: foreign.ownerUserId,
    treasury: foreign.wallet.address, treasuryAccount: foreign.name,
  }));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Company account not found." });
});

test("the invoice response exposes the verified company's recipient and identity", async () => {
  const response = await invoiceRoute.POST(post("/api/invoices", { ...validBody, companyId }));
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.companyId, companyId);
  assert.equal(result.companyName, "Verified company");
  assert.equal(result.treasuryAddress, treasury);
  assert.equal(result.checkoutAvailable, true);
});

test("separate companies owned by one user keep distinct invoice recipients", async () => {
  const secondAddress = "0x5555555555555555555555555555555555555555";
  const secondCompany = (await companies.create(fixtureUserId, "Second company", secondAddress));
  const first = await createInvoice();
  const second = await createInvoice({ companyId: secondCompany.id });
  assert.equal(first.treasury, treasury);
  assert.equal(second.treasury, secondAddress);
  assert.equal(second.companyId, secondCompany.id);
  assert.equal(second.treasuryAccount, "Second company");
});

test("invoice creation rejects malformed bodies, unsupported assets/networks, invalid amounts, and date rollovers", async () => {
  const beforeRequests = rpcMethods.length;
  const cases = [
    null, [], "invalid", 17,
    { ...validBody, currency: "USD" },
    { ...validBody, network: "Ethereum Mainnet" },
    ...[0.001, "0", "-1", "1e-3", "0.0000000000000000001"].map(invoiceAmount => ({ ...validBody, invoiceAmount })),
    ...["2020-01-01", "2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "not-a-date"].map(dueDate => ({ ...validBody, dueDate })),
  ];
  for (const body of cases) {
    const response = await invoiceRoute.POST(post("/api/invoices", body));
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  const malformed = new Request("http://localhost/api/invoices", {
    method: "POST", body: "{", headers: { Authorization: `Bearer ${auth.token()}` },
  });
  assert.equal((await invoiceRoute.POST(malformed)).status, 400);
  assert.equal(rpcMethods.length, beforeRequests);
});

test("confirmation rejects malformed or unknown invoice requests without contacting the RPC", async () => {
  const beforeRequests = rpcMethods.length;
  const hash = `0x${"ab".repeat(32)}`;
  for (const body of [null, [], "invalid", {}, { invoiceId: 123, transactionHash: hash }, { invoiceId: "INV-UNKNOWN", transactionHash: "not-a-hash" }]) {
    assert.equal((await confirmationRoute.POST(post("/api/payments/confirm", body))).status, 400);
  }
  const malformed = new Request("http://localhost/api/payments/confirm", { method: "POST", body: "{" });
  assert.equal((await confirmationRoute.POST(malformed)).status, 400);
  assert.equal((await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: "INV-UNKNOWN", transactionHash: hash }))).status, 404);
  assert.equal(rpcMethods.length, beforeRequests);
});

test("successful confirmation uses the stored invoice, updates status, and prevents transaction reuse", async () => {
  const invoice = await createInvoice();
  const transactionHash = registerTransaction(invoice.id);
  const response = await confirmationRoute.POST(post("/api/payments/confirm", {
    invoiceId: invoice.id,
    transactionHash,
    amount: "999",
    treasury: otherRecipient,
    payer: otherRecipient,
    chainId: 1,
  }));
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.payment.amount, invoice.amount);
  assert.equal(result.payment.treasury, treasury);
  assert.equal(result.payment.payer, payer);
  assert.equal(result.payment.chainId, 11155111);
  assert.equal(result.payment.blockNumber, 123);
  assert.equal(result.payment.confirmedAt, new Date(blockTimestamp * 1000).toISOString());
  assert.equal(result.payment.transactionHash, transactionHash);
  assert.equal(result.payment.explorerUrl, `https://sepolia.etherscan.io/tx/${transactionHash}`);
  assert.equal((await status(invoice.id)).payment.status, "Succeeded");

  const beforeRetry = rpcMethods.length;
  const retry = await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: invoice.id, transactionHash }));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).alreadyConfirmed, true);
  const otherInvoice = await createInvoice();
  const replay = await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: otherInvoice.id, transactionHash }));
  assert.equal(replay.status, 409);
  assert.equal((await status(otherInvoice.id)).payment, null);
  assert.equal(rpcMethods.length, beforeRetry);
});

test("client-supplied fields cannot make a mismatched transaction satisfy a stored invoice", async () => {
  for (const changes of [
    { to: otherRecipient },
    { value: "0x1" },
    { input: "0x" },
    { input: ethereum.getInvoicePaymentData("INV-OTHER") },
    { chainId: "0x1" },
  ]) {
    const invoice = await createInvoice();
    const transactionHash = registerTransaction(invoice.id, changes);
    const response = await confirmationRoute.POST(post("/api/payments/confirm", {
      invoiceId: invoice.id, transactionHash,
      treasury: otherRecipient, amount: "0.000000000000000001", chainId: 1,
    }));
    const result = await response.json();
    assert.equal(response.status, 422, JSON.stringify({ changes, result }));
    assert.deepEqual(await status(invoice.id), { ok: true, payment: null, status: "Incomplete", pendingPayment: null, failedPayment: null });
  }
});

test("pending and reverted transactions remain unpaid and a later successful transaction can confirm", async () => {
  const invoice = await createInvoice();
  for (const receiptStatus of [null, 0]) {
    const transactionHash = registerTransaction(invoice.id, {}, receiptStatus);
    const response = await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: invoice.id, transactionHash }));
    const result = await response.json();
    assert.equal(response.status, receiptStatus === null ? 202 : 422, JSON.stringify(result));
    if (receiptStatus === 0) assert.equal(result.code, "transaction_reverted");
    const invoiceStatus = await status(invoice.id);
    assert.equal(invoiceStatus.payment, null);
    assert.equal(invoiceStatus.status, "Incomplete");
  }
  const transactionHash = registerTransaction(invoice.id);
  const response = await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: invoice.id, transactionHash }));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  assert.equal((await status(invoice.id)).payment.transactionHash, transactionHash);
});

test("payable invoices, confirmations, and transaction uniqueness survive a full invoice-store restart", async () => {
  const invoice = await createInvoice();
  const transactionHash = registerTransaction(invoice.id);
  assert.equal((await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: invoice.id, transactionHash }))).status, 200);
  const confirmed = (await status(invoice.id)).payment;
  closeInvoiceStore();
  assert.deepEqual((await invoiceStore.getInvoice(invoice.id)), invoice);
  assert.deepEqual((await invoiceStore.getInvoiceForOwner(invoice.id, fixtureUserId)), invoice);
  assert.equal((await invoiceStore.getInvoiceForOwner(invoice.id, "did:privy:foreign-after-restart")), undefined);
  assert.deepEqual((await status(invoice.id)).payment, confirmed);
  const methodsBefore = rpcMethods.length;
  const retry = await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: invoice.id, transactionHash }));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).alreadyConfirmed, true);
  assert.equal(rpcMethods.length, methodsBefore);

  const anotherInvoice = await createInvoice();
  const secondConnection = new InvoiceStore(getCompanyDatabasePath());
  try {
    assert.deepEqual((await secondConnection.getInvoice(invoice.id)), invoice);
    assert.deepEqual((await secondConnection.savePayment(confirmed)), confirmed);
    (await assert.rejects(async () => (await secondConnection.savePayment({ ...confirmed, invoiceId: anotherInvoice.id })), PaymentConfirmationConflictError));
    (await assert.rejects(async () => (await secondConnection.savePayment({ ...confirmed, transactionHash: `0x${"ef".repeat(32)}` })), PaymentConfirmationConflictError));
  } finally { secondConnection.close(); }
});

test("company invoice hydration requires the verified owner and restores exact record and payment fields", async () => {
  const owner = "did:privy:invoice-hydration";
  const hydratedTreasury = "0x6666666666666666666666666666666666666666";
  const account = (await companies.create(owner, "Hydrated company", hydratedTreasury));
  const body = { ...validBody, companyId: account.id };
  const result = await invoiceRoute.POST(post("/api/invoices", body, owner));
  const { invoiceId } = await result.json();
  const invoice = (await invoiceStore.getInvoice(invoiceId))!;
  const transactionHash = registerTransaction(invoiceId, { to: hydratedTreasury });
  assert.equal((await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId, transactionHash }))).status, 200);
  closeInvoiceStore();
  const context = { params: Promise.resolve({ companyId: account.id }) };
  const listRequest = (userId?: string) => new Request(`http://localhost/api/companies/${account.id}/invoices`, {
    headers: userId ? { Authorization: `Bearer ${auth.token({ userId })}` } : {},
  });
  assert.equal((await listRoute.GET(listRequest(), context)).status, 401);
  assert.equal((await listRoute.GET(listRequest(fixtureUserId), context)).status, 404);
  const owned = await listRoute.GET(listRequest(owner), context);
  assert.equal(owned.status, 200);
  assert.equal(owned.headers.get("cache-control"), "no-store");
  const records = (await owned.json()).invoices;
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], { ...invoice, status: "Succeeded", payment: (await status(invoiceId)).payment });
  assert.equal(records[0].amount, amount);
  assert.equal(records[0].treasury, hydratedTreasury);
  assert.equal(records[0].companyId, account.id);
  const unrelated = (await companies.create(owner, "Other company", otherRecipient));
  const empty = await listRoute.GET(listRequest(owner), { params: Promise.resolve({ companyId: unrelated.id }) });
  assert.deepEqual(await empty.json(), { invoices: [], deletedRecordIds: [] });
});

test("a pending broadcast survives browser logout and store restart, then public status persists its mined receipt", async () => {
  const invoice = await createInvoice();
  const transactionHash = registerTransaction(invoice.id);
  const minedReceipt = receipts.get(transactionHash)!;
  receipts.set(transactionHash, null);
  const submitted = await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: invoice.id, transactionHash }));
  assert.equal(submitted.status, 202);
  assert.equal((await submitted.json()).code, "transaction_pending");
  closeInvoiceStore();
  const pending = await status(invoice.id);
  assert.equal(pending.payment, null);
  assert.equal(pending.pendingPayment.transactionHash, transactionHash);
  receipts.set(transactionHash, minedReceipt);
  const confirmed = await status(invoice.id);
  assert.equal(confirmed.payment.transactionHash, transactionHash);
  assert.equal(confirmed.pendingPayment, null);
  closeInvoiceStore();
  assert.deepEqual((await status(invoice.id)).payment, confirmed.payment);
});

test("transaction-page batch status and authenticated history finish pending payments without the payer returning", async () => {
  for (const via of ["batch", "history"]) {
    const invoice = await createInvoice();
    const transactionHash = registerTransaction(invoice.id);
    const minedReceipt = receipts.get(transactionHash)!;
    receipts.set(transactionHash, null);
    assert.equal((await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: invoice.id, transactionHash }))).status, 202);
    receipts.set(transactionHash, minedReceipt);
    closeInvoiceStore();
    if (via === "batch") {
      const response = await statusRoute.GET(new Request(`http://localhost/api/payments/status?invoiceIds=${invoice.id}`));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.statuses[invoice.id].status, "Succeeded");
      assert.equal(result.statuses[invoice.id].transactionHash, transactionHash);
    } else {
      const response = await listRoute.GET(new Request(`http://localhost/api/companies/${companyId}/invoices`, {
        headers: { Authorization: `Bearer ${auth.token()}` },
      }), { params: Promise.resolve({ companyId }) });
      const result = await response.json();
      const record = result.invoices.find((entry: { id: string }) => entry.id === invoice.id);
      assert.equal(record.status, "Succeeded");
      assert.equal(record.payment.transactionHash, transactionHash);
    }
  }
});

test("RPC outages preserve submitted payment progress without reporting success", async () => {
  const invoice = await createInvoice();
  const transactionHash = registerTransaction(invoice.id, {}, null);
  assert.equal((await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: invoice.id, transactionHash }))).status, 202);
  rpcUnavailable = true;
  try {
    const pending = await status(invoice.id);
    assert.equal(pending.payment, null);
    assert.equal(pending.pendingPayment.transactionHash, transactionHash);
  } finally { rpcUnavailable = false; }
});

test("success is withheld until storage commits and the saved broadcast recovers after a failed write", async () => {
  const invoice = await createInvoice();
  const transactionHash = registerTransaction(invoice.id);
  const store = getInvoiceStore();
  const originalSave = store.savePayment;
  store.savePayment = async () => { throw new Error("Unavailable storage"); };
  try {
    const response = await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: invoice.id, transactionHash }));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /do not send another payment/);
    assert.equal(await store.getPayment(invoice.id), undefined);
    assert.equal((await store.getPaymentAttempts(invoice.id))[0].transactionHash, transactionHash);
  } finally { store.savePayment = originalSave; }
  closeInvoiceStore();
  assert.equal((await status(invoice.id)).payment.transactionHash, transactionHash);
});

test("concurrent confirmation retries store one receipt and remain idempotent", async () => {
  const invoice = await createInvoice();
  const transactionHash = registerTransaction(invoice.id);
  const responses = await Promise.all(Array.from({ length: 4 }, () => confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: invoice.id, transactionHash }))));
  const records = await Promise.all(responses.map(async response => { assert.equal(response.status, 200); return (await response.json()).payment; }));
  assert.ok(records.every(record => JSON.stringify(record) === JSON.stringify(records[0])));
  assert.equal((await getInvoiceStore().getPaymentAttempts(invoice.id)).length, 1);
});

test("unindexed hashes survive a store restart as bounded hints without locking checkout", async () => {
  const invoice = await createInvoice();
  const transactionHash = registerTransaction(invoice.id);
  const transaction = transactions.get(transactionHash)!;
  transactions.delete(transactionHash);
  const response = await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: invoice.id, transactionHash }));
  assert.equal(response.status, 202);
  assert.equal((await response.json()).code, "transaction_not_indexed");
  closeInvoiceStore();
  const unknown = await status(invoice.id);
  assert.equal(unknown.pendingPayment, null);
  assert.equal(unknown.payment, null);
  transactions.set(transactionHash, transaction);
  const database = new AsyncDatabase(getCompanyDatabasePath());
  try {
    // Advance the stored retry schedule instead of waiting on wall-clock time.
    await database.prepare("UPDATE invoice_payment_submissions SET next_check_at = ? WHERE invoice_id = ?").run("2000-01-01T00:00:00.000Z", invoice.id);
  } finally { database.close(); }
  const confirmed = await status(invoice.id);
  assert.equal(confirmed.payment.transactionHash, transactionHash);
  assert.equal(confirmed.pendingPayment, null);
});

test("anonymous submission hints cannot reserve a hash against its real invoice or prevent valid confirmation", async () => {
  const invoice = await createInvoice();
  const unrelated = await createInvoice();
  const transactionHash = registerTransaction(invoice.id);
  const store = getInvoiceStore();
  await store.savePaymentSubmission(unrelated.id, transactionHash);
  for (let index = 0; index < 40; index++) await store.savePaymentSubmission(invoice.id, `0x${(1000 + index).toString(16).padStart(64, "0")}`);
  const database = new AsyncDatabase(getCompanyDatabasePath());
  try {
    const row = await database.prepare("SELECT COUNT(*) AS total FROM invoice_payment_submissions WHERE invoice_id = ?").get(invoice.id);
    assert.equal(row?.total, 32);
    assert.equal((await store.getDuePaymentSubmissions(invoice.id)).length, 4);
  } finally { database.close(); }
  const response = await confirmationRoute.POST(post("/api/payments/confirm", { invoiceId: invoice.id, transactionHash }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).payment.transactionHash, transactionHash);
  assert.equal((await status(unrelated.id)).payment, null);
  assert.equal((await store.getDuePaymentSubmissions(unrelated.id)).length, 0);
});
