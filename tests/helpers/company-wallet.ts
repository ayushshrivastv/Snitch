import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function installCompanyFixture() {
  const previousDataDir = process.env.SNITCH_DATA_DIR;
  const directory = mkdtempSync(join(tmpdir(), "snitch-company-invoices-"));
  process.env.SNITCH_DATA_DIR = directory;
  const store = await import("../../src/lib/company-store");
  const invoiceStore = await import("../../src/lib/invoice-store");

  return {
    create(userId: string, name: string, address?: string) {
      const { company } = store.reserveCompanyForUser(userId, name, randomUUID(), []);
      return address
        ? store.bindVerifiedCompanyWallet(userId, company.id, { address, id: `wallet-${randomUUID()}` })
        : company;
    },
    restore() {
      invoiceStore.closeInvoiceStore();
      store.getCompanyStore().close();
      if (previousDataDir === undefined) delete process.env.SNITCH_DATA_DIR;
      else process.env.SNITCH_DATA_DIR = previousDataDir;
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
