import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Wallet } from "ethers";

import { approveCompanyWalletExport } from "../src/components/auth/company-wallet-export-request";
import { buildWalletExportApprovalMessage, type WalletExportApproval } from "../src/lib/wallet-export-approval";
import type { CompanyAccount } from "../src/lib/company-types";

type ExportInput = Parameters<typeof approveCompanyWalletExport>[0];

function fixture() {
  const wallet = Wallet.createRandom();
  const userId = `did:privy:${randomUUID()}`;
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const company: CompanyAccount = {
    id: randomUUID(), name: "Example company", purpose: "company", ownerUserId: userId, cfoUserId: userId,
    createdAt: issuedAt, updatedAt: issuedAt, baselineWalletAddresses: [],
    wallet: { status: "ready", address: wallet.address, privyWalletId: randomUUID() },
  };
  const approval: WalletExportApproval = {
    id: randomUUID(), companyId: company.id, userId, walletAddress: wallet.address, expiresAt, message: "",
  };
  approval.message = buildWalletExportApprovalMessage({
    companyId: company.id, companyName: company.name, userId, walletAddress: wallet.address,
    issuedAt, expiresAt, requestId: approval.id,
  });
  const receipt = { approved: true, companyId: company.id, walletAddress: wallet.address, approvalId: approval.id };
  const controller = new AbortController();
  const calls: string[] = [];
  const input: ExportInput = {
    company, userId, signal: controller.signal,
    onStage: stage => { calls.push(`stage:${stage}`); },
    requestApproval: async () => { calls.push("request"); return { approval }; },
    signMessage: async (message, options) => {
      calls.push("sign");
      assert.equal(message.message, approval.message);
      assert.equal(options.address, wallet.address);
      assert.equal(options.uiOptions.showWalletUIs, true);
      assert.equal(options.uiOptions.title, "Verify CFO access");
      assert.match(options.uiOptions.description, /message signature; no funds move or gas is charged/);
      return { signature: await wallet.signMessage(message.message) };
    },
    confirmApproval: async request => {
      calls.push("confirm");
      assert.equal(request.approvalId, approval.id);
      assert.equal(request.signature, await wallet.signMessage(approval.message));
      return receipt;
    },
    exportWallet: async request => { calls.push("export"); assert.deepEqual(request, { address: wallet.address }); },
  };
  return { wallet, userId, company, approval, receipt, controller, calls, input };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

test("company export requests and verifies a CFO signature before opening the exact Privy wallet", async () => {
  const current = fixture();
  await approveCompanyWalletExport(current.input);
  assert.deepEqual(current.calls, [
    "stage:requesting", "request", "stage:signing", "sign", "stage:verifying", "confirm", "stage:exporting", "export",
  ]);
});

test("company export rejects non-CFO identities locally before calling either server or Privy", async () => {
  const cases = [
    { cfoUserId: null }, { cfoUserId: "different-cfo" }, { ownerUserId: "different-controller" },
  ];
  for (const overrides of cases) {
    const current = fixture();
    await assert.rejects(approveCompanyWalletExport({
      ...current.input, company: { ...current.company, ...overrides },
    }), /Chief Financial Officer/);
    assert.deepEqual(current.calls, []);
  }
  const unsigned = fixture();
  await assert.rejects(approveCompanyWalletExport({ ...unsigned.input, userId: "" }), /Chief Financial Officer/);
  assert.deepEqual(unsigned.calls, []);
});

test("company export requires a ready wallet and a current session", async () => {
  const pending = fixture();
  await assert.rejects(approveCompanyWalletExport({
    ...pending.input, company: { ...pending.company, wallet: { status: "pending" } },
  }), /Connect the company wallet/);
  assert.deepEqual(pending.calls, []);
  const ended = fixture();
  ended.controller.abort();
  await assert.rejects(approveCompanyWalletExport(ended.input), { name: "AbortError" });
  assert.deepEqual(ended.calls, []);
});

test("company export stops before signing a mismatched, expired or incomplete server challenge", async () => {
  const invalid: Partial<WalletExportApproval>[] = [
    { companyId: randomUUID() }, { userId: "different-user" }, { walletAddress: Wallet.createRandom().address },
    { id: "" }, { message: "" }, { expiresAt: new Date(0).toISOString() }, { expiresAt: "invalid-date" },
  ];
  for (const overrides of invalid) {
    const current = fixture();
    await assert.rejects(approveCompanyWalletExport({
      ...current.input, requestApproval: async () => ({ approval: { ...current.approval, ...overrides } }),
    }), /invalid or has expired/);
    assert.deepEqual(current.calls, ["stage:requesting"]);
  }
});

test("a declined Privy signature preserves the cancellation and never confirms or exports", async () => {
  const current = fixture();
  const cancelled = Object.assign(new Error("User rejected the signature"), { code: 4001 });
  await assert.rejects(approveCompanyWalletExport({
    ...current.input, signMessage: async () => { throw cancelled; },
  }), error => error === cancelled);
  assert.deepEqual(current.calls, ["stage:requesting", "request", "stage:signing"]);
});

test("wrong-wallet, altered-message and malformed signatures stop before server confirmation", async () => {
  for (const kind of ["wrong-wallet", "changed-message", "malformed"] as const) {
    const current = fixture();
    const signature = kind === "wrong-wallet" ? await Wallet.createRandom().signMessage(current.approval.message)
      : kind === "changed-message" ? await current.wallet.signMessage(`${current.approval.message}\nchanged`)
        : "not-a-signature";
    await assert.rejects(approveCompanyWalletExport({
      ...current.input, signMessage: async () => ({ signature }),
    }), /not signed by this company/);
    assert.deepEqual(current.calls, ["stage:requesting", "request", "stage:signing"]);
  }
});

test("a server confirmation rejection never opens wallet export", async () => {
  const current = fixture();
  const rejected = new Error("Only the CFO may export this wallet");
  await assert.rejects(approveCompanyWalletExport({
    ...current.input, confirmApproval: async () => { throw rejected; },
  }), error => error === rejected);
  assert.deepEqual(current.calls, ["stage:requesting", "request", "stage:signing", "sign", "stage:verifying"]);
});

test("an invalid server approval receipt cannot unlock Privy export", async () => {
  const invalid = [
    { approved: false }, { companyId: randomUUID() }, { approvalId: randomUUID() }, { walletAddress: Wallet.createRandom().address },
  ];
  for (const overrides of invalid) {
    const current = fixture();
    await assert.rejects(approveCompanyWalletExport({
      ...current.input, confirmApproval: async () => ({ ...current.receipt, ...overrides }),
    }), /could not be verified/);
    assert.deepEqual(current.calls, ["stage:requesting", "request", "stage:signing", "sign", "stage:verifying"]);
  }
});

test("approval expiring during the signature prompt cannot proceed to server confirmation", async context => {
  const current = fixture();
  const originalSign = current.input.signMessage;
  await assert.rejects(approveCompanyWalletExport({
    ...current.input,
    signMessage: async (...args) => {
      const signature = await originalSign(...args);
      context.mock.method(Date, "now", () => Date.parse(current.approval.expiresAt));
      return signature;
    },
  }), /approval expired/);
  assert.deepEqual(current.calls, ["stage:requesting", "request", "stage:signing", "sign"]);
});

test("approval expiring while server verification finishes cannot open wallet export", async context => {
  const current = fixture();
  await assert.rejects(approveCompanyWalletExport({
    ...current.input,
    confirmApproval: async () => {
      context.mock.method(Date, "now", () => Date.parse(current.approval.expiresAt));
      return current.receipt;
    },
  }), /approval expired/);
  assert.deepEqual(current.calls, ["stage:requesting", "request", "stage:signing", "sign", "stage:verifying"]);
});

test("logout during signing discards a late signature and never confirms or exports", async () => {
  const current = fixture();
  const signingStarted = deferred<void>();
  const signatureResponse = deferred<{ signature: string }>();
  const pending = approveCompanyWalletExport({
    ...current.input,
    signMessage: async () => { signingStarted.resolve(); return signatureResponse.promise; },
  });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await signingStarted.promise;
  current.controller.abort();
  signatureResponse.resolve({ signature: await current.wallet.signMessage(current.approval.message) });
  await rejected;
  assert.deepEqual(current.calls, ["stage:requesting", "request", "stage:signing"]);
});

test("logout during server confirmation discards a late approval and never opens export", async () => {
  const current = fixture();
  const verificationStarted = deferred<void>();
  const approvalResponse = deferred<typeof current.receipt>();
  const pending = approveCompanyWalletExport({
    ...current.input,
    confirmApproval: async () => { verificationStarted.resolve(); return approvalResponse.promise; },
  });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await verificationStarted.promise;
  current.controller.abort();
  approvalResponse.resolve(current.receipt);
  await rejected;
  assert.deepEqual(current.calls, ["stage:requesting", "request", "stage:signing", "sign", "stage:verifying"]);
});

test("server challenge failures and a late response after logout never begin signing", async () => {
  const failed = fixture();
  const unavailable = new Error("Wallet verification unavailable");
  await assert.rejects(approveCompanyWalletExport({
    ...failed.input, requestApproval: async () => { throw unavailable; },
  }), error => error === unavailable);
  assert.deepEqual(failed.calls, ["stage:requesting"]);
  const ended = fixture();
  await assert.rejects(approveCompanyWalletExport({
    ...ended.input, requestApproval: async () => { ended.controller.abort(); return { approval: ended.approval }; },
  }), { name: "AbortError" });
  assert.deepEqual(ended.calls, ["stage:requesting"]);
});
