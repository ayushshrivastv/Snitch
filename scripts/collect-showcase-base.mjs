// Read-only collection of public Base Sepolia transfers for the playground.
// No wallet, account, API key, or transaction submission is used by this script.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { formatEther } from "ethers";

const RPC = "https://sepolia.base.org";
let rpcId = 0;
async function rpc(method, params) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
      signal: AbortSignal.timeout(20_000),
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const result = await response.json();
    if (result.error) throw new Error(`${method}: ${result.error.message}`);
    return result.result;
  }
  throw new Error("RPC retries exhausted");
}

const hex = (number) => `0x${number.toString(16)}`;
const chainId = Number(await rpc("eth_chainId", []));
if (chainId !== 84532) throw new Error("Unexpected RPC chain");
const finalized = await rpc("eth_getBlockByNumber", ["finalized", false]);
if (!finalized) throw new Error("No finalized block available");
const tip = Number(finalized.number);
const tipTimestamp = Number(finalized.timestamp);

async function blockAtOrBefore(timestamp) {
  if (timestamp >= tipTimestamp) return tip;
  // Base has two-second blocks; verify the estimate rather than trusting it.
  const estimate = Math.max(0, tip - Math.ceil((tipTimestamp - timestamp) / 2));
  const estimatedBlock = await rpc("eth_getBlockByNumber", [hex(estimate), false]);
  if (estimatedBlock && Math.abs(Number(estimatedBlock.timestamp) - timestamp) <= 2) {
    return Number(estimatedBlock.timestamp) <= timestamp ? estimate : estimate - 1;
  }
  let lower = 0;
  let upper = tip;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    const block = await rpc("eth_getBlockByNumber", [hex(middle), false]);
    if (!block) throw new Error(`Missing block ${middle}`);
    if (Number(block.timestamp) <= timestamp) lower = middle;
    else upper = middle - 1;
  }
  return lower;
}

const records = [];
const seen = new Set();
const requestedAnchors = [
  ["2026-09-08T12:00:00.000Z", 3],
  ["2026-09-09T12:00:00.000Z", 3],
  ["2026-09-10T12:00:00.000Z", 3],
  ["2026-09-11T12:00:00.000Z", 1],
];

for (const [date, targetCount] of requestedAnchors) {
  const anchor = await blockAtOrBefore(Date.parse(date) / 1000);
  let collected = 0;
  for (let offset = 0; offset < 1000 && collected < targetCount; offset += 1) {
    const block = await rpc("eth_getBlockByNumber", [hex(anchor - offset), true]);
    if (!block || Number(block.number) > tip) continue;
    for (const transaction of block.transactions) {
      if (collected >= targetCount) break;
      if (
        seen.has(transaction.hash) || !transaction.to ||
        transaction.input !== "0x" || transaction.type === "0x7e" ||
        BigInt(transaction.value) <= 0n ||
        transaction.from.toLowerCase() === transaction.to.toLowerCase() ||
        transaction.to.toLowerCase() === "0x0000000000000000000000000000000000000000" ||
        transaction.blockHash !== block.hash || transaction.blockNumber !== block.number
      ) continue;
      const [receipt, recipientCode] = await Promise.all([
        rpc("eth_getTransactionReceipt", [transaction.hash]),
        rpc("eth_getCode", [transaction.to, block.number]),
      ]);
      if (
        !receipt || receipt.status !== "0x1" || recipientCode !== "0x" ||
        receipt.transactionHash !== transaction.hash || receipt.blockHash !== block.hash ||
        receipt.blockNumber !== block.number ||
        receipt.from.toLowerCase() !== transaction.from.toLowerCase() ||
        receipt.to?.toLowerCase() !== transaction.to.toLowerCase()
      ) continue;
      records.push({
        network: "Base Sepolia",
        chainId,
        hash: transaction.hash,
        from: transaction.from,
        to: transaction.to,
        valueWei: BigInt(transaction.value).toString(),
        amountEth: formatEther(BigInt(transaction.value)),
        blockNumber: Number(block.number),
        blockHash: block.hash,
        blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        status: "success",
        verifiedAt: new Date().toISOString(),
        explorerUrl: `https://sepolia.basescan.org/tx/${transaction.hash}`,
        sourceRpc: RPC,
      });
      seen.add(transaction.hash);
      collected += 1;
      console.log(`${records.length}/10 ${records.at(-1).blockTimestamp} ${records.at(-1).amountEth} ETH`);
    }
  }
  if (collected !== targetCount) throw new Error(`Insufficient transfers near ${date}`);
}

if (records.length !== 10) throw new Error("Expected exactly 10 verified transfers");
// Recheck each block is still canonical before publishing the snapshot.
for (const record of records) {
  const block = await rpc("eth_getBlockByNumber", [hex(record.blockNumber), false]);
  if (block?.hash !== record.blockHash || !block.transactions.includes(record.hash)) {
    throw new Error("Canonical block changed during collection");
  }
}
const output = new URL("../src/data/showcase-base.json", import.meta.url);
await mkdir(fileURLToPath(new URL("../src/data/", import.meta.url)), { recursive: true });
await writeFile(output, `${JSON.stringify(records, null, 2)}\n`, "utf8");
console.log(`Saved ${records.length} verified transfers to ${fileURLToPath(output)}`);
