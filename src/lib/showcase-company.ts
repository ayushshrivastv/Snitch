import type { CompanyAccount } from "./company-types";

/** Public identifiers for the existing shared treasury, never signing credentials. */
export const SHOWCASE_COMPANY = Object.freeze({
  id: "7fd7dba6-4e30-4658-9d51-eb271289ffb2",
  name: "Snitchpay.co",
  cfoUserId: "did:privy:cmtwtnu1e00s30bjrgm2ga5ck",
  cfoName: "Ayush Srivastava",
  cfoEmail: "ayush.srivastav@icloud.com",
  walletAddress: "0x52da39e9Da98F4aF044312fc4Dc5Dd5f6D1af37E",
  privyWalletId: "d6e66zxlhrk4i7whmy6b0pw8",
  createdAt: "2026-09-11T13:09:19.617Z",
});

/** A display alias must never select a different user's similarly named wallet. */
export function isShowcaseCompany(company: CompanyAccount): boolean {
  return company.id === SHOWCASE_COMPANY.id && company.purpose === "playground" &&
    company.ownerUserId === SHOWCASE_COMPANY.cfoUserId && company.cfoUserId === SHOWCASE_COMPANY.cfoUserId &&
    company.wallet.status === "ready" &&
    company.wallet.address?.toLowerCase() === SHOWCASE_COMPANY.walletAddress.toLowerCase() &&
    company.wallet.privyWalletId === SHOWCASE_COMPANY.privyWalletId;
}
