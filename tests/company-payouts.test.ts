import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { getCompanyStore } from "../src/lib/company-store";
import { CompanyPayoutStore, getCompanyPayoutStore } from "../src/lib/company-payout-store";
import { installPrivyAuthFixture } from "./helpers/privy-auth";

const directory = mkdtempSync(join(tmpdir(), "snitch-payout-tests-"));
const previousDirectory = process.env.SNITCH_DATA_DIR;
process.env.SNITCH_DATA_DIR = directory;
let auth: ReturnType<typeof installPrivyAuthFixture>;
let payoutsRoute: typeof import("../src/app/api/companies/[companyId]/payouts/route");
let confirmRoute: typeof import("../src/app/api/companies/[companyId]/payouts/confirm/route");
const from = "0x1111111111111111111111111111111111111111";
const to = "0x2222222222222222222222222222222222222222";
const other = "0x3333333333333333333333333333333333333333";
const blockHash = `0x${"cd".repeat(32)}`;
const owner = "did:privy:payout-owner";
const stranger = "did:privy:payout-stranger";
let companyId: string;
let otherCompanyId: string;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const input = (n: number) => ({ transactionHash: hash(n), to, amount: "0.000000000000000001", receiverName: "North studio", memo: "INV-024" });

before(async () => {
  auth = installPrivyAuthFixture();
  payoutsRoute = await import("../src/app/api/companies/[companyId]/payouts/route");
  confirmRoute = await import("../src/app/api/companies/[companyId]/payouts/confirm/route");
  const store = getCompanyStore();
  companyId = (await store.reserve(owner, "Snitchpay.co", randomUUID(), [])).company.id;
  (await store.bindVerifiedWallet(owner, companyId, { address: from }));
  otherCompanyId = (await store.reserve(stranger, "Other company", randomUUID(), [])).company.id;
  (await store.bindVerifiedWallet(stranger, otherCompanyId, { address: other }));
});
after(() => {
  getCompanyPayoutStore().close();
  getCompanyStore().close();
  auth.restore();
  if (previousDirectory === undefined) delete process.env.SNITCH_DATA_DIR;
  else process.env.SNITCH_DATA_DIR = previousDirectory;
  rmSync(directory, { recursive: true, force: true });
});
function request(userId?: string, body?: unknown) {
  return new Request("http://localhost/api/companies/id/payouts", {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(userId ? { Authorization: `Bearer ${auth.token({ userId })}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const context = (id = companyId) => ({ params: Promise.resolve({ companyId: id }) });
function rpcResult(method: string, transactionHash: string, options: { indexed?: boolean; status?: number | null; from?: string; chain?: string } = {}): unknown {
  if (method === "eth_chainId") return options.chain ?? "0xaa36a7";
  if (method === "eth_getTransactionByHash") return options.indexed === false ? null : {
    hash: transactionHash, chainId: "0xaa36a7", from: options.from ?? from, to, value: "0x1", input: "0x",
  };
  if (method === "eth_getTransactionReceipt") return options.indexed === false || options.status === null ? null : {
    transactionHash, from: options.from ?? from, to, status: options.status === 0 ? "0x0" : "0x1", blockNumber: "0x7b", blockHash,
  };
  if (method === "eth_getBlockByNumber") return { hash: blockHash, timestamp: "0x6aa65a20" };
  throw new Error(`Unexpected test RPC ${method}`);
}

test("payout list/create/confirm require verified auth and are scoped to company owner", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Should not fetch"); });
  assert.equal((await payoutsRoute.GET(request(), context())).status, 401);
  assert.equal((await payoutsRoute.POST(request(undefined, input(1)), context())).status, 401);
  assert.equal((await confirmRoute.POST(request(undefined, input(1)), context())).status, 401);
  assert.equal((await payoutsRoute.GET(request(stranger), context())).status, 404);
  assert.equal((await payoutsRoute.POST(request(stranger, input(1)), context())).status, 404);
  assert.equal((await confirmRoute.POST(request(stranger, input(1)), context())).status, 404);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("pending observed payout is durable, exact in wei, and repeated saves are idempotent", async t => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    return Response.json({ result: rpcResult(call.method, hash(2), { status: null }) });
  });
  const first = await payoutsRoute.POST(request(owner, input(2)), context());
  assert.equal(first.status, 200);
  const payout = (await first.json()).payout;
  assert.equal(payout.status, "Incomplete");
  assert.equal(payout.amount, "0.000000000000000001");
  assert.equal(payout.from, from);
  assert.equal(payout.to, to);
  const replay = (await (await payoutsRoute.POST(request(owner, input(2)), context())).json()).payout;
  assert.equal(replay.id, payout.id);
  assert.equal(replay.createdAt, payout.createdAt);
  const reopened = new CompanyPayoutStore(join(directory, "snitch.sqlite"));
  try {
    assert.equal((await reopened.listForCompany(owner, companyId)).filter(item => item.transactionHash === hash(2)).length, 1);
    assert.equal((await reopened.listForCompany(owner, companyId)).find(item => item.id === payout.id)?.memo, "INV-024");
    (await assert.rejects(async () => (await reopened.listForCompany(stranger, companyId)), /Company not found/));
    assert.deepEqual((await reopened.listForCompany(stranger, otherCompanyId)), []);
  } finally { reopened.close(); }
});

test("confirmation updates a stored payout without erasing recipient metadata", async t => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    return Response.json({ result: rpcResult(call.method, hash(2)) });
  });
  const response = await confirmRoute.POST(request(owner, input(2)), context());
  assert.equal(response.status, 200);
  const confirmation = await response.json();
  assert.equal(confirmation.status, "Succeeded");
  const list = await payoutsRoute.GET(request(owner), context());
  assert.equal(list.headers.get("cache-control"), "no-store");
  const payout = (await list.json()).payouts.find((item: { transactionHash: string }) => item.transactionHash === hash(2));
  assert.equal(payout.status, "Succeeded");
  assert.equal(payout.receiverName, "North studio");
  assert.equal(payout.memo, "INV-024");
  assert.equal(payout.blockNumber, 123);
  assert.equal(payout.confirmedAt, confirmation.confirmedAt);
});

test("an unindexed hash is stored only as a pending recovery hint, never a verified transfer", async t => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    return Response.json({ result: rpcResult(call.method, hash(3), { indexed: false }) });
  });
  const submissionResponse = await payoutsRoute.POST(request(owner, { ...input(3), status: "Succeeded" }), context());
  assert.equal(submissionResponse.status, 200);
  const submission = (await submissionResponse.json()).payout;
  assert.equal(submission.status, "Incomplete");
  assert.equal(submission.confirmedAt, undefined);
  const confirmation = await confirmRoute.POST(request(owner, input(3)), context());
  assert.equal(confirmation.status, 200);
  assert.equal((await confirmation.json()).status, "Incomplete");
  assert.equal((await getCompanyPayoutStore().listForCompany(owner, companyId)).some(item => item.transactionHash === hash(3)), false);
  assert.equal((await getCompanyPayoutStore().listSubmissionsForCompany(owner, companyId)).find(item => item.payout.transactionHash === hash(3))?.payout.id, submission.id);
});

test("a forged success status and another wallet's transfer cannot be persisted", async t => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    return Response.json({ result: rpcResult(call.method, hash(4), { from: other }) });
  });
  const response = await payoutsRoute.POST(request(owner, { ...input(4), from: other, status: "Succeeded" }), context());
  assert.equal(response.status, 422);
  assert.equal((await getCompanyPayoutStore().listForCompany(owner, companyId)).some(item => item.transactionHash === hash(4)), false);
});

test("confirmation can recover a missed save and later metadata updates retain its reference", async t => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    return Response.json({ result: rpcResult(call.method, hash(5), { status: 0 }) });
  });
  assert.equal((await confirmRoute.POST(request(owner, input(5)), context())).status, 200);
  const original = (await getCompanyPayoutStore().listForCompany(owner, companyId)).find(item => item.transactionHash === hash(5))!;
  assert.equal(original.status, "Failed");
  assert.equal(original.receiverName, "North studio");
  assert.equal(original.memo, "INV-024");
  const saved = (await (await payoutsRoute.POST(request(owner, { ...input(5), receiverName: "Recovered recipient" }), context())).json()).payout;
  assert.equal(saved.id, original.id);
  assert.equal(saved.receiverName, "Recovered recipient");
  assert.equal(saved.status, "Failed");
  assert.equal(saved.createdAt, original.createdAt);
});

test("recorded hashes cannot be reassigned to a different owner or amount", async () => {
  const store = getCompanyPayoutStore();
  const confirmation = { transactionHash: hash(2), status: "Incomplete" as const, explorerUrl: `https://sepolia.etherscan.io/tx/${hash(2)}` };
  (await assert.rejects(async () => (await store.saveVerified(stranger, otherCompanyId, { from: other, to, amount: "0.000000000000000001", confirmation })), /already recorded/));
  (await assert.rejects(async () => (await store.saveVerified(owner, companyId, { from, to, amount: "1", confirmation })), /already recorded/));
});

test("loading payouts in a new session reconciles durable pending transfers without browser hints", async t => {
  let mined = false;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    return Response.json({ result: rpcResult(call.method, hash(6), { status: mined ? 1 : null }) });
  });
  const saved = await payoutsRoute.POST(request(owner, input(6)), context());
  const pending = (await saved.json()).payout;
  assert.equal(pending.status, "Incomplete");
  mined = true;
  const freshSessionList = await payoutsRoute.GET(request(owner), context());
  const confirmed = (await freshSessionList.json()).payouts.find((item: { id: string }) => item.id === pending.id);
  assert.equal(confirmed.status, "Succeeded");
  assert.equal(confirmed.receiverName, "North studio");
  assert.equal(confirmed.amount, "0.000000000000000001");
  assert.equal(confirmed.explorerUrl, `https://sepolia.etherscan.io/tx/${hash(6)}`);
  const reopened = new CompanyPayoutStore(join(directory, "snitch.sqlite"));
  try {
    assert.deepEqual(await reopened.findForCompany(owner, companyId, hash(6)), confirmed);
  } finally { reopened.close(); }
});

test("a temporarily unavailable RPC preserves the ledger and a later visit records the mined failure", async t => {
  let unavailable = false;
  let mined = false;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    if (unavailable) throw new Error("RPC unavailable");
    const call = JSON.parse(String(init?.body));
    return Response.json({ result: rpcResult(call.method, hash(7), { status: mined ? 0 : null }) });
  });
  const saved = (await (await payoutsRoute.POST(request(owner, input(7)), context())).json()).payout;
  unavailable = true;
  const response = await payoutsRoute.GET(request(owner), context());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).payouts.find((item: { id: string }) => item.id === saved.id).status, "Incomplete");
  unavailable = false;
  mined = true;
  const refreshed = await payoutsRoute.GET(request(owner), context());
  assert.equal((await refreshed.json()).payouts.find((item: { id: string }) => item.id === saved.id).status, "Failed");
});

test("stale pending saves cannot remove a recorded mined confirmation", async () => {
  const store = getCompanyPayoutStore();
  const confirmed = await store.findForCompany(owner, companyId, hash(6));
  assert.equal(confirmed?.status, "Succeeded");
  const stale = await store.saveVerified(owner, companyId, {
    from, to, amount: input(6).amount, receiverName: "Corrected recipient",
    confirmation: { status: "Incomplete", transactionHash: hash(6), explorerUrl: `https://sepolia.etherscan.io/tx/${hash(6)}` },
  });
  assert.equal(stale.status, "Succeeded");
  assert.equal(stale.blockNumber, confirmed.blockNumber);
  assert.equal(stale.confirmedAt, confirmed.confirmedAt);
  assert.equal(stale.createdAt, confirmed.createdAt);
  assert.equal(stale.receiverName, "Corrected recipient");
});

test("retrying a completed confirmation uses persisted proof and rejects altered transfer details", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Should not fetch"); });
  const response = await confirmRoute.POST(request(owner, input(6)), context());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "Succeeded");
  for (const changed of [{ amount: "2" }, { to: other }]) {
    const invalid = await confirmRoute.POST(request(owner, { ...input(6), ...changed }), context());
    assert.equal(invalid.status, 409);
    assert.equal((await invalid.json()).code, "PAYOUT_CONFLICT");
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("initial payout and recovery reject the same malformed metadata before reading the chain", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Should not fetch"); });
  for (const changed of [{ receiverName: "a".repeat(121) }, { memo: "a".repeat(1001) }, { memo: "bad\u0000note" }, { amount: "1".repeat(101) }]) {
    for (const route of [payoutsRoute, confirmRoute]) {
      const invalid = await route.POST(request(owner, { ...input(8), ...changed }), context());
      assert.equal(invalid.status, 400);
    }
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("an unindexed broadcast survives a closed session and promotes with its original identifier and metadata", async t => {
  let indexed = false;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    return Response.json({ result: rpcResult(call.method, hash(9), { indexed }) });
  });
  const response = await payoutsRoute.POST(request(owner, input(9)), context());
  const submission = (await response.json()).payout;
  assert.equal(submission.status, "Incomplete");
  const reopened = new CompanyPayoutStore(join(directory, "snitch.sqlite"));
  try {
    assert.equal(await reopened.findForCompany(owner, companyId, hash(9)), undefined);
    assert.equal((await reopened.listSubmissionsForCompany(owner, companyId)).find(item => item.payout.id === submission.id)?.payout.memo, "INV-024");
    assert.deepEqual(await reopened.listSubmissionsForCompany(stranger, otherCompanyId), []);
    indexed = true;
    const restored = (await (await payoutsRoute.GET(request(owner), context())).json()).payouts.find((item: { id: string }) => item.id === submission.id);
    assert.equal(restored.status, "Succeeded");
    assert.equal(restored.createdAt, submission.createdAt);
    assert.equal(restored.receiverName, "North studio");
    assert.equal(restored.memo, "INV-024");
    assert.equal(restored.amount, input(9).amount);
    assert.equal((await reopened.listSubmissionsForCompany(owner, companyId)).some(item => item.payout.id === submission.id), false);
    assert.equal((await reopened.findForCompany(owner, companyId, hash(9)))?.status, "Succeeded");
  } finally { reopened.close(); }
});

test("recovery hints back off on missing transactions and discard mismatches without failing the ledger", async t => {
  let wrongSender = false;
  let rpcCalls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    rpcCalls++;
    const call = JSON.parse(String(init?.body));
    return Response.json({ result: rpcResult(call.method, hash(10), { indexed: wrongSender, from: wrongSender ? other : from }) });
  });
  const submission = (await (await payoutsRoute.POST(request(owner, input(10)), context())).json()).payout;
  const pending = await payoutsRoute.GET(request(owner), context());
  assert.equal(pending.status, 200);
  const attempt = (await getCompanyPayoutStore().listSubmissionsForCompany(owner, companyId)).find(item => item.payout.id === submission.id)!;
  assert.equal(attempt.attempts, 1);
  assert.ok(Date.parse(attempt.nextCheckAt) > Date.now());
  const beforeRetry = rpcCalls;
  assert.equal((await payoutsRoute.GET(request(owner), context())).status, 200);
  assert.equal((await confirmRoute.POST(request(owner, input(10)), context())).status, 200);
  assert.equal(rpcCalls, beforeRetry);
  wrongSender = true;
  const rejected = await payoutsRoute.POST(request(owner, input(10)), context());
  assert.equal(rejected.status, 422);
  assert.equal((await getCompanyPayoutStore().listSubmissionsForCompany(owner, companyId)).some(item => item.payout.id === submission.id), false);
  assert.equal(await getCompanyPayoutStore().findForCompany(owner, companyId, hash(10)), undefined);
  assert.equal((await payoutsRoute.GET(request(owner), context())).status, 200);
});

test("payout submission hashes cannot cross owners or change recipient or exact amount", async () => {
  const store = getCompanyPayoutStore();
  const submission = { ...input(11), from };
  await store.saveSubmission(owner, companyId, submission);
  await assert.rejects(store.saveSubmission(stranger, otherCompanyId, { ...submission, from: other }), /already recorded/);
  await assert.rejects(store.saveSubmission(owner, companyId, { ...submission, amount: "2" }), /already recorded/);
  await assert.rejects(store.saveSubmission(owner, companyId, { ...submission, to: other }), /already recorded/);
  await store.discardSubmission(owner, companyId, hash(11));
});

test("an RPC outage during initial recording retains the broadcast for the next session", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("RPC unavailable"); });
  const response = await payoutsRoute.POST(request(owner, input(12)), context());
  assert.equal(response.status, 200);
  const submission = (await response.json()).payout;
  assert.equal(submission.status, "Incomplete");
  const reopened = new CompanyPayoutStore(join(directory, "snitch.sqlite"));
  try {
    assert.equal((await reopened.findSubmissionForCompany(owner, companyId, hash(12)))?.payout.id, submission.id);
    assert.equal(await reopened.findForCompany(owner, companyId, hash(12)), undefined);
  } finally { reopened.close(); }
  await getCompanyPayoutStore().discardSubmission(owner, companyId, hash(12));
});

test("broadcast recovery is committed before slow RPC verification or client disconnect", async t => {
  let notifyRpcStarted!: () => void;
  const rpcStarted = new Promise<void>(resolve => { notifyRpcStarted = resolve; });
  let failRpc!: (reason: unknown) => void;
  const rpcResponse = new Promise<Response>((_resolve, reject) => { failRpc = reject; });
  t.mock.method(globalThis, "fetch", async () => {
    notifyRpcStarted();
    return rpcResponse;
  });
  const controller = new AbortController();
  const pendingResponse = payoutsRoute.POST(new Request(request(owner, input(13)), { signal: controller.signal }), context());
  await rpcStarted;
  const reopened = new CompanyPayoutStore(join(directory, "snitch.sqlite"));
  try {
    const durable = await reopened.findSubmissionForCompany(owner, companyId, hash(13));
    assert.equal(durable?.payout.status, "Incomplete");
    assert.equal(durable?.payout.receiverName, "North studio");
    assert.equal(durable?.payout.memo, "INV-024");
    assert.equal(await reopened.findForCompany(owner, companyId, hash(13)), undefined);
    controller.abort();
    failRpc(new DOMException("RPC request timed out", "TimeoutError"));
    const response = await pendingResponse;
    assert.equal(response.status, 200);
    const submitted = (await response.json()).payout;
    assert.equal(submitted.id, durable?.payout.id);
    assert.equal(submitted.status, "Incomplete");
    assert.equal((await reopened.findSubmissionForCompany(owner, companyId, hash(13)))?.payout.id, durable?.payout.id);
  } finally {
    failRpc(new DOMException("Test complete", "AbortError"));
    reopened.close();
    await getCompanyPayoutStore().discardSubmission(owner, companyId, hash(13));
  }
});

test("recording changed details for a mined payout fails before RPC without altering stored proof", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Should not fetch"); });
  const previous = await getCompanyPayoutStore().findForCompany(owner, companyId, hash(6));
  for (const altered of [{ to: other }, { amount: "2" }]) {
    const response = await payoutsRoute.POST(request(owner, { ...input(6), ...altered }), context());
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "PAYOUT_CONFLICT");
  }
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(await getCompanyPayoutStore().findForCompany(owner, companyId, hash(6)), previous);
});

test("pending submission capacity is bounded per company without blocking idempotent retries", async () => {
  const store = getCompanyPayoutStore();
  const existingCount = (await store.listSubmissionsForCompany(owner, companyId)).length;
  const inserted: string[] = [];
  for (let index = existingCount; index < 100; index++) {
    const payment = { ...input(200 + index), from };
    await store.saveSubmission(owner, companyId, payment);
    inserted.push(payment.transactionHash);
  }
  try {
    const original = await store.findSubmissionForCompany(owner, companyId, inserted[0]);
    const replay = await store.saveSubmission(owner, companyId, { ...input(200 + existingCount), from, receiverName: "Retry" });
    assert.equal(replay.id, original?.payout.id);
    await assert.rejects(store.saveSubmission(owner, companyId, { ...input(400), from }), /Too many payouts/);
    await store.saveSubmission(stranger, otherCompanyId, { ...input(400), from: other });
  } finally {
    for (const transactionHash of inserted) await store.discardSubmission(owner, companyId, transactionHash);
    await store.discardSubmission(stranger, otherCompanyId, hash(400));
  }
});
