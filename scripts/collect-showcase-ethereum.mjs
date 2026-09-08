import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatEther } from "ethers";

// Read-only: collect public transfers, never request signatures or send funds.
// JSON-RPC reference: https://ethereum.org/developers/docs/apis/json-rpc/
// Public provider: https://ethereum.publicnode.com/?sepolia
const sourceRpc = "https://ethereum-sepolia-rpc.publicnode.com";
const chainId = 11155111;
const output = fileURLToPath(new URL("../src/data/showcase-ethereum.json", import.meta.url));
const rangeStart = Date.parse("2026-09-08T00:00:00.000Z") / 1000;
const rangeEnd = Date.parse("2026-09-12T23:59:59.000Z") / 1000;
let requestId = 0;

async function rpc(method, params) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(sourceRpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      const result = await response.json();
      if (result.error) throw new Error(`${method}: ${result.error.message}`);
      return result.result;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

function hex(value) { return `0x${value.toString(16)}`; }
const blockCache = new Map();
async function blockAt(number, transactions = false) {
  const key = `${number}:${transactions}`;
  if (!blockCache.has(key)) {
    const block = await rpc("eth_getBlockByNumber", [hex(number), transactions]);
    if (!block) throw new Error(`Block ${number} not found`);
    blockCache.set(key, block);
  }
  return blockCache.get(key);
}

async function blockAtOrBefore(timestamp, finalizedNumber) {
  let low = 0;
  let high = finalizedNumber;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const block = await blockAt(middle);
    if (Number(BigInt(block.timestamp)) <= timestamp) low = middle;
    else high = middle - 1;
  }
  return low;
}

if (Number(BigInt(await rpc("eth_chainId", []))) !== chainId) {
  throw new Error("RPC did not identify as Ethereum Sepolia");
}
const finalized = await rpc("eth_getBlockByNumber", ["finalized", false]);
if (!finalized) throw new Error("RPC did not supply a finalized block");
const finalizedNumber = Number(BigInt(finalized.number));
const latestTimestamp = Math.min(rangeEnd, Number(BigInt(finalized.timestamp)));
if (latestTimestamp < rangeStart) throw new Error("Requested date range has not finalized yet");

const results = [];
const seen = new Set();
// Scan backwards from the finalized head (or the end of the selected range).
// Historical block searches can be slow on free public RPCs.
const targets = [latestTimestamp];
for (const target of targets) {
  let number = target === Number(BigInt(finalized.timestamp))
    ? finalizedNumber : await blockAtOrBefore(target, finalizedNumber);
  let collected = 0;
  for (let scanned = 0; scanned < 300 && collected < 8; scanned++, number--) {
    const block = await blockAt(number, true);
    const timestamp = Number(BigInt(block.timestamp));
    if (timestamp < rangeStart || number > finalizedNumber) break;
    for (const transaction of block.transactions) {
      if (collected === 8) break;
      if (!transaction.to || transaction.input !== "0x" || seen.has(transaction.hash)) continue;
      const value = BigInt(transaction.value);
      // Prefer readable transfers while preserving their entire exact value.
      if (value < 1_000_000_000_000_000n || value > 25_000_000_000_000_000_000n) continue;
      const [receipt, code] = await Promise.all([
        rpc("eth_getTransactionReceipt", [transaction.hash]),
        // Public nodes prune historical state. Check current recipient code and
        // require a 21,000-gas, log-free receipt to exclude contract execution.
        rpc("eth_getCode", [transaction.to, "latest"]),
      ]);
      if (code !== "0x" || !receipt || receipt.status !== "0x1"
        || BigInt(receipt.gasUsed) !== 21_000n || receipt.logs.length !== 0) continue;
      if (transaction.blockHash !== block.hash || transaction.blockNumber !== block.number
        || receipt.transactionHash !== transaction.hash || receipt.blockHash !== block.hash
        || receipt.blockNumber !== block.number || receipt.from !== transaction.from
        || receipt.to !== transaction.to) throw new Error("Inconsistent transaction/receipt/block");
      seen.add(transaction.hash);
      results.push({
        network: "Ethereum Sepolia",
        chainId,
        hash: transaction.hash,
        from: transaction.from,
        to: transaction.to,
        valueWei: value.toString(),
        amountEth: formatEther(value),
        blockNumber: number,
        blockHash: block.hash,
        blockTimestamp: new Date(timestamp * 1000).toISOString(),
        status: "success",
        verifiedAt: new Date().toISOString(),
        explorerUrl: `https://sepolia.etherscan.io/tx/${transaction.hash}`,
        sourceRpc,
      });
      collected++;
    }
  }
  if (collected !== 8) throw new Error(`Could not find eight qualifying transfers near ${new Date(target * 1000).toISOString()}`);
  console.log(`Verified ${results.length}/8 Ethereum transfers through ${new Date(target * 1000).toISOString()}`);
}

results.sort((left, right) => right.blockNumber - left.blockNumber);
if (results.length !== 8 || seen.size !== 8) throw new Error("Expected eight distinct verified transfers");
await mkdir(dirname(output), { recursive: true });
await writeFile(`${output}.tmp`, `${JSON.stringify(results, null, 2)}\n`);
await rename(`${output}.tmp`, output);
console.log(`Saved ${results.length} verified Ethereum Sepolia transfers: ${results.at(-1).blockTimestamp} to ${results[0].blockTimestamp}`);
