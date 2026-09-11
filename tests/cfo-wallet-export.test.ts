import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { after, before, mock, test } from "node:test";
import { PrivyClient } from "@privy-io/node";
import { Wallet } from "ethers";

import { CompanyStore, getCompanyStore } from "../src/lib/company-store";
import { AsyncDatabase } from "../src/lib/database";
import type { WalletExportApproval } from "../src/lib/wallet-export-approval";
import { installPrivyAuthFixture } from "./helpers/privy-auth";

const directory = mkdtempSync(join(tmpdir(), "snitch-cfo-export-"));
const previousDirectory = process.env.SNITCH_DATA_DIR;
process.env.SNITCH_DATA_DIR = directory;
const linkedWallets = new Map<string, Record<string, unknown>[]>();
let auth: ReturnType<typeof installPrivyAuthFixture>;
let usersMock: ReturnType<typeof mock.method>;
let onReadUser: ((userId: string) => void | Promise<void>) | undefined;
let route: typeof import("../src/app/api/companies/[companyId]/wallet/export-approval/route");
let companiesRoute: typeof import("../src/app/api/companies/route");
let companyRoute: typeof import("../src/app/api/companies/[companyId]/route");

before(async () => {
  auth = installPrivyAuthFixture();
  usersMock = mock.method(PrivyClient.prototype, "users", () => ({
    _get: async (userId: string) => {
      await onReadUser?.(userId);
      return { id: userId, linked_accounts: linkedWallets.get(userId) ?? [] };
    },
  }) as unknown as ReturnType<PrivyClient["users"]>);
  route = await import("../src/app/api/companies/[companyId]/wallet/export-approval/route");
  companiesRoute = await import("../src/app/api/companies/route");
  companyRoute = await import("../src/app/api/companies/[companyId]/route");
});

after(() => {
  usersMock.mock.restore();
  auth.restore();
  getCompanyStore().close();
  if (previousDirectory === undefined) delete process.env.SNITCH_DATA_DIR;
  else process.env.SNITCH_DATA_DIR = previousDirectory;
  rmSync(directory, { recursive: true, force: true });
});

function request(userId: string | undefined, method = "POST", body?: unknown) {
  return new Request("http://localhost/api/companies/company/wallet/export-approval", {
    method,
    headers: { "Content-Type": "application/json", ...(userId ? { Authorization: `Bearer ${auth.token({ userId })}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const context = (companyId: string) => ({ params: Promise.resolve({ companyId }) });

async function updateFixture(run: (db: AsyncDatabase) => Promise<void>) {
  const db = new AsyncDatabase(join(directory, "snitch.sqlite"));
  try { await run(db); } finally { db.close(); }
}

async function companyFixture(userId = `did:privy:${randomUUID()}`) {
  const wallet = Wallet.createRandom();
  const privyWalletId = randomUUID();
  const store = getCompanyStore();
  const reserved = (await store.reserve(userId, "Company treasury", randomUUID(), [])).company;
  const company = (await store.bindVerifiedWallet(userId, reserved.id, { address: wallet.address, id: privyWalletId }));
  linkedWallets.set(userId, [...(linkedWallets.get(userId) ?? []), {
    id: privyWalletId, type: "wallet", chain_type: "ethereum", wallet_client_type: "privy", connector_type: "embedded",
    address: wallet.address, delegated: false, imported: false, user_can_sign: true,
  }]);
  return { userId, wallet, company, privyWalletId };
}

async function issue(fixture: Awaited<ReturnType<typeof companyFixture>>) {
  const response = await route.POST(request(fixture.userId), context(fixture.company.id));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return (await response.json()).approval as WalletExportApproval;
}

test("wallet export routes require verified authentication", async () => {
  const fixture = (await companyFixture());
  assert.equal((await route.POST(request(undefined), context(fixture.company.id))).status, 401);
  assert.equal((await route.PUT(request(undefined, "PUT", {}), context(fixture.company.id))).status, 401);
  const invalid = request(fixture.userId);
  invalid.headers.set("Authorization", `Bearer ${auth.token({ userId: fixture.userId, invalidSignature: true })}`);
  assert.equal((await route.POST(invalid, context(fixture.company.id))).status, 401);
});

test("CFO designation is server assigned and forged create or update role fields cannot replace it", async () => {
  const userId = `did:privy:${randomUUID()}`;
  const response = await companiesRoute.POST(request(userId, "POST", {
    name: "CFO company", requestId: randomUUID(), cfoUserId: "forged-user", role: "CFO", ownerUserId: "forged-owner",
  }));
  assert.equal(response.status, 201);
  const company = (await response.json()).company;
  assert.equal(company.cfoUserId, userId);
  assert.equal(company.ownerUserId, userId);
  const patch = await companyRoute.PATCH(request(userId, "PATCH", { name: "Renamed", cfoUserId: null, role: "Owner" }), context(company.id));
  assert.equal(patch.status, 200);
  assert.equal((await patch.json()).company.cfoUserId, userId);
});

test("legacy CFO migration runs only once and does not restore a revoked designation", async () => {
  const path = join(directory, "legacy-cfo.sqlite");
  const id = randomUUID();
  const userId = `did:privy:${randomUUID()}`;
  const db = createClient({ url: pathToFileURL(path).href });
  await db.execute(`CREATE TABLE companies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_user_id TEXT NOT NULL,
    request_id TEXT NOT NULL, request_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    wallet_status TEXT NOT NULL, wallet_address TEXT COLLATE NOCASE UNIQUE, privy_wallet_id TEXT UNIQUE,
    baseline_wallet_addresses TEXT NOT NULL, UNIQUE(owner_user_id, request_id)
  )`);
  await db.execute({ sql: "INSERT INTO companies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [id, "Legacy company", userId, randomUUID(), "Legacy company", "2026-09-11", "2026-09-11", "ready", Wallet.createRandom().address, "wallet-id", "[]"] });
  db.close();
  const migrated = new CompanyStore(path);
  assert.equal((await migrated.getForUser(userId, id))?.cfoUserId, userId);
  migrated.close();
  const revoked = new AsyncDatabase(path);
  assert.equal((await revoked.prepare("UPDATE companies SET cfo_user_id = NULL WHERE id = ?").run(id)).changes, 1);
  revoked.close();
  const reopened = new CompanyStore(path);
  try { assert.equal((await reopened.getForUser(userId, id))?.cfoUserId, null); } finally { reopened.close(); }
});

test("an owner without CFO authority cannot issue or confirm an approval", async () => {
  const fixture = (await companyFixture());
  const approval = await issue(fixture);
  const signature = await fixture.wallet.signMessage(approval.message);
  await updateFixture(async db => { assert.equal((await db.prepare("UPDATE companies SET cfo_user_id = NULL WHERE id = ?").run(fixture.company.id)).changes, 1); });
  const denied = await route.POST(request(fixture.userId, "POST", { role: "CFO", cfoUserId: fixture.userId }), context(fixture.company.id));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "CFO_REQUIRED");
  assert.equal((await route.PUT(request(fixture.userId, "PUT", { approvalId: approval.id, signature }), context(fixture.company.id))).status, 403);
});

test("the designated CFO must also control this company and its ready wallet", async () => {
  const fixture = (await companyFixture());
  const stranger = `did:privy:${randomUUID()}`;
  await updateFixture(async db => { assert.equal((await db.prepare("UPDATE companies SET cfo_user_id = ? WHERE id = ?").run(stranger, fixture.company.id)).changes, 1); });
  assert.equal((await route.POST(request(stranger), context(fixture.company.id))).status, 404);
  const pendingUser = `did:privy:${randomUUID()}`;
  const pending = (await getCompanyStore().reserve(pendingUser, "Pending company", randomUUID(), [])).company;
  assert.equal((await route.POST(request(pendingUser), context(pending.id))).status, 409);
});

test("CFO signs a unique, expiring server challenge and successful confirmation consumes it exactly once", async () => {
  const fixture = (await companyFixture());
  const first = await issue(fixture);
  const second = await issue(fixture);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.message, second.message);
  assert.equal(first.companyId, fixture.company.id);
  assert.equal(first.userId, fixture.userId);
  assert.equal(first.walletAddress, fixture.wallet.address);
  assert.match(first.message, /Snitch CFO wallet export approval/);
  assert.ok(first.message.includes(first.id) && first.message.includes(first.userId) && first.message.includes(first.expiresAt));
  assert.ok(Date.parse(first.expiresAt) - Date.now() > 4 * 60 * 1000);
  assert.ok(Date.parse(first.expiresAt) - Date.now() <= 5 * 60 * 1000);
  const signature = await fixture.wallet.signMessage(first.message);
  const confirmed = await route.PUT(request(fixture.userId, "PUT", { approvalId: first.id, signature }), context(fixture.company.id));
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.headers.get("cache-control"), "no-store");
  assert.deepEqual(await confirmed.json(), { approved: true, companyId: fixture.company.id, walletAddress: fixture.wallet.address, approvalId: first.id });
  const replay = await route.PUT(request(fixture.userId, "PUT", { approvalId: first.id, signature }), context(fixture.company.id));
  assert.equal(replay.status, 409);
  assert.equal((await replay.json()).code, "EXPORT_APPROVAL_USED");
  await updateFixture(async db => {
    const stored = (await db.prepare("SELECT * FROM wallet_export_approvals WHERE id = ?").get(first.id))!;
    assert.ok(stored.consumed_at);
    assert.ok(!JSON.stringify(stored).includes(signature));
    assert.deepEqual(Object.keys(stored).sort(), ["company_id", "consumed_at", "expires_at", "id", "message", "privy_wallet_id", "user_id", "wallet_address"]);
  });
});

test("concurrent confirmations allow only one success, including across database connections", async () => {
  const fixture = (await companyFixture());
  const approval = await issue(fixture);
  const signature = await fixture.wallet.signMessage(approval.message);
  const responses = await Promise.all(Array.from({ length: 4 }, () => route.PUT(
    request(fixture.userId, "PUT", { approvalId: approval.id, signature }), context(fixture.company.id),
  )));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409, 409, 409]);
  const reopened = new CompanyStore(join(directory, "snitch.sqlite"));
  try { (await assert.rejects(async () => (await reopened.consumeWalletExportApproval(fixture.userId, fixture.company.id, approval.id, signature)), /already been used/)); }
  finally { reopened.close(); }
});

test("wrong-wallet, changed-message and malformed signatures cannot approve export", async () => {
  const fixture = (await companyFixture());
  const approval = await issue(fixture);
  const strangerWallet = Wallet.createRandom();
  const signatures = [await strangerWallet.signMessage(approval.message), await fixture.wallet.signMessage(`${approval.message}\nchanged`)];
  for (const signature of signatures) {
    assert.equal((await route.PUT(request(fixture.userId, "PUT", { approvalId: approval.id, signature, walletAddress: strangerWallet.address }), context(fixture.company.id))).status, 403);
  }
  for (const signature of ["not-a-signature", "0x", null, "0x" + "ab".repeat(200)]) {
    assert.equal((await route.PUT(request(fixture.userId, "PUT", { approvalId: approval.id, signature }), context(fixture.company.id))).status, 400);
  }
  const valid = await fixture.wallet.signMessage(approval.message);
  assert.equal((await route.PUT(request(fixture.userId, "PUT", { approvalId: approval.id, signature: valid }), context(fixture.company.id))).status, 200);
});

test("expired approvals cannot be revived by submitting a client expiry or message", async () => {
  const fixture = (await companyFixture());
  const approval = await issue(fixture);
  const signature = await fixture.wallet.signMessage(approval.message);
  await updateFixture(async db => { assert.equal((await db.prepare("UPDATE wallet_export_approvals SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1).toISOString(), approval.id)).changes, 1); });
  const response = await route.PUT(request(fixture.userId, "PUT", {
    approvalId: approval.id, signature, expiresAt: new Date(Date.now() + 1000000).toISOString(), message: approval.message,
  }), context(fixture.company.id));
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, "EXPORT_APPROVAL_EXPIRED");
});

test("approval nonces are bound to both the authenticated user and selected company", async () => {
  const first = (await companyFixture());
  const second = (await companyFixture(first.userId));
  const foreign = (await companyFixture());
  const approval = await issue(first);
  const signature = await first.wallet.signMessage(approval.message);
  for (const destination of [second, foreign]) {
    const response = await route.PUT(request(destination.userId, "PUT", { approvalId: approval.id, signature, companyId: first.company.id, userId: first.userId }), context(destination.company.id));
    assert.equal(response.status, 404);
  }
  assert.equal((await route.POST(request(foreign.userId), context(first.company.id))).status, 404);
  assert.equal((await route.PUT(request(foreign.userId, "PUT", { approvalId: approval.id, signature }), context(first.company.id))).status, 404);
});

test("Privy ownership and embedded-wallet eligibility are rechecked before issuance and confirmation", async () => {
  const fixture = (await companyFixture());
  const approval = await issue(fixture);
  const signature = await fixture.wallet.signMessage(approval.message);
  const linked = linkedWallets.get(fixture.userId)![0];
  const invalidAccounts = [[], [{ ...linked, delegated: true }], [{ ...linked, imported: true }],
    [{ ...linked, user_can_sign: false }], [{ ...linked, connector_type: "injected" }], [{ ...linked, id: "other-privy-id" }]];
  for (const accounts of invalidAccounts) {
    linkedWallets.set(fixture.userId, accounts);
    assert.equal((await route.POST(request(fixture.userId), context(fixture.company.id))).status, 403);
    assert.equal((await route.PUT(request(fixture.userId, "PUT", { approvalId: approval.id, signature }), context(fixture.company.id))).status, 403);
  }
  linkedWallets.set(fixture.userId, [linked]);
});

test("Privy verification failure fails closed without leaking provider details", async () => {
  const fixture = (await companyFixture());
  onReadUser = () => { throw new Error("sensitive-provider-details"); };
  try {
    const response = await route.POST(request(fixture.userId), context(fixture.company.id));
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes("sensitive-provider-details"));
  } finally { onReadUser = undefined; }
});

test("CFO authority changed while Privy is being checked blocks issuance and consumption", async () => {
  const fixture = (await companyFixture());
  onReadUser = () => updateFixture(async db => { assert.equal((await db.prepare("UPDATE companies SET cfo_user_id = NULL WHERE id = ?").run(fixture.company.id)).changes, 1); });
  try { assert.equal((await route.POST(request(fixture.userId), context(fixture.company.id))).status, 403); }
  finally { onReadUser = undefined; }
  await updateFixture(async db => { assert.equal((await db.prepare("UPDATE companies SET cfo_user_id = ? WHERE id = ?").run(fixture.userId, fixture.company.id)).changes, 1); });
  const approval = await issue(fixture);
  const signature = await fixture.wallet.signMessage(approval.message);
  onReadUser = () => updateFixture(async db => { assert.equal((await db.prepare("UPDATE companies SET cfo_user_id = NULL WHERE id = ?").run(fixture.company.id)).changes, 1); });
  try { assert.equal((await route.PUT(request(fixture.userId, "PUT", { approvalId: approval.id, signature }), context(fixture.company.id))).status, 403); }
  finally { onReadUser = undefined; }
});

test("a replaced treasury wallet cannot use approval for the previous wallet", async () => {
  const fixture = (await companyFixture());
  const approval = await issue(fixture);
  const signature = await fixture.wallet.signMessage(approval.message);
  const replacement = Wallet.createRandom();
  onReadUser = () => updateFixture(async db => { assert.equal((await db.prepare("UPDATE companies SET wallet_address = ? WHERE id = ?").run(replacement.address, fixture.company.id)).changes, 1); });
  try {
    const response = await route.PUT(request(fixture.userId, "PUT", { approvalId: approval.id, signature }), context(fixture.company.id));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "EXPORT_WALLET_CHANGED");
  } finally { onReadUser = undefined; }
});
