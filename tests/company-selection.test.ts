import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAYGROUND_ACCOUNT_ID, resolveWalletCompany } from "../src/lib/company-selection";
import type { CompanyAccount } from "../src/lib/company-types";
import { SHOWCASE_COMPANY } from "../src/lib/showcase-company";

function company(overrides: Partial<CompanyAccount> = {}): CompanyAccount {
  return {
    id: "322f3c99-7a48-47a4-9804-ea04c4c9e641",
    name: "Snitchpay.co",
    purpose: "company",
    ownerUserId: "did:privy:owner",
    cfoUserId: "did:privy:owner",
    createdAt: "2026-09-11T12:00:00.000Z",
    updatedAt: "2026-09-11T12:00:00.000Z",
    wallet: { status: "ready", address: "0x0000000000000000000000000000000000000001" },
    baselineWalletAddresses: [],
    ...overrides,
  };
}

function showcase(overrides: Partial<CompanyAccount> = {}) {
  return company({ id: SHOWCASE_COMPANY.id, purpose: "playground", ownerUserId: SHOWCASE_COMPANY.cfoUserId,
    cfoUserId: SHOWCASE_COMPANY.cfoUserId, wallet: { status: "ready", address: SHOWCASE_COMPANY.walletAddress,
      privyWalletId: SHOWCASE_COMPANY.privyWalletId }, ...overrides });
}

test("the shared display alias selects the original treasury regardless of company order", () => {
  const namedLikePlayground = company();
  const canonical = showcase();
  const previousPrivatePlayground = company({ purpose: "playground" });
  assert.equal(resolveWalletCompany([previousPrivatePlayground, namedLikePlayground, canonical], PLAYGROUND_ACCOUNT_ID), canonical);
  assert.equal(resolveWalletCompany([canonical, namedLikePlayground, previousPrivatePlayground], PLAYGROUND_ACCOUNT_ID), canonical);
});

test("shared alias rejects lookalikes, changed controllers, revoked CFOs, and substituted wallets", () => {
  const invalid = [company(), company({ purpose: "playground" }), showcase({ ownerUserId: "another" }),
    showcase({ cfoUserId: null }), showcase({ cfoUserId: "another" }),
    showcase({ wallet: { status: "ready", address: SHOWCASE_COMPANY.walletAddress, privyWalletId: "another" } }),
    showcase({ wallet: { status: "ready", address: "0x0000000000000000000000000000000000000001", privyWalletId: SHOWCASE_COMPANY.privyWalletId } }),
    showcase({ wallet: { status: "pending" } })];
  for (const item of invalid) assert.equal(resolveWalletCompany([item], PLAYGROUND_ACCOUNT_ID), undefined);
  assert.equal(resolveWalletCompany([], PLAYGROUND_ACCOUNT_ID), undefined);
});

test("normal company IDs select the exact company rather than the first or Playground wallet", () => {
  const firstCompany = company();
  const selectedCompany = company({ id: "d4a2cc97-61e0-4757-98df-cb86a95a0869", name: "Selected company" });
  const playground = company({ id: "44ef751d-797b-4a27-8340-ab2291fbab0d", purpose: "playground" });
  const companies = Object.freeze([Object.freeze(playground), Object.freeze(firstCompany), Object.freeze(selectedCompany)]);
  assert.equal(resolveWalletCompany(companies, selectedCompany.id), selectedCompany);
  assert.equal(resolveWalletCompany(companies, firstCompany.id), firstCompany);
  assert.equal(resolveWalletCompany(companies, playground.id), playground);
});

test("unknown company IDs and display names never obtain a wallet fallback", () => {
  const normalCompany = company();
  const playground = company({ id: "44ef751d-797b-4a27-8340-ab2291fbab0d", purpose: "playground" });
  for (const accountId of ["", "Snitchpay.co", "93225a6c-9826-4617-a716-1cd7c53802ba"]) {
    assert.equal(resolveWalletCompany([normalCompany, playground], accountId), undefined);
  }
});

test("a pending selected wallet stays selected instead of silently using another ready wallet", () => {
  const readyCompany = company();
  const pendingCompany = company({ id: "44ef751d-797b-4a27-8340-ab2291fbab0d", wallet: { status: "pending" } });
  assert.equal(resolveWalletCompany([readyCompany, pendingCompany], pendingCompany.id), pendingCompany);
});
