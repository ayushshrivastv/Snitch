import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { CompanyStore } from "../src/lib/company-store";
import { InvoiceCompanyConflictError, InvoiceStore } from "../src/lib/invoice-store";
import type { Invoice } from "../src/lib/invoices";

const directory = mkdtempSync(join(tmpdir(), "snitch-invoice-binding-"));
after(() => rmSync(directory, { recursive: true, force: true }));
const wallet = "0x1111111111111111111111111111111111111111";

async function fixture() {
  const path = join(directory, `${randomUUID()}.sqlite`);
  const companies = new CompanyStore(path);
  const invoices = new InvoiceStore(path);
  const ownerId = `did:privy:${randomUUID()}`;
  const company = (await companies.reserve(ownerId, "Company", randomUUID(), [])).company;
  await companies.bindVerifiedWallet(ownerId, company.id, { address: wallet, id: "wallet-id" });
  const invoice: Invoice = {
    id: `INV-${randomUUID()}`, ownerId, companyId: company.id, treasury: wallet, amount: "0.001",
    currency: "ETH", chainId: 11155111, customerName: "Customer", title: "Invoice", memo: "",
    dueDate: "2026-09-12", createdAt: "2026-09-11T00:00:00.000Z", paymentTerms: "Due on receipt", treasuryAccount: "Company",
  };
  return { companies, invoices, ownerId, company, invoice, close: () => { invoices.close(); companies.close(); } };
}

test("a deleted company cannot receive an invoice from a previously loaded company snapshot", async () => {
  const data = await fixture();
  try {
    assert.equal((await data.companies.getForUser(data.ownerId, data.company.id))?.wallet.address, wallet);
    await data.companies.deleteForUser(data.ownerId, data.company.id);
    await assert.rejects(data.invoices.saveInvoice(data.invoice), InvoiceCompanyConflictError);
    assert.equal(await data.invoices.getInvoice(data.invoice.id), undefined);
  } finally { data.close(); }
});

test("company invoice storage independently rejects a different owner, recipient, and missing authority", async () => {
  const data = await fixture();
  try {
    for (const change of [
      { ownerId: "did:privy:another" }, { ownerId: undefined }, { treasury: undefined },
      { treasury: "0x2222222222222222222222222222222222222222" }, { companyId: "" },
    ]) {
      const invalid = { ...data.invoice, ...change, id: `INV-${randomUUID()}` };
      await assert.rejects(data.invoices.saveInvoice(invalid), InvoiceCompanyConflictError);
      assert.equal(await data.invoices.getInvoice(invalid.id), undefined);
    }
    const pending = (await data.companies.reserve(data.ownerId, "Pending company", randomUUID(), [])).company;
    await assert.rejects(data.invoices.saveInvoice({ ...data.invoice, companyId: pending.id }), InvoiceCompanyConflictError);
    const accepted = { ...data.invoice, treasury: wallet.toUpperCase().replace("0X", "0x") };
    assert.deepEqual(await data.invoices.saveInvoice(accepted), accepted);
  } finally { data.close(); }
});

test("deletion racing invoice insertion leaves no surviving invoice across database connections", async () => {
  const data = await fixture();
  try {
    const outcomes = await Promise.allSettled([
      data.invoices.saveInvoice(data.invoice),
      data.companies.deleteForUser(data.ownerId, data.company.id),
    ]);
    assert.equal(outcomes[1].status, "fulfilled");
    if (outcomes[0].status === "rejected") assert.ok(outcomes[0].reason instanceof InvoiceCompanyConflictError);
    assert.equal(await data.companies.getForUser(data.ownerId, data.company.id), undefined);
    assert.equal(await data.invoices.getInvoice(data.invoice.id), undefined);
  } finally { data.close(); }
});

test("legacy invoices without a company keep their existing storage behavior", async () => {
  const data = await fixture();
  try {
    const { companyId, ...legacy } = data.invoice;
    assert.equal(companyId, data.company.id);
    await data.companies.deleteForUser(data.ownerId, data.company.id);
    assert.deepEqual(await data.invoices.saveInvoice(legacy), legacy);
    assert.deepEqual(await data.invoices.getInvoice(legacy.id), legacy);
  } finally { data.close(); }
});
