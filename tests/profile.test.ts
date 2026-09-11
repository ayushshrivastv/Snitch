import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import type { User } from "@privy-io/node";
import { fixtureUserId, installPrivyAuthFixture } from "./helpers/privy-auth";
import { normalizeDisplayName, profileFromPrivyUser } from "../src/lib/workspace-profile";
import { getPrivyClient } from "../src/lib/privy-server";
import { GET, PUT } from "../src/app/api/profile/route";

const profiles = new Map<string, User>();
let auth: ReturnType<typeof installPrivyAuthFixture>;
let reads = 0;
let writes = 0;
let providerFails = false;

function privyUser(id = fixtureUserId): User {
  return { id, created_at: 1, has_accepted_terms: true, is_guest: false, mfa_methods: [], linked_accounts: [{ type: "email", address: "do.not.guess@example.com", verified_at: 1, first_verified_at: 1, latest_verified_at: 1 }] };
}

before(() => {
  auth = installPrivyAuthFixture();
  const users = getPrivyClient()!.users();
  mock.method(users, "_get", async (id: string) => {
    reads += 1;
    if (providerFails) throw new Error("private provider details");
    return profiles.get(id) || privyUser(id);
  });
  mock.method(users, "setCustomMetadata", async (id: string, body: { custom_metadata: User["custom_metadata"] }) => {
    writes += 1;
    const value = { ...(profiles.get(id) || privyUser(id)), custom_metadata: body.custom_metadata };
    profiles.set(id, value);
    return value;
  });
});

after(() => { mock.restoreAll(); auth.restore(); });

function request(body?: unknown, userId = fixtureUserId, authenticated = true) {
  return new Request("http://localhost/api/profile", {
    method: body === undefined ? "GET" : "PUT",
    headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${auth.token({ userId })}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("an email-only Privy user must enter a name instead of being assigned an email-derived name", async () => {
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { userId: fixtureUserId, name: null, initials: "", email: "do.not.guess@example.com", needsName: true });
});

test("provider names are used directly and a saved display name takes precedence", () => {
  const user: User = { ...privyUser(), linked_accounts: [{ type: "google_oauth", subject: "google-user", name: "María  López", email: "maria@example.com", verified_at: 1, first_verified_at: 1, latest_verified_at: 1 }] };
  assert.deepEqual(profileFromPrivyUser(user), { userId: fixtureUserId, name: "María López", initials: "ML", email: "maria@example.com", needsName: false });
  assert.equal(profileFromPrivyUser({ ...user, custom_metadata: { display_name: "M. López" } }).name, "M. López");
});

test("names are normalized without excluding international and single-word names", () => {
  assert.equal(normalizeDisplayName("  佐藤  太郎  "), "佐藤 太郎");
  assert.equal(normalizeDisplayName("A"), "A");
  assert.equal(normalizeDisplayName("Jose\u0301"), "José");
  for (const value of [undefined, null, 12, "", "   ", "x".repeat(81), "Invisible\u200b", "Line\nBreak", "Hidden\u202e"]) assert.equal(normalizeDisplayName(value), null);
});

test("profile changes belong to the token identity, preserve metadata and persist for later reads", async () => {
  profiles.set(fixtureUserId, { ...privyUser(), custom_metadata: { onboarding_complete: true, department: "Finance" } });
  const otherId = "did:privy:other-user";
  profiles.set(otherId, { ...privyUser(otherId), custom_metadata: { display_name: "Other person" } });
  const response = await PUT(request({ displayName: "  Alex  Chen ", userId: otherId, custom_metadata: { admin: true } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).name, "Alex Chen");
  assert.deepEqual(profiles.get(fixtureUserId)?.custom_metadata, { onboarding_complete: true, department: "Finance", display_name: "Alex Chen" });
  assert.equal(profiles.get(otherId)?.custom_metadata?.display_name, "Other person");
  const saved = await GET(request());
  assert.equal((await saved.json()).needsName, false);
});

test("missing authentication cannot read or change profiles", async () => {
  const beforeReads = reads;
  const beforeWrites = writes;
  assert.equal((await GET(request(undefined, fixtureUserId, false))).status, 401);
  assert.equal((await PUT(request({ displayName: "Unauthenticated" }, fixtureUserId, false))).status, 401);
  assert.equal(reads, beforeReads);
  assert.equal(writes, beforeWrites);
});

test("invalid names and malformed JSON do not reach Privy metadata writes", async () => {
  const beforeWrites = writes;
  for (const displayName of ["", "   ", "x".repeat(81), "bad\u0000name", 42, null, {}]) {
    assert.equal((await PUT(request({ displayName }))).status, 400);
  }
  const malformed = new Request("http://localhost/api/profile", { method: "PUT", headers: { Authorization: `Bearer ${auth.token()}` }, body: "not-json" });
  assert.equal((await PUT(malformed)).status, 400);
  assert.equal(writes, beforeWrites);
});

test("provider failures return a retryable message without leaking provider details", async () => {
  providerFails = true;
  try {
    for (const response of [await GET(request()), await PUT(request({ displayName: "Alex" }))]) {
      assert.equal(response.status, 503);
      assert.doesNotMatch(await response.text(), /private provider details/);
    }
  } finally { providerFails = false; }
});

test("a provider identity mismatch is rejected", async () => {
  profiles.set(fixtureUserId, privyUser("did:privy:unexpected"));
  try { assert.equal((await GET(request())).status, 503); }
  finally { profiles.delete(fixtureUserId); }
});
