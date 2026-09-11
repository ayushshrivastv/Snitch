import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getAddress, isAddress, ZeroAddress } from "ethers";
import ts from "typescript";
import {
  PLAYGROUND_TREASURY_ADDRESS,
  showcasePayoutWallets,
} from "../src/lib/showcase-payout-wallets";
import { showcaseTransfers } from "../src/lib/showcase-blockchain";

function readPayoutSeeds() {
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
    .find(candidate => ts.isIdentifier(candidate.name) && candidate.name.text === "payments");
  assert.ok(declaration?.initializer && ts.isArrayLiteralExpression(declaration.initializer));
  return declaration.initializer.elements.map(element => {
    assert.ok(ts.isObjectLiteralExpression(element));
    const literal = (name: string) => {
      const property = element.properties.find(property =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
        property.name.text === name,
      );
      assert.ok(property && ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer));
      return property.initializer.text;
    };
    return { id: literal("id"), status: literal("status") };
  });
}

test("payout address fixtures cover only the five pending/failed showcase payouts", () => {
  const seeds = readPayoutSeeds();
  const illustrative = seeds.filter(seed => seed.status === "Incomplete" || seed.status === "Failed");
  assert.equal(illustrative.length, 5);
  assert.deepEqual(Object.keys(showcasePayoutWallets).sort(), illustrative.map(seed => seed.id).sort());
  for (const seed of seeds) {
    if (seed.status === "Succeeded") assert.equal(Object.hasOwn(showcasePayoutWallets, seed.id), false);
  }
  for (const id of Object.keys(showcasePayoutWallets)) {
    assert.equal(Object.hasOwn(showcaseTransfers, id), false, "Fixture addresses must never replace a verified transfer");
  }
});

test("illustrative payouts use one checksummed treasury and distinct nonzero recipients", () => {
  const recipients = new Set<string>();
  const assertFixtureAddress = (address: string) => {
    assert.ok(isAddress(address));
    assert.equal(getAddress(address), address, "Fixture addresses must preserve EIP-55 checksum casing");
    assert.notEqual(address.toLowerCase(), ZeroAddress);
    assert.doesNotMatch(address, /^0x(.)\1{39}$/i, "Repeated-digit placeholders are not usable fixture addresses");
  };
  assertFixtureAddress(PLAYGROUND_TREASURY_ADDRESS);
  for (const wallets of Object.values(showcasePayoutWallets)) {
    assert.ok(wallets);
    assert.deepEqual(Object.keys(wallets).sort(), ["from", "to"], "Fixture records must not claim transaction provenance");
    assert.equal(wallets.from, PLAYGROUND_TREASURY_ADDRESS);
    assertFixtureAddress(wallets.from);
    assertFixtureAddress(wallets.to);
    assert.notEqual(wallets.from.toLowerCase(), wallets.to.toLowerCase());
    assert.equal(recipients.has(wallets.to.toLowerCase()), false);
    recipients.add(wallets.to.toLowerCase());
  }
  assert.equal(recipients.size, 5);
});
