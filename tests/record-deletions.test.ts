import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { CompanyRecordDeletionStore } from "../src/lib/company-record-deletions";
import { CompanyPayoutStore } from "../src/lib/company-payout-store";
import { companyPayoutDisplayId } from "../src/lib/company-payout-types";
import { CompanyStore } from "../src/lib/company-store";
import { AsyncDatabase } from "../src/lib/database";
import { InvoiceStore } from "../src/lib/invoice-store";

const owner = "did:privy:record-owner";
const stranger = "did:privy:record-stranger";
const wallet = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const hash = `0x${"ab".repeat(32)}`;

test("transaction and payout deletions survive reopening and cannot be restored by recovery", async () => {
  const directory = mkdtempSync(join(tmpdir(), "snitch-record-deletions-"));
  const path = join(directory, "snitch.sqlite");
  const companies = new CompanyStore(path);
  const invoices = new InvoiceStore(path);
  const payouts = new CompanyPayoutStore(path);
  const deletions = new CompanyRecordDeletionStore(path);
  try {
    const company = (await companies.reserve(owner, "Deletion test", randomUUID(), [])).company;
    await companies.bindVerifiedWallet(owner, company.id, { address: wallet });
    const invoiceId = `INV-${randomUUID().toUpperCase()}`;
    await invoices.saveInvoice({
      id: invoiceId, amount: "0.001", currency: "ETH", chainId: 11155111, treasury: wallet,
      customerName: "Customer", title: "Invoice", memo: "", dueDate: "2026-09-12",
      createdAt: new Date().toISOString(), paymentTerms: "Due now", treasuryAccount: "Company wallet",
      ownerId: owner, companyId: company.id,
    });
    await invoices.savePaymentSubmission(invoiceId, hash);
    await payouts.saveSubmission(owner, company.id, {
      from: wallet, to: recipient, amount: "0.001", transactionHash: hash, receiverName: "Receiver",
    });

    await assert.rejects(
      deletions.delete(stranger, company.id, { type: "transaction", recordId: `TX_${invoiceId}`, invoiceId }),
      /Company not found/,
    );
    await deletions.delete(owner, company.id, { type: "transaction", recordId: `TX_${invoiceId}`, invoiceId });
    await deletions.delete(owner, company.id, { type: "payout", recordId: companyPayoutDisplayId(hash), transactionHash: hash });
    assert.equal(await invoices.getInvoice(invoiceId), undefined);
    assert.equal(await payouts.findSubmissionForCompany(owner, company.id, hash), undefined);
    await assert.rejects(
      payouts.saveSubmission(owner, company.id, { from: wallet, to: recipient, amount: "0.001", transactionHash: hash }),
      /deleted/,
    );

    const reopened = new CompanyRecordDeletionStore(path);
    const database = new AsyncDatabase(path);
    try {
      assert.deepEqual(await reopened.list(owner, company.id), {
        transactions: [`TX_${invoiceId}`], payouts: [companyPayoutDisplayId(hash)],
      });
      assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM invoice_payment_submissions WHERE invoice_id = ?").get(invoiceId))?.count, 0);
      assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM company_payout_submissions WHERE transaction_hash = ?").get(hash))?.count, 0);
    } finally { reopened.close(); database.close(); }
  } finally {
    deletions.close(); payouts.close(); invoices.close(); companies.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
