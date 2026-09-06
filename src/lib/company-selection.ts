import type { CompanyAccount } from "./company-types";

export const PLAYGROUND_ACCOUNT_ID = "inst_final_snitch";

// The public showcase ID is a display alias, never a shared signing authority.
// The authenticated provider supplies only the current owner's companies.
export function resolveWalletCompany(companies: readonly CompanyAccount[], accountId: string) {
  return accountId === PLAYGROUND_ACCOUNT_ID
    ? companies.find(company => company.purpose === "playground")
    : companies.find(company => company.id === accountId);
}
