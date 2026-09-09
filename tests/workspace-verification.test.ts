import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { startWorkspaceVerification, type WorkspaceVerification } from "../src/components/auth/workspace-verification";

const userId = "did:privy:test-user";
const timeoutResult = { userId, verified: false, error: "The connection timed out. Please try again." };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

test("the deadline ends a hanging token lookup and never sends its late token", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const token = deferred<string>();
  const results: WorkspaceVerification[] = [];
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({ userId }));
  const cancel = startWorkspaceVerification({ userId, getAccessToken: () => token.promise, onResult: result => results.push(result) });

  context.mock.timers.tick(29999);
  assert.deepEqual(results, []);
  context.mock.timers.tick(1);
  assert.deepEqual(results, [timeoutResult]);

  token.resolve("test-token");
  await setImmediate();
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(results, [timeoutResult]);
  cancel();
});

test("cleanup before token retrieval completes prevents both requests and timeout updates", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const token = deferred<string>();
  const results: WorkspaceVerification[] = [];
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({ userId }));
  const cancel = startWorkspaceVerification({ userId, getAccessToken: () => token.promise, onResult: result => results.push(result) });
  cancel();
  context.mock.timers.tick(30000);
  token.resolve("test-token");
  await setImmediate();

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(results, []);
});

test("a timed-out request is aborted and its late response cannot overwrite a manual retry", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const firstResponse = deferred<Response>();
  const results: WorkspaceVerification[] = [];
  let firstSignal: AbortSignal | null | undefined;
  let requestCount = 0;
  context.mock.method(globalThis, "fetch", async (_url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    requestCount += 1;
    if (requestCount === 1) {
      firstSignal = options?.signal;
      return firstResponse.promise;
    }
    return Response.json({ userId });
  });
  const options = { userId, getAccessToken: async () => "test-token", onResult: (result: WorkspaceVerification) => results.push(result) };
  const cancelFirst = startWorkspaceVerification(options);
  await setImmediate();
  context.mock.timers.tick(30000);
  assert.equal(firstSignal?.aborted, true);
  assert.deepEqual(results, [timeoutResult]);

  cancelFirst();
  const cancelRetry = startWorkspaceVerification(options);
  await setImmediate();
  assert.deepEqual(results, [timeoutResult, { userId, verified: true }]);
  firstResponse.resolve(Response.json({ userId: "did:privy:wrong-user" }));
  await setImmediate();
  context.mock.timers.tick(30000);
  assert.deepEqual(results, [timeoutResult, { userId, verified: true }]);
  assert.equal(requestCount, 2);
  cancelRetry();
});

test("cleanup while reading the response prevents a late verification result", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const payload = deferred<{ userId: string }>();
  const response = Response.json({});
  context.mock.method(response, "json", () => payload.promise);
  context.mock.method(globalThis, "fetch", async () => response);
  const results: WorkspaceVerification[] = [];
  const cancel = startWorkspaceVerification({ userId, getAccessToken: async () => "test-token", onResult: result => results.push(result) });
  await setImmediate();
  cancel();
  payload.resolve({ userId });
  await setImmediate();
  context.mock.timers.tick(30000);
  assert.deepEqual(results, []);
});

test("a 401 remains a sign-in failure without automatic retry", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const fetchMock = context.mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  const results: WorkspaceVerification[] = [];
  const cancel = startWorkspaceVerification({ userId, getAccessToken: async () => "test-token", onResult: result => results.push(result) });
  await setImmediate();
  context.mock.timers.tick(60000);
  assert.deepEqual(results, [{ userId, verified: false, error: "Your session has expired. Please sign in again." }]);
  assert.equal(fetchMock.mock.callCount(), 1);
  cancel();
});

test("a successful response for a different identity cannot open the workspace", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ userId: "did:privy:another-user" }));
  const results: WorkspaceVerification[] = [];
  const cancel = startWorkspaceVerification({ userId, getAccessToken: async () => "test-token", onResult: result => results.push(result) });
  await setImmediate();
  assert.deepEqual(results, [{ userId, verified: false, error: "Please sign in again to continue." }]);
  cancel();
});
