import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, mock, test } from "node:test";
import { PrivyClient } from "@privy-io/node";

import { CompanyError, CompanyStore, getCompanyStore } from "../src/lib/company-store";
import { AsyncDatabase, DatabaseConfigurationError } from "../src/lib/database";
import { closeInvoiceStore } from "../src/lib/invoice-store";
import { SHOWCASE_COMPANY } from "../src/lib/showcase-company";
import { installPrivyAuthFixture } from "./helpers/privy-auth";

const directory = mkdtempSync(join(tmpdir(), "snitch-company-tests-"));
const previousDirectory = process.env.SNITCH_DATA_DIR;
process.env.SNITCH_DATA_DIR = directory;
let auth: ReturnType<typeof installPrivyAuthFixture>;
let listRoute: typeof import("../src/app/api/companies/route");
let renameRoute: typeof import("../src/app/api/companies/[companyId]/route");
let walletRoute: typeof import("../src/app/api/companies/[companyId]/wallet/route");
let balanceRoute: typeof import("../src/app/api/companies/[companyId]/balance/route");
let playgroundRoute: typeof import("../src/app/api/companies/playground/route");
let invoiceRoute: typeof import("../src/app/api/invoices/route");
let usersMock: ReturnType<typeof mock.method>;
const linkedWallets = new Map<string, Record<string, unknown>[]>();
const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const wallet = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `privy-wallet-${n}`, type: "wallet", chain_type: "ethereum", wallet_client_type: "privy",
  connector_type: "embedded", address: address(n), delegated: false, imported: false, user_can_sign: true,
  ...overrides,
});

before(async () => {
  auth = installPrivyAuthFixture();
  usersMock = mock.method(PrivyClient.prototype, "users", () => ({
    _get: async (userId: string) => ({ id: userId, linked_accounts: linkedWallets.get(userId) ?? [] }),
  }) as unknown as ReturnType<PrivyClient["users"]>);
  listRoute = await import("../src/app/api/companies/route");
  renameRoute = await import("../src/app/api/companies/[companyId]/route");
  walletRoute = await import("../src/app/api/companies/[companyId]/wallet/route");
  balanceRoute = await import("../src/app/api/companies/[companyId]/balance/route");
  playgroundRoute = await import("../src/app/api/companies/playground/route");
  invoiceRoute = await import("../src/app/api/invoices/route");
});

after(() => {
  usersMock.mock.restore();
  auth.restore();
  closeInvoiceStore();
  getCompanyStore().close();
  if (previousDirectory === undefined) delete process.env.SNITCH_DATA_DIR;
  else process.env.SNITCH_DATA_DIR = previousDirectory;
  rmSync(directory, { recursive: true, force: true });
});

function request(userId: string | undefined, body?: unknown, method?: string) {
  return new Request("http://localhost/api/companies", {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", ...(userId ? { Authorization: `Bearer ${auth.token({ userId })}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const context = (companyId: string) => ({ params: Promise.resolve({ companyId }) });
async function reserve(userId: string, name = "Example company") {
  const response = await listRoute.POST(request(userId, { name, requestId: randomUUID() }));
  assert.equal(response.status, 201);
  return (await response.json()).company as import("../src/lib/company-types").CompanyAccount;
}

test("company routes require verified auth and never expose another owner's company", async () => {
  assert.equal((await listRoute.GET(request(undefined))).status, 401);
  assert.equal((await listRoute.POST(request(undefined, { name: "A", requestId: randomUUID() }))).status, 401);
  const owner = "did:privy:company-owner";
  const stranger = "did:privy:company-stranger";
  const company = await reserve(owner);
  const ownList = await listRoute.GET(request(owner));
  assert.equal(ownList.headers.get("cache-control"), "no-store");
  assert.equal((await ownList.json()).companies[0].id, company.id);
  assert.deepEqual(await (await listRoute.GET(request(stranger))).json(), { companies: [] });
  assert.equal((await renameRoute.PATCH(request(stranger, { name: "Takeover" }, "PATCH"), context(company.id))).status, 404);
  assert.equal((await walletRoute.POST(request(stranger, { address: address(1) }), context(company.id))).status, 404);
  assert.equal((await balanceRoute.GET(request(stranger), context(company.id))).status, 404);
});

test("reservation is durable and idempotent, scoped by owner, and allows one pending setup", async () => {
  const owner = "did:privy:idempotency";
  const payload = { name: "Durable company", requestId: randomUUID(), ownerUserId: "forged" };
  const first = await listRoute.POST(request(owner, payload));
  const firstCompany = (await first.json()).company;
  assert.equal(firstCompany.ownerUserId, owner);
  const replay = await listRoute.POST(request(owner, payload));
  assert.equal(replay.status, 200);
  assert.deepEqual((await replay.json()).company, firstCompany);
  const conflict = await listRoute.POST(request(owner, { ...payload, requestId: randomUUID() }));
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).company.id, firstCompany.id);
  assert.equal((await listRoute.POST(request(owner, { ...payload, name: "Reused request" }))).status, 409);
  const other = await listRoute.POST(request("did:privy:other-idempotency", payload));
  assert.equal(other.status, 201);
  assert.notEqual((await other.json()).company.id, firstCompany.id);
  const reopened = new CompanyStore(join(directory, "snitch.sqlite"));
  try { assert.deepEqual((await reopened.getForUser(owner, firstCompany.id)), firstCompany); }
  finally { reopened.close(); }
});

test("concurrent reservations cannot create two pending companies for the same owner", async () => {
  const owner = "did:privy:concurrent-reservation";
  const responses = await Promise.all([
    listRoute.POST(request(owner, { name: "First browser", requestId: randomUUID() })),
    listRoute.POST(request(owner, { name: "Second browser", requestId: randomUUID() })),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal((await getCompanyStore().listForUser(owner)).length, 1);
});

test("only a new embedded wallet verified against Privy can be bound; repeat binding is safe", async () => {
  const owner = "did:privy:verified-wallet";
  linkedWallets.set(owner, [wallet(10)]);
  const company = await reserve(owner);
  assert.equal((await walletRoute.POST(request(owner, { address: address(10) }), context(company.id))).status, 409);
  assert.equal((await walletRoute.POST(request(owner, { address: address(11) }), context(company.id))).status, 403);
  linkedWallets.set(owner, [wallet(10), wallet(11)]);
  const list = await listRoute.GET(request(owner));
  assert.equal((await list.json()).companies[0].walletCandidateAddress.toLowerCase(), address(11));
  const bound = await walletRoute.POST(request(owner, { address: address(11), privyWalletId: "forged" }), context(company.id));
  assert.equal(bound.status, 200);
  const result = (await bound.json()).company;
  assert.equal(result.wallet.status, "ready");
  assert.equal(result.wallet.privyWalletId, "privy-wallet-11");
  assert.equal((await walletRoute.POST(request(owner, { address: address(11) }), context(company.id))).status, 200);
  linkedWallets.set(owner, [wallet(10), wallet(11), wallet(12)]);
  assert.equal((await walletRoute.POST(request(owner, { address: address(12) }), context(company.id))).status, 409);
  assert.equal((await renameRoute.PATCH(request(owner, { name: "Renamed company", address: address(12) }, "PATCH"), context(company.id))).status, 200);
  assert.equal((await getCompanyStore().getForUser(owner, company.id))?.wallet.address?.toLowerCase(), address(11));
});

test("external, imported, delegated, foreign and non-user-signable wallets are not candidates", async () => {
  const owner = "did:privy:ineligible-wallets";
  const company = await reserve(owner);
  linkedWallets.set(owner, [
    wallet(20, { wallet_client_type: "metamask", connector_type: "injected" }),
    wallet(21, { imported: true }), wallet(22, { delegated: true }), wallet(23, { user_can_sign: false }),
  ]);
  linkedWallets.set("did:privy:foreign-wallet-owner", [wallet(24)]);
  const list = (await (await listRoute.GET(request(owner))).json()).companies[0];
  assert.equal(list.walletCandidateAddress, undefined);
  for (const n of [20, 21, 22, 23, 24]) {
    assert.equal((await walletRoute.POST(request(owner, { address: address(n) }), context(company.id))).status, 403);
  }
});

test("multiple newly created wallets stop recovery and binding rather than guessing", async () => {
  const owner = "did:privy:ambiguous-wallet";
  const company = await reserve(owner);
  linkedWallets.set(owner, [wallet(30), wallet(31)]);
  const result = (await (await listRoute.GET(request(owner))).json()).companies[0];
  assert.equal(result.walletCandidateAddress, undefined);
  assert.match(result.walletProvisioningError, /Multiple new wallets/);
  const response = await walletRoute.POST(request(owner, { address: address(30) }), context(company.id));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "WALLET_AMBIGUOUS");
});

test("database prevents reuse across companies and survives a complete connection restart", async () => {
  const path = join(directory, "restart.sqlite");
  let store = new CompanyStore(path);
  const first = (await store.reserve("did:privy:restart", "First", randomUUID(), [])).company;
  (await store.bindVerifiedWallet("did:privy:restart", first.id, { address: address(40), id: "wallet-40" }));
  store.close();
  store = new CompanyStore(path);
  try {
    assert.equal((await store.getForUser("did:privy:restart", first.id))?.wallet.address, address(40));
    const second = (await store.reserve("did:privy:restart", "Second", randomUUID(), [])).company;
    (await assert.rejects(async () => (await store.bindVerifiedWallet("did:privy:restart", second.id, { address: address(40) })), (error) => error instanceof CompanyError && error.code === "WALLET_ALREADY_LINKED"));
    (await assert.rejects(async () => (await store.bindVerifiedWallet("did:privy:wrong-owner", second.id, { address: address(41) })), (error) => error instanceof CompanyError && error.status === 404));
    assert.equal((await store.getForUser("did:privy:restart", second.id))?.wallet.status, "pending");
  } finally { store.close(); }
});

test("deleting a company removes its stored records while preserving Playground accounts", async () => {
  const path = join(directory, "deletion.sqlite");
  const store = new CompanyStore(path);
  try {
    const owner = "did:privy:delete-store";
    const company = (await store.reserve(owner, "Delete me", randomUUID(), [])).company;
    const database = new AsyncDatabase(path);
    await database.prepare("INSERT INTO invoices (id, company_id, owner_id, created_at, payload) VALUES (?, ?, ?, ?, ?)")
      .run("INV-DELETE", company.id, owner, "2026-09-11", "{}");
    await database.prepare("INSERT INTO invoice_payments (invoice_id, transaction_hash, payload) VALUES (?, ?, ?)")
      .run("INV-DELETE", "0xdelete", "{}");
    await database.prepare(`INSERT INTO company_payouts
      (id, company_id, owner_user_id, transaction_hash, sender, recipient, amount, receiver_name, memo, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("payout-delete", company.id, owner, "0xpayout", address(80), address(81), "0.1", "Receiver", "", "Incomplete", "2026-09-11", "2026-09-11");
    database.close();

    (await assert.rejects(async () => (await store.deleteForUser("did:privy:someone-else", company.id)), (error) =>
      error instanceof CompanyError && error.status === 404));
    assert.equal((await store.deleteForUser(owner, company.id)).id, company.id);
    assert.equal((await store.getForUser(owner, company.id)), undefined);

    const verification = new AsyncDatabase(path);
    try {
      for (const table of ["invoices", "invoice_payments", "company_payouts"] as const) {
        assert.equal((await verification.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count, 0);
      }
    } finally { verification.close(); }

    const playgroundOwner = SHOWCASE_COMPANY.cfoUserId;
    const playground = (await store.restoreVerifiedShowcase(playgroundOwner, { address: SHOWCASE_COMPANY.walletAddress, id: SHOWCASE_COMPANY.privyWalletId })).company;
    (await assert.rejects(async () => (await store.deleteForUser(playgroundOwner, playground.id)), (error) =>
      error instanceof CompanyError && error.code === "PLAYGROUND_DELETE_FORBIDDEN"));
    assert.equal((await store.getForUser(playgroundOwner, playground.id))?.name, "Snitchpay.co");
  } finally { store.close(); }
});

test("company delete route requires the account owner", async () => {
  const owner = "did:privy:delete-route";
  const company = await reserve(owner, "Route deletion");
  assert.equal((await renameRoute.DELETE(request(undefined, undefined, "DELETE"), context(company.id))).status, 401);
  assert.equal((await renameRoute.DELETE(request("did:privy:delete-route-foreign", undefined, "DELETE"), context(company.id))).status, 404);
  const response = await renameRoute.DELETE(request(owner, undefined, "DELETE"), context(company.id));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deletedCompanyId, company.id);
  assert.equal((await getCompanyStore().getForUser(owner, company.id)), undefined);
});

test("balance reads the bound company address on Sepolia and reports failures without mock amounts", async () => {
  const owner = "did:privy:balance";
  const company = await reserve(owner);
  assert.equal((await balanceRoute.GET(request(owner), context(company.id))).status, 409);
  linkedWallets.set(owner, [wallet(50)]);
  assert.equal((await walletRoute.POST(request(owner, { address: address(50) }), context(company.id))).status, 200);
  let chainId = "0xaa36a7";
  const fetchMock = mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    const payload = JSON.parse(String(options.body));
    if (payload.method === "eth_chainId") return Response.json({ jsonrpc: "2.0", id: 1, result: chainId });
    assert.equal(payload.method, "eth_getBalance");
    assert.deepEqual(payload.params, [address(50), "latest"]);
    return Response.json({ jsonrpc: "2.0", id: 1, result: "0xde0b6b3a7640000" });
  });
  try {
    const good = await balanceRoute.GET(request(owner), context(company.id));
    assert.equal(good.status, 200);
    assert.equal((await good.json()).balance, "1.0");
    chainId = "0x1";
    const bad = await balanceRoute.GET(request(owner), context(company.id));
    assert.equal(bad.status, 503);
    assert.equal((await bad.json()).balance, null);
  } finally { fetchMock.mock.restore(); }
});

test("production company storage fails closed without a configured persistent directory", () => {
  const env = process.env as Record<string, string | undefined>;
  const previousMode = env.NODE_ENV;
  const previousPath = env.SNITCH_DATA_DIR;
  const previousVercel = env.VERCEL;
  try {
    env.NODE_ENV = "production";
    delete env.SNITCH_DATA_DIR;
    assert.throws(() => getCompanyStore(), (error) => error instanceof DatabaseConfigurationError && error.status === 503);
    env.SNITCH_DATA_DIR = directory;
    env.VERCEL = "1";
    assert.throws(() => getCompanyStore(), (error) => error instanceof DatabaseConfigurationError && error.status === 503);
  } finally {
    for (const [name, value] of Object.entries({ NODE_ENV: previousMode, SNITCH_DATA_DIR: previousPath, VERCEL: previousVercel })) {
      if (value === undefined) delete env[name];
      else env[name] = value;
    }
  }
});

function showcaseIdentity(overrides: Record<string, unknown> = {}) {
  return [{ type: "email", address: SHOWCASE_COMPANY.cfoEmail }, wallet(60, {
    address: SHOWCASE_COMPANY.walletAddress, id: SHOWCASE_COMPANY.privyWalletId, ...overrides,
  })];
}

test("shared treasury rejects unauthenticated users and forged CFO identity without reserving wallets", async () => {
  assert.equal((await playgroundRoute.POST(request(undefined, {}, "POST"))).status, 401);
  const stranger = "did:privy:playground-visitor";
  linkedWallets.set(stranger, showcaseIdentity());
  const response = await playgroundRoute.POST(request(stranger, {
    ownerUserId: SHOWCASE_COMPANY.cfoUserId, cfoUserId: SHOWCASE_COMPANY.cfoUserId,
    email: SHOWCASE_COMPANY.cfoEmail, name: "Snitchpay.co", address: SHOWCASE_COMPANY.walletAddress,
  }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "CFO_REQUIRED");
  assert.deepEqual((await getCompanyStore().listForUser(stranger)), []);
});

test("restore requires Privy verified email plus the exact eligible existing wallet", async () => {
  const owner = SHOWCASE_COMPANY.cfoUserId;
  for (const identity of [[], [wallet(60)], showcaseIdentity({ delegated: true }),
    showcaseIdentity({ imported: true }), showcaseIdentity({ user_can_sign: false }),
    showcaseIdentity({ connector_type: "injected" }), showcaseIdentity({ id: "wrong-wallet" }),
    showcaseIdentity({ address: address(60) }), showcaseIdentity().slice(1)]) {
    linkedWallets.set(owner, identity);
    const response = await playgroundRoute.POST(request(owner, undefined, "POST"));
    assert.equal(response.status, 403);
    assert.equal((await getCompanyStore().getForUser(owner, SHOWCASE_COMPANY.id)), undefined);
  }
});

test("company listing restores the CFO's original ready treasury into fresh durable storage", async () => {
  const owner = SHOWCASE_COMPANY.cfoUserId;
  linkedWallets.set(owner, showcaseIdentity());
  const response = await listRoute.GET(request(owner));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const company = (await response.json()).companies[0];
  assert.equal(company.id, SHOWCASE_COMPANY.id);
  assert.equal(company.ownerUserId, owner);
  assert.equal(company.cfoUserId, owner);
  assert.equal(company.purpose, "playground");
  assert.deepEqual(company.wallet, { status: "ready", address: SHOWCASE_COMPANY.walletAddress, privyWalletId: SHOWCASE_COMPANY.privyWalletId });
  assert.equal((await (await listRoute.GET(request("did:privy:other-viewer"))).json()).companies.length, 0);
  const responses = await Promise.all(Array.from({ length: 4 }, () => playgroundRoute.POST(request(owner, undefined, "POST"))));
  assert.deepEqual(responses.map(response => response.status), [200, 200, 200, 200]);
  for (const replay of responses) assert.deepEqual((await replay.json()).company, company);
  assert.equal((await getCompanyStore().listForUser(owner)).length, 1);
  const reopened = new CompanyStore(join(directory, "snitch.sqlite"));
  try { assert.deepEqual((await reopened.getPlaygroundForUser(owner)), company); }
  finally { reopened.close(); }
});

test("shared treasury restore never overwrites revoked CFO authority or wallet associations", async () => {
  const path = join(directory, "showcase-restore-conflict.sqlite");
  const store = new CompanyStore(path);
  const verified = { address: SHOWCASE_COMPANY.walletAddress, id: SHOWCASE_COMPANY.privyWalletId };
  try {
    (await assert.rejects(async () => (await store.restoreVerifiedShowcase("did:privy:another", verified)),
      (error) => error instanceof CompanyError && error.code === "CFO_REQUIRED"));
    (await assert.rejects(async () => (await store.restoreVerifiedShowcase(SHOWCASE_COMPANY.cfoUserId, { ...verified, id: "wrong" })),
      (error) => error instanceof CompanyError && error.code === "WALLET_NOT_OWNED"));
    const initial = (await store.restoreVerifiedShowcase(SHOWCASE_COMPANY.cfoUserId, verified));
    assert.equal(initial.created, true);
    const db = new AsyncDatabase(path);
    await db.prepare("UPDATE companies SET cfo_user_id = NULL WHERE id = ?").run(SHOWCASE_COMPANY.id);
    db.close();
    (await assert.rejects(async () => (await store.restoreVerifiedShowcase(SHOWCASE_COMPANY.cfoUserId, verified)),
      (error) => error instanceof CompanyError && error.code === "SHOWCASE_CONFIGURATION_CONFLICT"));
    assert.equal((await store.getForUser(SHOWCASE_COMPANY.cfoUserId, SHOWCASE_COMPANY.id))?.cfoUserId, null);
  } finally { store.close(); }
});

test("the public treasury cannot be bound to an ordinary company even before restoration", async () => {
  const store = new CompanyStore(join(directory, "showcase-reserved-address.sqlite"));
  try {
    const owner = "did:privy:wrong-company";
    const company = (await store.reserve(owner, "Another company", randomUUID(), [])).company;
    (await assert.rejects(async () => (await store.bindVerifiedWallet(owner, company.id, { address: SHOWCASE_COMPANY.walletAddress })),
      (error) => error instanceof CompanyError && error.code === "WALLET_ALREADY_LINKED"));
    (await assert.rejects(async () => (await store.bindVerifiedWallet(owner, company.id, { address: address(61), id: SHOWCASE_COMPANY.privyWalletId })),
      (error) => error instanceof CompanyError && error.code === "WALLET_ALREADY_LINKED"));
    assert.equal((await store.getForUser(owner, company.id))?.wallet.status, "pending");
  } finally { store.close(); }
});

test("shared company name and deletion protection remain independent of client metadata", async () => {
  const owner = SHOWCASE_COMPANY.cfoUserId;
  const renamed = await renameRoute.PATCH(request(owner, { name: "Other", purpose: "company" }, "PATCH"), context(SHOWCASE_COMPANY.id));
  assert.equal(renamed.status, 409);
  assert.equal((await renamed.json()).code, "PLAYGROUND_NAME_FIXED");
  assert.equal((await renameRoute.PATCH(request(owner, { name: "Snitchpay.co" }, "PATCH"), context(SHOWCASE_COMPANY.id))).status, 200);
  assert.equal((await renameRoute.DELETE(request(owner, undefined, "DELETE"), context(SHOWCASE_COMPANY.id))).status, 409);
  assert.equal((await renameRoute.PATCH(request("did:privy:visitor", { name: "Other" }, "PATCH"), context(SHOWCASE_COMPANY.id))).status, 404);
});

test("showcase invoices retain the real treasury while rejecting visitor writes and display aliases", async () => {
  const owner = SHOWCASE_COMPANY.cfoUserId;
  const invoiceBody = {
    companyId: SHOWCASE_COMPANY.id, invoiceAmount: "0.000000000000000001", currency: "ETH", network: "Ethereum Sepolia",
    treasury: address(89), treasuryAddress: address(89), ownerId: "forged", companyName: "Forged",
  };
  const response = await invoiceRoute.POST(request(owner, invoiceBody));
  assert.equal(response.status, 201);
  const invoice = await response.json();
  assert.equal(invoice.companyId, SHOWCASE_COMPANY.id);
  assert.equal(invoice.companyName, "Snitchpay.co");
  assert.equal(invoice.treasuryAddress.toLowerCase(), SHOWCASE_COMPANY.walletAddress.toLowerCase());
  assert.equal(invoice.checkoutAvailable, true);
  assert.match(invoice.invoiceId, /^INV-[0-9A-F-]{36}$/);
  assert.equal((await invoiceRoute.POST(request(owner, { ...invoiceBody, companyId: "inst_final_snitch" }))).status, 404);
  assert.equal((await invoiceRoute.POST(request("did:privy:visitor", invoiceBody))).status, 404);
  assert.equal((await balanceRoute.GET(request("did:privy:visitor"), context(SHOWCASE_COMPANY.id))).status, 404);
});

test("legacy SQLite rows migrate as ordinary companies without changing a bound wallet", async () => {
  const path = join(directory, "legacy.sqlite");
  const legacy = new DatabaseSync(path);
  const id = randomUUID();
  const owner = "did:privy:legacy-company";
  legacy.exec(`CREATE TABLE companies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_user_id TEXT NOT NULL,
    request_id TEXT NOT NULL, request_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    wallet_status TEXT NOT NULL, wallet_address TEXT COLLATE NOCASE UNIQUE, privy_wallet_id TEXT UNIQUE,
    baseline_wallet_addresses TEXT NOT NULL, UNIQUE(owner_user_id, request_id)
  )`);
  legacy.prepare("INSERT INTO companies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, "Snitchpay.co", owner, randomUUID(), "Snitchpay.co", "2026-09-10", "2026-09-10", "ready", address(90), "wallet-90", "[]");
  legacy.close();
  const migrated = new CompanyStore(path);
  try {
    const company = (await migrated.getForUser(owner, id))!;
    assert.equal(company.purpose, "company");
    assert.equal(company.wallet.address, address(90));
    assert.equal(company.name, "Snitchpay.co");
    assert.equal((await migrated.getPlaygroundForUser(owner)), undefined);
    assert.equal((await migrated.listForUser(owner)).length, 1);
    (await assert.rejects(async () => (await migrated.restoreVerifiedShowcase(owner, { address: SHOWCASE_COMPANY.walletAddress, id: SHOWCASE_COMPANY.privyWalletId })),
      (error) => error instanceof CompanyError && error.code === "CFO_REQUIRED"));
  } finally { migrated.close(); }
});
