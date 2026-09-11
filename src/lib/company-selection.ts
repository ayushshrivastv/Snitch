import type { CompanyAccount } from "./company-types";
import { isShowcaseCompany } from "./showcase-company";

export const PLAYGROUND_ACCOUNT_ID = "inst_final_snitch";

// The public showcase ID resolves only to the original treasury's server record.
// A public wallet address alone never supplies signing authority.
export function resolveWalletCompany(companies: readonly CompanyAccount[], accountId: string) {
  return accountId === PLAYGROUND_ACCOUNT_ID
    ? companies.find(isShowcaseCompany)
    : companies.find(company => company.id === accountId);
}
