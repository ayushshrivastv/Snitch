import assert from "node:assert/strict";
import { test } from "node:test";
import { readEthereumWalletBalance } from "../src/lib/ethereum-wallet-balance";

const address = "0x52da39e9Da98F4aF044312fc4Dc5Dd5f6D1af37E";
const rpcUrl = "https://rpc.example.test";
const rpcResponse = (result: unknown) => Response.json({ jsonrpc: "2.0", id: 1, result });

test("treasury balances confirm Sepolia first and preserve wei precision", async () => {
  const calls: { method: string; params: unknown[] }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, rpcUrl);
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.method, "POST");
    assert.ok(init?.signal);
    const call = JSON.parse(String(init?.body));
    calls.push(call);
    return rpcResponse(call.method === "eth_chainId" ? "0xaa36a7" : "0x1");
  };
  assert.equal(await readEthereumWalletBalance({ address, rpcUrl, fetcher }), "0.000000000000000001");
  assert.deepEqual(calls.map(({ method, params }) => ({ method, params })), [
    { method: "eth_chainId", params: [] },
    { method: "eth_getBalance", params: [address, "latest"] },
  ]);
});

test("a mainnet RPC cannot produce an apparent Sepolia balance", async () => {
  let requests = 0;
  const fetcher: typeof fetch = async () => { requests += 1; return rpcResponse("0x1"); };
  await assert.rejects(readEthereumWalletBalance({ address, rpcUrl, fetcher }), /network does not match/);
  assert.equal(requests, 1);
});

test("RPC failures and malformed balances never turn into zero balances", async () => {
  for (const invalid of [null, "0x", "0x00", "0x-1", "1", 1, "0xGG", "0x1.2"]) {
    const fetcher: typeof fetch = async (_url, init) => {
      const { method } = JSON.parse(String(init?.body));
      return rpcResponse(method === "eth_chainId" ? "0xaa36a7" : invalid);
    };
    await assert.rejects(readEthereumWalletBalance({ address, rpcUrl, fetcher }), /Invalid RPC response/);
  }
  const errors: typeof fetch[] = [
    async () => Response.json({ error: "not available" }, { status: 503 }),
    async () => Response.json({ jsonrpc: "2.0", id: 1, result: "0xaa36a7", error: { code: -32000 } }),
    async () => Response.json({ jsonrpc: "2.0", id: 2, result: "0xaa36a7" }),
    async () => Response.json({ result: "0xaa36a7" }),
  ];
  for (const fetcher of errors) await assert.rejects(readEthereumWalletBalance({ address, rpcUrl, fetcher }));
});

test("invalid treasury addresses are rejected before accessing the RPC", async () => {
  let called = false;
  const fetcher: typeof fetch = async () => { called = true; return rpcResponse("0x0"); };
  for (const invalidAddress of ["example", "0x0000000000000000000000000000000000000000"]) {
    await assert.rejects(readEthereumWalletBalance({ address: invalidAddress, rpcUrl, fetcher }));
  }
  assert.equal(called, false);
});

test("an actual zero balance is returned as the exact ETH quantity", async () => {
  const fetcher: typeof fetch = async (_url, init) => {
    const { method } = JSON.parse(String(init?.body));
    return rpcResponse(method === "eth_chainId" ? "0xaa36a7" : "0x0");
  };
  assert.equal(await readEthereumWalletBalance({ address, rpcUrl, fetcher }), "0.0");
});
