import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { requestWorkspaceProfile } from "../src/components/auth/workspace-profile-request";

const userId = "did:privy:profile-user";
const profile = { userId, name: "Alex Chen", initials: "AC", needsName: false };

test("profile submission uses a bearer token and sends only the display name", async context => {
  context.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    assert.equal(url, "/api/profile");
    assert.equal(options?.method, "PUT");
    assert.equal(new Headers(options?.headers).get("authorization"), "Bearer profile-token");
    assert.equal(options?.cache, "no-store");
    assert.deepEqual(JSON.parse(String(options?.body)), { displayName: "Alex Chen" });
    return Response.json(profile);
  });
  assert.deepEqual(await requestWorkspaceProfile({ userId, getAccessToken: async () => "profile-token", displayName: "Alex Chen" }), profile);
});

test("a stalled token lookup times out without sending the late token", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let resolveToken!: (token: string) => void;
  const token = new Promise<string>(resolve => { resolveToken = resolve; });
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json(profile));
  const pending = requestWorkspaceProfile({ userId, getAccessToken: () => token });
  const rejected = assert.rejects(pending, /timed out/);
  context.mock.timers.tick(25000);
  await rejected;
  resolveToken("late-token");
  await setImmediate();
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("an aborted profile load cancels its network request", async context => {
  const controller = new AbortController();
  let requestSignal: AbortSignal | null | undefined;
  context.mock.method(globalThis, "fetch", async (_url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    requestSignal = options?.signal;
    return new Promise<Response>(() => {});
  });
  const pending = requestWorkspaceProfile({ userId, getAccessToken: async () => "token", signal: controller.signal });
  const rejected = assert.rejects(pending);
  await setImmediate();
  controller.abort();
  await rejected;
  assert.equal(requestSignal?.aborted, true);
});

test("a profile from a different identity cannot enter the workspace", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ ...profile, userId: "did:privy:another-user" }));
  await assert.rejects(requestWorkspaceProfile({ userId, getAccessToken: async () => "token" }), /confirm your profile/);
});
