import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isAddress, parseEther, ZeroAddress } from "ethers";
import ts from "typescript";
import { ETHEREUM_NETWORK_NAME } from "../services/ethereum";
import {
  blockchainAddressUrl,
  formatBlockchainDate,
  getShowcaseTransfer,
  showcaseTransfers,
  type ShowcaseTransfer,
} from "../src/lib/showcase-blockchain";

type SeedRecord = {
  id: string;
  status: string;
  network: ShowcaseTransfer["network"];
};

// Read the actual showcase seeds without importing the React page or its auth SDK.
// The syntax tree makes these assertions independent of whitespace and formatting.
function readSeedRecords(name: "transactions" | "payments"): SeedRecord[] {
  const source = ts.createSourceFile(
    "home-client.tsx",
    readFileSync(new URL("../src/app/home-client.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(candidate => ts.isIdentifier(candidate.name) && candidate.name.text === name);
  assert.ok(declaration?.initializer && ts.isArrayLiteralExpression(declaration.initializer), `${name} must retain its showcase seed array`);

  return declaration.initializer.elements.map(element => {
    assert.ok(ts.isObjectLiteralExpression(element), `${name} contains a non-object seed`);
    const fields = new Map<string, ts.Expression>();
    for (const property of element.properties) {
      if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
        fields.set(property.name.text, property.initializer);
      }
    }
    const stringField = (field: string) => {
      const value = fields.get(field);
      assert.ok(value && ts.isStringLiteral(value), `${name}.${field} must be a string literal`);
      return value.text;
    };
    const network = fields.has("network") ? stringField("network") : ETHEREUM_NETWORK_NAME;
    assert.ok(network === "Ethereum Sepolia" || network === "Base Sepolia", `Unsupported showcase network: ${network}`);
    return { id: stringField("id"), status: stringField("status"), network };
  });
}

test("all 23 transactions and 11 payouts remain, with every and only successful seed backed by a transfer", () => {
  const transactions = readSeedRecords("transactions");
  const payouts = readSeedRecords("payments");
  assert.equal(transactions.length, 23);
  assert.equal(payouts.length, 11);
  assert.equal(transactions.filter(record => record.status === "Succeeded").length, 12);
  assert.equal(payouts.filter(record => record.status === "Succeeded").length, 6);

  const records = [...transactions, ...payouts];
  assert.equal(new Set(records.map(record => record.id)).size, records.length, "Showcase record IDs must be unique");
  const succeeded = records.filter(record => record.status === "Succeeded");
  assert.deepEqual(Object.keys(showcaseTransfers).sort(), succeeded.map(record => record.id).sort());
  for (const record of records) {
    if (record.status === "Succeeded") {
      assert.equal(getShowcaseTransfer(record.id, record.network), showcaseTransfers[record.id]);
    } else {
      assert.equal(Object.hasOwn(showcaseTransfers, record.id), false, `${record.id} must remain an illustrative status`);
    }
  }
});

test("showcase transfers are distinct, positive native ETH amounts with valid transaction provenance", () => {
  const records = Object.values(showcaseTransfers);
  assert.equal(records.length, 18);
  assert.equal(records.filter(record => record.chainId === 11155111).length, 8);
  assert.equal(records.filter(record => record.chainId === 84532).length, 10);
  const uniqueTransfers = new Set<string>();
  const earliest = Date.parse("2026-09-08T00:00:00Z");
  const latest = Date.parse("2026-09-13T00:00:00Z");

  for (const record of records) {
    assert.equal(record.status, "success");
    assert.match(record.hash, /^0x[\da-fA-F]{64}$/);
    assert.match(record.blockHash, /^0x[\da-fA-F]{64}$/);
    assert.ok(Number.isSafeInteger(record.blockNumber) && record.blockNumber > 0);
    for (const address of [record.from, record.to]) {
      assert.ok(isAddress(address), `Invalid transfer address: ${address}`);
      assert.notEqual(address.toLowerCase(), ZeroAddress);
    }

    assert.match(record.valueWei, /^[1-9]\d*$/);
    assert.match(record.amountEth, /^\d+(?:\.\d{1,18})?$/);
    assert.equal(parseEther(record.amountEth), BigInt(record.valueWei), `${record.hash} must preserve every wei`);
    assert.ok(BigInt(record.valueWei) > BigInt(0));

    const minedAt = Date.parse(record.blockTimestamp);
    const verifiedAt = Date.parse(record.verifiedAt);
    assert.ok(Number.isFinite(minedAt) && minedAt >= earliest && minedAt < latest, "Mined timestamps must be within September 8–12, 2026");
    assert.ok(Number.isFinite(verifiedAt) && verifiedAt >= minedAt, "Verification cannot precede the mined block");
    assert.match(record.blockTimestamp, /Z$/);
    assert.match(record.verifiedAt, /Z$/);

    const key = `${record.chainId}:${record.hash.toLowerCase()}`;
    assert.equal(uniqueTransfers.has(key), false, "A public transfer cannot represent two showcase payments");
    uniqueTransfers.add(key);
  }
});

test("network, chain, transaction links and address links agree for every transfer", () => {
  for (const transfer of Object.values(showcaseTransfers)) {
    const base = transfer.network === "Base Sepolia";
    assert.equal(transfer.chainId, base ? 84532 : 11155111);
    const explorer = base ? "https://sepolia.basescan.org" : "https://sepolia.etherscan.io";
    assert.equal(transfer.explorerUrl, `${explorer}/tx/${transfer.hash}`);
    assert.equal(blockchainAddressUrl(transfer, transfer.from), `${explorer}/address/${transfer.from}`);
    assert.equal(blockchainAddressUrl(transfer, transfer.to), `${explorer}/address/${transfer.to}`);
    const rpc = new URL(transfer.sourceRpc);
    assert.equal(rpc.protocol, "https:");
    assert.equal(rpc.username, "");
    assert.equal(rpc.password, "");
  }
});

test("missing, unconfirmed and wrong-network records cannot return a verified transfer", () => {
  for (const id of ["TX_UNKNOWN", "", "constructor", "__proto__"]) {
    assert.throws(() => getShowcaseTransfer(id, "Ethereum Sepolia"), /verified transfer/i);
  }
  for (const [id, transfer] of Object.entries(showcaseTransfers)) {
    const wrongNetwork = transfer.network === "Ethereum Sepolia" ? "Base Sepolia" : "Ethereum Sepolia";
    assert.throws(() => getShowcaseTransfer(id, wrongNetwork), /correct network/i);
  }
  for (const record of [...readSeedRecords("transactions"), ...readSeedRecords("payments")]) {
    if (record.status !== "Succeeded") {
      assert.throws(() => getShowcaseTransfer(record.id, record.network), /verified transfer/i);
    }
  }
});

test("blockchain dates display UTC consistently across the browser's local time zone", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Auckland"]) {
      process.env.TZ = timezone;
      assert.equal(formatBlockchainDate("2026-09-10T12:34:56Z"), "Sep 10, 2026, 12:34 PM UTC");
      assert.equal(formatBlockchainDate("2026-09-10T18:04:56+05:30"), "Sep 10, 2026, 12:34 PM UTC");
      assert.equal(formatBlockchainDate("2026-09-08T00:01:00Z"), "Sep 8, 2026, 12:01 AM UTC");
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});
