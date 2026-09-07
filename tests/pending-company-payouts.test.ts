import assert from "node:assert/strict";
import { test } from "node:test";
import {
  forgetPendingCompanyPayout,
  readPendingCompanyPayouts,
  rememberPendingCompanyPayout,
  type PendingCompanyPayout,
  type PendingPayoutStorage,
} from "../src/lib/pending-company-payouts";

class MemoryStorage implements PendingPayoutStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function payout(overrides: Partial<PendingCompanyPayout> = {}): PendingCompanyPayout {
  return {
    companyId: "company-a",
    transactionHash: `0x${"ab".repeat(32)}`,
    from: "0x0000000000000000000000000000000000000001",
    to: "0x0000000000000000000000000000000000000002",
    amount: "0.000000000000000001",
    receiverName: "Vendor",
    memo: "June services",
    createdAt: "2026-09-11T12:34:56.000Z",
    ...overrides,
  };
}

test("pending recovery is owner scoped and preserves a single wei", () => {
  const storage = new MemoryStorage();
  assert.equal(rememberPendingCompanyPayout("did:privy:alice", payout(), storage), true);
  assert.deepEqual(readPendingCompanyPayouts("did:privy:alice", storage), [payout()]);
  assert.deepEqual(readPendingCompanyPayouts("did:privy:bob", storage), []);
  assert.equal(rememberPendingCompanyPayout("did:privy:bob", payout({ receiverName: "Bob vendor" }), storage), true);
  assert.equal(forgetPendingCompanyPayout("did:privy:alice", payout().transactionHash, storage), true);
  assert.deepEqual(readPendingCompanyPayouts("did:privy:alice", storage), []);
  assert.equal(readPendingCompanyPayouts("did:privy:bob", storage)[0].receiverName, "Bob vendor");
});

test("recovery deduplicates hashes case insensitively and forgets only the requested broadcast", () => {
  const storage = new MemoryStorage();
  const second = payout({ transactionHash: `0x${"cd".repeat(32)}` });
  rememberPendingCompanyPayout("owner", payout(), storage);
  rememberPendingCompanyPayout("owner", second, storage);
  rememberPendingCompanyPayout("owner", payout({ transactionHash: `0x${"AB".repeat(32)}`, memo: "Updated" }), storage);
  assert.deepEqual(readPendingCompanyPayouts("owner", storage).map(item => item.memo), ["Updated", "June services"]);
  forgetPendingCompanyPayout("owner", `0x${"AB".repeat(32)}`, storage);
  assert.deepEqual(readPendingCompanyPayouts("owner", storage), [second]);
});

test("malformed records and claimed successful status cannot become recoverable broadcasts", () => {
  const storage = new MemoryStorage();
  rememberPendingCompanyPayout("owner", payout(), storage);
  const key = [...storage.values.keys()][0];
  const malformed: unknown[] = [
    null, [], "invalid", {},
    payout({ amount: "0" }), payout({ amount: "-1" }), payout({ amount: "1e3" }),
    payout({ amount: "0.0000000000000000001" }),
    payout({ transactionHash: "0x1234" }),
    payout({ from: "0x0000000000000000000000000000000000000000" }),
    payout({ to: "0x52908400098527886E0F7030069857D2E4169Ee7" }),
    payout({ to: "some-company.eth" }),
    payout({ createdAt: "2026-02-30T12:00:00.000Z" }),
    payout({ createdAt: "invalid" }),
    payout({ receiverName: " " }),
    payout({ companyId: "../other-company" }),
    { ...payout(), status: "Succeeded" },
  ];
  for (const record of malformed) {
    assert.equal(rememberPendingCompanyPayout("owner", record as PendingCompanyPayout, storage), false);
  }
  storage.setItem(key, JSON.stringify([...malformed, payout()]));
  assert.deepEqual(readPendingCompanyPayouts("owner", storage), [payout()]);
  storage.setItem(key, "not json");
  assert.deepEqual(readPendingCompanyPayouts("owner", storage), []);
  storage.setItem(key, JSON.stringify({ records: [payout()] }));
  assert.deepEqual(readPendingCompanyPayouts("owner", storage), []);
});

test("only public fields survive storage and exact amounts never pass through floating point", () => {
  const storage = new MemoryStorage();
  const record = { ...payout({ amount: "9007199254740993.000000000000000001" }), accessToken: "not-to-be-stored", privateKey: "not-to-be-stored" };
  assert.equal(rememberPendingCompanyPayout("owner", record, storage), true);
  assert.equal(readPendingCompanyPayouts("owner", storage)[0].amount, record.amount);
  const raw = [...storage.values.values()][0];
  assert.equal(raw.includes("accessToken"), false);
  assert.equal(raw.includes("privateKey"), false);
});

test("blocked or unavailable browser storage never throws after a transfer was broadcast", () => {
  const denied: PendingPayoutStorage = {
    getItem() { throw new Error("Denied"); },
    setItem() { throw new Error("Denied"); },
    removeItem() { throw new Error("Denied"); },
  };
  const full: PendingPayoutStorage = {
    getItem() { return null; },
    setItem() { throw new Error("Quota exceeded"); },
    removeItem() { throw new Error("Denied"); },
  };
  for (const storage of [null, denied, full]) {
    assert.deepEqual(readPendingCompanyPayouts("owner", storage), []);
    assert.equal(rememberPendingCompanyPayout("owner", payout(), storage), false);
    assert.equal(forgetPendingCompanyPayout("owner", payout().transactionHash, storage), false);
  }
  assert.deepEqual(readPendingCompanyPayouts("owner"), []);
  assert.equal(rememberPendingCompanyPayout("owner", payout()), false);
  assert.equal(rememberPendingCompanyPayout("", payout(), new MemoryStorage()), false);
});

test("pending records and untrusted local data are bounded", () => {
  const storage = new MemoryStorage();
  for (let index = 1; index <= 105; index++) {
    rememberPendingCompanyPayout("owner", payout({ transactionHash: `0x${index.toString(16).padStart(64, "0")}` }), storage);
  }
  const records = readPendingCompanyPayouts("owner", storage);
  assert.equal(records.length, 100);
  assert.equal(records[0].transactionHash, `0x${(105).toString(16).padStart(64, "0")}`);
  const key = [...storage.values.keys()][0];
  storage.setItem(key, " ".repeat(256_001));
  assert.deepEqual(readPendingCompanyPayouts("owner", storage), []);
});
