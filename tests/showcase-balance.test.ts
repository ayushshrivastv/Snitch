import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../src/app/api/showcase/balance/route";
import { SHOWCASE_COMPANY } from "../src/lib/showcase-company";

test("the public treasury balance works without sign-in or company storage", async context => {
  const previousEnvironment = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL, SNITCH_DATA_DIR: process.env.SNITCH_DATA_DIR };
  Object.assign(process.env, { NODE_ENV: "production", VERCEL: "1" });
  delete process.env.SNITCH_DATA_DIR;
  const calls: { method: string; params: unknown[] }[] = [];
  context.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push(body);
    assert.equal(new Headers(init.headers).has("Authorization"), false);
    return Response.json({ jsonrpc: "2.0", id: 1, result: body.method === "eth_chainId" ? "0xaa36a7" : "0x16345785d8a0000" });
  });
  try {
    // A caller cannot repurpose this route to inspect another account.
    const response = await GET(new Request("https://snitchpay.vercel.app/api/showcase/balance?address=0x0000000000000000000000000000000000000001"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.equal(data.address, SHOWCASE_COMPANY.walletAddress);
    assert.equal(data.balance, "0.1");
    assert.equal(data.currency, "ETH");
    assert.equal(data.chainId, 11155111);
    assert.deepEqual(calls[1].params, [SHOWCASE_COMPANY.walletAddress, "latest"]);
  } finally {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("an RPC on the wrong chain leaves the public balance unavailable", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ jsonrpc: "2.0", id: 1, result: "0x1" }));
  const response = await GET(new Request("https://snitchpay.vercel.app/api/showcase/balance"));
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.address, SHOWCASE_COMPANY.walletAddress);
  assert.equal(data.balance, null);
  assert.equal(data.error, "Balance is temporarily unavailable.");
});
