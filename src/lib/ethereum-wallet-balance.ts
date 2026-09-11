import { formatEther } from "ethers";
import {
  ETHEREUM_CHAIN_ID,
  ETHEREUM_RPC_URL,
  normalizeEthereumAddress,
} from "../../services/ethereum";

/** Read a balance only after the RPC confirms the configured treasury network. */
export async function readEthereumWalletBalance({
  address,
  signal,
  rpcUrl = process.env.ETHEREUM_RPC_URL || ETHEREUM_RPC_URL,
  fetcher = fetch,
}: {
  address: string;
  signal?: AbortSignal;
  rpcUrl?: string;
  fetcher?: typeof fetch;
}): Promise<string> {
  const normalizedAddress = normalizeEthereumAddress(address);

  async function rpc(method: string, params: unknown[]): Promise<bigint> {
    const deadline = AbortSignal.timeout(8000);
    const response = await fetcher(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      cache: "no-store",
    });
    if (!response.ok) throw new Error("RPC unavailable");
    const body: unknown = await response.json();
    if (
      !body || typeof body !== "object" ||
      !("jsonrpc" in body) || body.jsonrpc !== "2.0" ||
      !("id" in body) || body.id !== 1 || "error" in body ||
      !("result" in body) || typeof body.result !== "string" ||
      !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(body.result)
    ) throw new Error("Invalid RPC response");
    return BigInt(body.result);
  }

  if (await rpc("eth_chainId", []) !== BigInt(ETHEREUM_CHAIN_ID)) {
    throw new Error("RPC network does not match Ethereum Sepolia");
  }
  return formatEther(await rpc("eth_getBalance", [normalizedAddress, "latest"]));
}
