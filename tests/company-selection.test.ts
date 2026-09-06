import assert from "node:assert/strict";
import { test } from "node:test";
import { PLAYGROUND_ACCOUNT_ID, resolveWalletCompany } from "../src/lib/company-selection";
import type { CompanyAccount } from "../src/lib/company-types";

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

test("the Playground display alias selects only the reserved Playground purpose", () => {
  const namedLikePlayground = company();
  const playground = company({
    id: "44ef751d-797b-4a27-8340-ab2291fbab0d",
    purpose: "playground",
    name: "Snitchpay.co",
    wallet: { status: "ready", address: "0x0000000000000000000000000000000000000002" },
  });
  assert.equal(resolveWalletCompany([namedLikePlayground, playground], PLAYGROUND_ACCOUNT_ID), playground);
  assert.equal(resolveWalletCompany([playground, namedLikePlayground], PLAYGROUND_ACCOUNT_ID), playground);
});

test("missing Playground authority cannot fall back to a similarly named or first company wallet", () => {
  const namedLikePlayground = company();
  const anotherCompany = company({ id: "d4a2cc97-61e0-4757-98df-cb86a95a0869", name: "Other company" });
  assert.equal(resolveWalletCompany([namedLikePlayground, anotherCompany], PLAYGROUND_ACCOUNT_ID), undefined);
  assert.equal(resolveWalletCompany([anotherCompany, namedLikePlayground], PLAYGROUND_ACCOUNT_ID), undefined);
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
  const pendingPlayground = company({ id: "44ef751d-797b-4a27-8340-ab2291fbab0d", purpose: "playground", wallet: { status: "pending" } });
  assert.equal(resolveWalletCompany([readyCompany, pendingPlayground], PLAYGROUND_ACCOUNT_ID), pendingPlayground);
});
