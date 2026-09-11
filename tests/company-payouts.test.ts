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
  companyId = store.reserve(owner, "Snitchpay.co", randomUUID(), []).company.id;
  store.bindVerifiedWallet(owner, companyId, { address: from });
  otherCompanyId = store.reserve(stranger, "Other company", randomUUID(), []).company.id;
  store.bindVerifiedWallet(stranger, otherCompanyId, { address: other });
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
    assert.equal(reopened.listForCompany(owner, companyId).filter(item => item.transactionHash === hash(2)).length, 1);
    assert.equal(reopened.listForCompany(owner, companyId).find(item => item.id === payout.id)?.memo, "INV-024");
    assert.throws(() => reopened.listForCompany(stranger, companyId), /Company not found/);
    assert.deepEqual(reopened.listForCompany(stranger, otherCompanyId), []);
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

test("an unindexed or fabricated hash cannot create a durable blockchain payout", async t => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    return Response.json({ result: rpcResult(call.method, hash(3), { indexed: false }) });
  });
  assert.equal((await payoutsRoute.POST(request(owner, input(3)), context())).status, 409);
  const confirmation = await confirmRoute.POST(request(owner, input(3)), context());
  assert.equal(confirmation.status, 200);
  assert.equal((await confirmation.json()).status, "Incomplete");
  assert.equal(getCompanyPayoutStore().listForCompany(owner, companyId).some(item => item.transactionHash === hash(3)), false);
});

test("a forged success status and another wallet's transfer cannot be persisted", async t => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    return Response.json({ result: rpcResult(call.method, hash(4), { from: other }) });
  });
  const response = await payoutsRoute.POST(request(owner, { ...input(4), from: other, status: "Succeeded" }), context());
  assert.equal(response.status, 422);
  assert.equal(getCompanyPayoutStore().listForCompany(owner, companyId).some(item => item.transactionHash === hash(4)), false);
});

test("confirmation can recover a missed save and later metadata updates retain its reference", async t => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const call = JSON.parse(String(init?.body));
    return Response.json({ result: rpcResult(call.method, hash(5), { status: 0 }) });
  });
  assert.equal((await confirmRoute.POST(request(owner, input(5)), context())).status, 200);
  const original = getCompanyPayoutStore().listForCompany(owner, companyId).find(item => item.transactionHash === hash(5))!;
  assert.equal(original.status, "Failed");
  const saved = (await (await payoutsRoute.POST(request(owner, { ...input(5), receiverName: "Recovered recipient" }), context())).json()).payout;
  assert.equal(saved.id, original.id);
  assert.equal(saved.receiverName, "Recovered recipient");
  assert.equal(saved.status, "Failed");
  assert.equal(saved.createdAt, original.createdAt);
});

test("recorded hashes cannot be reassigned to a different owner or amount", () => {
  const store = getCompanyPayoutStore();
  const confirmation = { transactionHash: hash(2), status: "Incomplete" as const, explorerUrl: `https://sepolia.etherscan.io/tx/${hash(2)}` };
  assert.throws(() => store.saveVerified(stranger, otherCompanyId, { from: other, to, amount: "0.000000000000000001", confirmation }), /already recorded/);
  assert.throws(() => store.saveVerified(owner, companyId, { from, to, amount: "1", confirmation }), /already recorded/);
});
