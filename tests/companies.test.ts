import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, mock, test } from "node:test";
import { PrivyClient } from "@privy-io/node";

import { CompanyError, CompanyStore, getCompanyStore } from "../src/lib/company-store";
import { closeInvoiceStore } from "../src/lib/invoice-store";
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
  try { assert.deepEqual(reopened.getForUser(owner, firstCompany.id), firstCompany); }
  finally { reopened.close(); }
});

test("concurrent reservations cannot create two pending companies for the same owner", async () => {
  const owner = "did:privy:concurrent-reservation";
  const responses = await Promise.all([
    listRoute.POST(request(owner, { name: "First browser", requestId: randomUUID() })),
    listRoute.POST(request(owner, { name: "Second browser", requestId: randomUUID() })),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(getCompanyStore().listForUser(owner).length, 1);
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
  assert.equal(getCompanyStore().getForUser(owner, company.id)?.wallet.address?.toLowerCase(), address(11));
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

test("database prevents reuse across companies and survives a complete connection restart", () => {
  const path = join(directory, "restart.sqlite");
  let store = new CompanyStore(path);
  const first = store.reserve("did:privy:restart", "First", randomUUID(), []).company;
  store.bindVerifiedWallet("did:privy:restart", first.id, { address: address(40), id: "wallet-40" });
  store.close();
  store = new CompanyStore(path);
  try {
    assert.equal(store.getForUser("did:privy:restart", first.id)?.wallet.address, address(40));
    const second = store.reserve("did:privy:restart", "Second", randomUUID(), []).company;
    assert.throws(() => store.bindVerifiedWallet("did:privy:restart", second.id, { address: address(40) }), (error) => error instanceof CompanyError && error.code === "WALLET_ALREADY_LINKED");
    assert.throws(() => store.bindVerifiedWallet("did:privy:wrong-owner", second.id, { address: address(41) }), (error) => error instanceof CompanyError && error.status === 404);
    assert.equal(store.getForUser("did:privy:restart", second.id)?.wallet.status, "pending");
  } finally { store.close(); }
});

test("deleting a company removes its stored records while preserving Playground accounts", () => {
  const path = join(directory, "deletion.sqlite");
  const store = new CompanyStore(path);
  try {
    const owner = "did:privy:delete-store";
    const company = store.reserve(owner, "Delete me", randomUUID(), []).company;
    const database = new DatabaseSync(path);
    database.exec(`
      CREATE TABLE invoices (id TEXT PRIMARY KEY, company_id TEXT NOT NULL);
      CREATE TABLE invoice_payments (invoice_id TEXT NOT NULL, transaction_hash TEXT PRIMARY KEY);
      CREATE TABLE company_payouts (company_id TEXT NOT NULL, owner_user_id TEXT NOT NULL);
    `);
    database.prepare("INSERT INTO invoices (id, company_id) VALUES (?, ?)").run("INV-DELETE", company.id);
    database.prepare("INSERT INTO invoice_payments (invoice_id, transaction_hash) VALUES (?, ?)").run("INV-DELETE", "0xdelete");
    database.prepare("INSERT INTO company_payouts (company_id, owner_user_id) VALUES (?, ?)").run(company.id, owner);
    database.close();

    assert.throws(() => store.deleteForUser("did:privy:someone-else", company.id), (error) =>
      error instanceof CompanyError && error.status === 404);
    assert.equal(store.deleteForUser(owner, company.id).id, company.id);
    assert.equal(store.getForUser(owner, company.id), undefined);

    const verification = new DatabaseSync(path);
    try {
      for (const table of ["invoices", "invoice_payments", "company_payouts"] as const) {
        assert.equal((verification.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count, 0);
      }
    } finally { verification.close(); }

    const playgroundOwner = "did:privy:delete-playground";
    const playground = store.reservePlayground(playgroundOwner, []).company;
    assert.throws(() => store.deleteForUser(playgroundOwner, playground.id), (error) =>
      error instanceof CompanyError && error.code === "PLAYGROUND_DELETE_FORBIDDEN");
    assert.equal(store.getForUser(playgroundOwner, playground.id)?.name, "Snitchpay.co");
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
  assert.equal(getCompanyStore().getForUser(owner, company.id), undefined);
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
    if (payload.method === "eth_chainId") return Response.json({ result: chainId });
    assert.equal(payload.method, "eth_getBalance");
    assert.deepEqual(payload.params, [address(50), "latest"]);
    return Response.json({ result: "0xde0b6b3a7640000" });
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
    assert.throws(() => getCompanyStore(), (error) => error instanceof CompanyError && error.status === 503);
    env.SNITCH_DATA_DIR = directory;
    env.VERCEL = "1";
    assert.throws(() => getCompanyStore(), (error) => error instanceof CompanyError && error.status === 503);
  } finally {
    for (const [name, value] of Object.entries({ NODE_ENV: previousMode, SNITCH_DATA_DIR: previousPath, VERCEL: previousVercel })) {
      if (value === undefined) delete env[name];
      else env[name] = value;
    }
  }
});

test("Playground reservation requires auth and derives identity, purpose, and name on the server", async () => {
  assert.equal((await playgroundRoute.POST(request(undefined, {}, "POST"))).status, 401);
  const owner = "did:privy:playground-owner";
  const response = await playgroundRoute.POST(request(owner, {
    ownerUserId: "did:privy:forged", name: "Forged", purpose: "company", address: address(60),
    wallet: { status: "ready", address: address(60) },
  }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const company = (await response.json()).company;
  assert.equal(company.ownerUserId, owner);
  assert.equal(company.name, "Snitchpay.co");
  assert.equal(company.purpose, "playground");
  assert.deepEqual(company.wallet, { status: "pending" });
  assert.match(company.id, /^[0-9a-f-]{36}$/);
  assert.notEqual(company.id, "inst_final_snitch");
  assert.equal(getCompanyStore().getPlaygroundForUser("did:privy:forged"), undefined);
  assert.equal((await (await listRoute.GET(request(owner))).json()).companies[0].purpose, "playground");
});

test("concurrent Playground reservations return one durable account per owner", async () => {
  const owner = "did:privy:playground-concurrent";
  const responses = await Promise.all(Array.from({ length: 4 }, () => playgroundRoute.POST(request(owner, undefined, "POST"))));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200, 200, 201]);
  const companies = await Promise.all(responses.map(async (response) => (await response.json()).company));
  assert.equal(new Set(companies.map((company) => company.id)).size, 1);
  assert.equal(getCompanyStore().listForUser(owner).length, 1);
  const stranger = "did:privy:playground-concurrent-other";
  const other = await playgroundRoute.POST(request(stranger, undefined, "POST"));
  assert.equal(other.status, 201);
  const otherCompany = (await other.json()).company;
  assert.notEqual(otherCompany.id, companies[0].id);
  assert.equal(getCompanyStore().getForUser(owner, otherCompany.id), undefined);
  const reopened = new CompanyStore(join(directory, "snitch.sqlite"));
  try {
    const replay = reopened.reservePlayground(owner, [address(61)]);
    assert.equal(replay.created, false);
    assert.deepEqual(replay.company, companies[0]);
  } finally { reopened.close(); }
});

test("Playground and ordinary company setup honor the same pending reservation lock", async () => {
  const normalOwner = "did:privy:normal-pending-before-playground";
  const normal = await reserve(normalOwner, "Snitchpay.co");
  assert.equal(normal.purpose, "company");
  const blocked = await playgroundRoute.POST(request(normalOwner, undefined, "POST"));
  assert.equal(blocked.status, 409);
  const conflict = await blocked.json();
  assert.equal(conflict.code, "COMPANY_SETUP_PENDING");
  assert.equal(conflict.company.id, normal.id);
  assert.equal(getCompanyStore().getPlaygroundForUser(normalOwner), undefined);
  const playgroundOwner = "did:privy:playground-pending-before-normal";
  const playground = (await (await playgroundRoute.POST(request(playgroundOwner, undefined, "POST"))).json()).company;
  const normalBlocked = await listRoute.POST(request(playgroundOwner, { name: "New company", requestId: randomUUID() }));
  assert.equal(normalBlocked.status, 409);
  assert.equal((await normalBlocked.json()).company.id, playground.id);
});

test("Playground uses a fresh Privy-verified owner wallet and preserves its baseline on retries", async () => {
  const owner = "did:privy:playground-bind";
  linkedWallets.set(owner, [wallet(70)]);
  const company = (await (await playgroundRoute.POST(request(owner, undefined, "POST"))).json()).company;
  assert.deepEqual(company.baselineWalletAddresses, [address(70)]);
  assert.equal((await walletRoute.POST(request(owner, { address: address(70) }), context(company.id))).status, 409);
  assert.equal((await walletRoute.POST(request(owner, { address: address(71) }), context(company.id))).status, 403);
  linkedWallets.set(owner, [wallet(70), wallet(71)]);
  const resumed = (await (await playgroundRoute.POST(request(owner, undefined, "POST"))).json()).company;
  assert.deepEqual(resumed.baselineWalletAddresses, [address(70)]);
  assert.equal(resumed.walletCandidateAddress.toLowerCase(), address(71));
  const response = await walletRoute.POST(request(owner, { address: address(71), privyWalletId: "forged" }), context(company.id));
  assert.equal(response.status, 200);
  const bound = (await response.json()).company;
  assert.equal(bound.wallet.status, "ready");
  assert.equal(bound.wallet.address.toLowerCase(), address(71));
  assert.equal(bound.wallet.privyWalletId, "privy-wallet-71");
  assert.equal((await walletRoute.POST(request("did:privy:playground-bind-stranger", { address: address(71) }), context(company.id))).status, 404);
  linkedWallets.set(owner, [wallet(70), wallet(71), wallet(72)]);
  assert.equal((await walletRoute.POST(request(owner, { address: address(72) }), context(company.id))).status, 409);
  const replay = await playgroundRoute.POST(request(owner, undefined, "POST"));
  assert.equal(replay.status, 200);
  assert.deepEqual((await replay.json()).company, bound);
  const reopened = new CompanyStore(join(directory, "snitch.sqlite"));
  try { assert.deepEqual(reopened.getPlaygroundForUser(owner), bound); }
  finally { reopened.close(); }
});

test("the fixed Playground name cannot be renamed, including through forged purpose metadata", async () => {
  const owner = "did:privy:playground-rename";
  const company = (await (await playgroundRoute.POST(request(owner, undefined, "POST"))).json()).company;
  const renamed = await renameRoute.PATCH(request(owner, { name: "Other", purpose: "company" }, "PATCH"), context(company.id));
  assert.equal(renamed.status, 409);
  assert.equal((await renamed.json()).code, "PLAYGROUND_NAME_FIXED");
  const unchanged = await renameRoute.PATCH(request(owner, { name: "Snitchpay.co" }, "PATCH"), context(company.id));
  assert.equal(unchanged.status, 200);
  assert.deepEqual((await unchanged.json()).company, company);
  assert.equal((await renameRoute.PATCH(request("did:privy:wrong-playground-owner", { name: "Other" }, "PATCH"), context(company.id))).status, 404);
});

test("Playground invoices use its real UUID and verified recipient, never the display ID or a client address", async () => {
  const owner = "did:privy:playground-invoice";
  const company = (await (await playgroundRoute.POST(request(owner, undefined, "POST"))).json()).company;
  const invoiceBody = {
    companyId: company.id, invoiceAmount: "0.000000000000000001", currency: "ETH", network: "Ethereum Sepolia",
    treasury: address(89), treasuryAddress: address(89), ownerId: "forged", companyName: "Forged",
  };
  assert.equal((await invoiceRoute.POST(request(owner, invoiceBody))).status, 409);
  linkedWallets.set(owner, [wallet(80)]);
  assert.equal((await walletRoute.POST(request(owner, { address: address(80) }), context(company.id))).status, 200);
  const response = await invoiceRoute.POST(request(owner, invoiceBody));
  assert.equal(response.status, 201);
  const invoice = await response.json();
  assert.equal(invoice.companyId, company.id);
  assert.equal(invoice.companyName, "Snitchpay.co");
  assert.equal(invoice.treasuryAddress.toLowerCase(), address(80));
  assert.equal(invoice.checkoutAvailable, true);
  assert.match(invoice.invoiceId, /^INV-[0-9A-F-]{36}$/);
  assert.equal((await invoiceRoute.POST(request(owner, { ...invoiceBody, companyId: "inst_final_snitch" }))).status, 404);
  assert.equal((await invoiceRoute.POST(request("did:privy:foreign-playground-invoice", invoiceBody))).status, 404);
  assert.equal((await balanceRoute.GET(request("did:privy:foreign-playground-invoice"), context(company.id))).status, 404);
});

test("legacy SQLite rows migrate as ordinary companies without changing a bound wallet", () => {
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
    const company = migrated.getForUser(owner, id)!;
    assert.equal(company.purpose, "company");
    assert.equal(company.wallet.address, address(90));
    assert.equal(company.name, "Snitchpay.co");
    assert.equal(migrated.getPlaygroundForUser(owner), undefined);
    const playground = migrated.reservePlayground(owner, [address(90)]);
    assert.equal(playground.created, true);
    assert.notEqual(playground.company.id, id);
    assert.equal(playground.company.purpose, "playground");
    assert.equal(migrated.listForUser(owner).length, 2);
    assert.throws(() => migrated.bindVerifiedWallet(owner, playground.company.id, { address: address(90) }),
      (error) => error instanceof CompanyError && error.code === "WALLET_PREDATES_COMPANY");
  } finally { migrated.close(); }
});
