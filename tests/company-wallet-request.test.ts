import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { requestCompanyWallet } from "../src/components/auth/company-wallet-request";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

test("company requests never send a token that arrives after the owner leaves", async context => {
  const controller = new AbortController();
  const token = deferred<string>();
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({ companies: [] }));
  const pending = requestCompanyWallet("/api/companies", { signal: controller.signal, getAccessToken: () => token.promise });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  controller.abort();
  await rejected;
  token.resolve("late-owner-token");
  await setImmediate();
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("an old lifetime cannot continue provisioning after a new lifetime starts", async context => {
  const first = new AbortController();
  const lateResponse = deferred<Response>();
  let firstRequestSignal: AbortSignal | null | undefined;
  let calls = 0;
  context.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    calls += 1;
    if (calls === 1) {
      firstRequestSignal = options?.signal;
      return lateResponse.promise;
    }
    return Response.json({ companies: [{ id: "new-owner-company" }] });
  });
  let staleProvisioningCalls = 0;
  const pending = requestCompanyWallet("/api/companies", {
    signal: first.signal, getAccessToken: async () => "first-owner-token",
  }).then(() => { staleProvisioningCalls += 1; });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await setImmediate();
  first.abort();
  await rejected;
  assert.equal(firstRequestSignal?.aborted, true);

  const second = new AbortController();
  const current = await requestCompanyWallet("/api/companies", {
    signal: second.signal, getAccessToken: async () => "second-owner-token",
  });
  assert.deepEqual(current, { companies: [{ id: "new-owner-company" }] });
  lateResponse.resolve(Response.json({ companies: [{ id: "old-owner-company" }] }));
  await setImmediate();
  assert.equal(staleProvisioningCalls, 0);
  await assert.rejects(requestCompanyWallet("/api/companies", {
    signal: first.signal, getAccessToken: async () => "must-not-be-used",
  }), { name: "AbortError" });
  assert.equal(calls, 2);
});

test("logout while reading a company response prevents its late result", async context => {
  const controller = new AbortController();
  const body = deferred<{ company: { id: string } }>();
  const response = Response.json({});
  context.mock.method(response, "json", () => body.promise);
  context.mock.method(globalThis, "fetch", async () => response);
  const pending = requestCompanyWallet("/api/companies/company-id/wallet", {
    signal: controller.signal, getAccessToken: async () => "owner-token",
  }, { method: "POST", body: JSON.stringify({ address: "public-address" }) });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await setImmediate();
  controller.abort();
  body.resolve({ company: { id: "old-company" } });
  await rejected;
});

test("company token lookup has a deadline and does not send a late request", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new AbortController();
  const token = deferred<string>();
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({ companies: [] }));
  const pending = requestCompanyWallet("/api/companies", { signal: controller.signal, getAccessToken: () => token.promise });
  const rejected = assert.rejects(pending, /timed out/);
  context.mock.timers.tick(25000);
  await rejected;
  token.resolve("too-late-token");
  await setImmediate();
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(controller.signal.aborted, false);
});
