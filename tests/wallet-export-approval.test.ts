import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Wallet } from "ethers";

import { buildWalletExportApprovalMessage, walletSignedExportApproval } from "../src/lib/wallet-export-approval";

test("wallet export approval is valid only for the company wallet that signed it", async () => {
  const founderWallet = Wallet.createRandom();
  const anotherWallet = Wallet.createRandom();
  const message = buildWalletExportApprovalMessage({
    companyId: randomUUID(),
    companyName: "Example company",
    walletAddress: founderWallet.address,
    issuedAt: "2026-09-11T12:00:00.000Z",
    requestId: randomUUID(),
  });
  const signature = await founderWallet.signMessage(message);

  assert.equal(walletSignedExportApproval(message, signature, founderWallet.address), true);
  assert.equal(walletSignedExportApproval(message, signature, anotherWallet.address), false);
  assert.match(message, /does not create a blockchain transaction/);
});

test("wallet export approval rejects a changed request or malformed signature", async () => {
  const founderWallet = Wallet.createRandom();
  const message = buildWalletExportApprovalMessage({
    companyId: randomUUID(),
    companyName: "Example company",
    walletAddress: founderWallet.address,
    issuedAt: "2026-09-11T12:00:00.000Z",
    requestId: randomUUID(),
  });
  const signature = await founderWallet.signMessage(message);

  assert.equal(walletSignedExportApproval(`${message}\nChanged`, signature, founderWallet.address), false);
  assert.equal(walletSignedExportApproval(message, "not-a-signature", founderWallet.address), false);
});
