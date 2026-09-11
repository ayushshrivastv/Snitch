import assert from "node:assert/strict";
import { test } from "node:test";

import { isInvoiceExpired, resolveInvoiceLifecycleStatus } from "../src/lib/invoice-lifecycle";

const dueEnd = Date.UTC(2026, 8, 12, 23, 59, 59, 999);

test("invoice attempts remain incomplete until the due date has fully expired", () => {
  assert.equal(resolveInvoiceLifecycleStatus("Failed", "2026-09-12", dueEnd), "Incomplete");
  assert.equal(resolveInvoiceLifecycleStatus("Incomplete", "2026-09-12", dueEnd), "Incomplete");
  assert.equal(resolveInvoiceLifecycleStatus("Failed", "2026-09-12", dueEnd + 1), "Failed");
  assert.equal(resolveInvoiceLifecycleStatus("Incomplete", "2026-09-12", dueEnd + 1), "Failed");
});

test("successful invoices stay successful after expiry and invalid dates do not change status", () => {
  assert.equal(resolveInvoiceLifecycleStatus("Succeeded", "2020-01-01", dueEnd), "Succeeded");
  assert.equal(resolveInvoiceLifecycleStatus("Failed", "not-a-date", dueEnd), "Failed");
  assert.equal(isInvoiceExpired("2026-09-12", dueEnd), false);
  assert.equal(isInvoiceExpired("2026-09-12", dueEnd + 1), true);
  assert.equal(isInvoiceExpired("2026-02-30", dueEnd), false);
});
