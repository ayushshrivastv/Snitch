import { normalizeCompanyWalletAddress } from "./company-service";
import type { CompanyPaymentReader } from "./company-payment-verification";
import { ETHEREUM_RPC_URL, isEthereumTransactionHash } from "../../services/ethereum";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid RPC result");
  return value as Record<string, unknown>;
}
function hex(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) throw new Error("Invalid RPC hex value");
  return value;
}
function address(value: unknown): string { return normalizeCompanyWalletAddress(value); }
function hash(value: unknown): string {
  if (!isEthereumTransactionHash(value)) throw new Error("Invalid RPC hash");
  return value;
}

export function createCompanyPaymentReader(signal: AbortSignal): CompanyPaymentReader {
  async function rpc(method: string, params: unknown[]): Promise<unknown> {
    const response = await fetch(process.env.ETHEREUM_RPC_URL || ETHEREUM_RPC_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal, cache: "no-store",
    });
    if (!response.ok) throw new Error("RPC unavailable");
    const body = record(await response.json());
    if ("error" in body || !("result" in body)) throw new Error("RPC unavailable");
    return body.result;
  }
  return {
    getNetwork: async () => ({ chainId: BigInt(hex(await rpc("eth_chainId", []))) }),
    getTransaction: async transactionHash => {
      const value = await rpc("eth_getTransactionByHash", [transactionHash]);
      if (value === null) return null;
      const tx = record(value);
      if (typeof tx.input !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(tx.input)) throw new Error("Invalid transaction input");
      return { hash: hash(tx.hash), chainId: BigInt(hex(tx.chainId)), from: address(tx.from), to: tx.to === null ? null : address(tx.to), value: BigInt(hex(tx.value)), data: tx.input };
    },
    getTransactionReceipt: async transactionHash => {
      const value = await rpc("eth_getTransactionReceipt", [transactionHash]);
      if (value === null) return null;
      const receipt = record(value);
      return { hash: hash(receipt.transactionHash), from: address(receipt.from), to: receipt.to === null ? null : address(receipt.to), status: receipt.status === null ? null : Number(BigInt(hex(receipt.status))), blockNumber: Number(BigInt(hex(receipt.blockNumber))), blockHash: hash(receipt.blockHash) };
    },
    getBlock: async blockNumber => {
      const value = await rpc("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]);
      if (value === null) return null;
      const block = record(value);
      return { hash: hash(block.hash), timestamp: Number(BigInt(hex(block.timestamp))) };
    },
  };
}

