import { getAddress, ZeroAddress } from "ethers";
import { NextResponse } from "next/server";

import type { CompanyAccount } from "./company-types";
import { CompanyError, getCompanyStore, validateCompanyName, validateCompanyRequestId } from "./company-store";
import { getPrivyClient } from "./privy-server";
import { isShowcaseCompany, SHOWCASE_COMPANY } from "./showcase-company";

type EmbeddedWallet = { address: string; id?: string; eligible: boolean };

export function normalizeCompanyWalletAddress(value: unknown): string {
  if (typeof value !== "string") throw new CompanyError("A valid company wallet address is required.", 400, "INVALID_WALLET_ADDRESS");
  try {
    const address = getAddress(value.trim());
    if (address === ZeroAddress) throw new Error("zero address");
    return address;
  } catch {
    throw new CompanyError("A valid company wallet address is required.", 400, "INVALID_WALLET_ADDRESS");
  }
}

async function getPrivyWalletIdentity(userId: string): Promise<{ wallets: EmbeddedWallet[]; emails: string[] }> {
  try {
    const client = getPrivyClient();
    if (!client) throw new Error("No server client");
    const user = await client.users()._get(userId);
    if (user.id !== userId) throw new Error("User identity mismatch");
    const wallets = user.linked_accounts.flatMap((account) => {
      if (account.type !== "wallet" || account.chain_type !== "ethereum" || account.wallet_client_type !== "privy") return [];
      const address = normalizeCompanyWalletAddress(account.address);
      return [{
        address,
        ...("id" in account && account.id ? { id: account.id } : {}),
        // Company wallets are created by the signed-in owner, with no app delegation.
        eligible: account.connector_type === "embedded" &&
          !("delegated" in account && account.delegated) &&
          !("imported" in account && account.imported) &&
          !("user_can_sign" in account && account.user_can_sign === false),
      }];
    });
    const emails = user.linked_accounts.flatMap(account => account.type === "email" ? [account.address.toLowerCase()] : []);
    return { wallets, emails };
  } catch {
    throw new CompanyError("Unable to verify your company wallets. Please try again.", 503, "WALLET_VERIFICATION_UNAVAILABLE");
  }
}

async function getPrivyEmbeddedWallets(userId: string): Promise<EmbeddedWallet[]> {
  return (await getPrivyWalletIdentity(userId)).wallets;
}

/** Uses the original Privy identity and wallet; this never creates or delegates a wallet. */
async function restoreShowcaseCompany(userId: string) {
  if (userId !== SHOWCASE_COMPANY.cfoUserId) {
    throw new CompanyError("Only Snitchpay.co's Chief Financial Officer can connect its treasury.", 403, "CFO_REQUIRED");
  }
  const store = getCompanyStore();
  const { wallets, emails } = await getPrivyWalletIdentity(userId);
  const owned = wallets.find(wallet => wallet.eligible && wallet.id === SHOWCASE_COMPANY.privyWalletId &&
    wallet.address.toLowerCase() === SHOWCASE_COMPANY.walletAddress.toLowerCase());
  if (!emails.includes(SHOWCASE_COMPANY.cfoEmail) || !owned) {
    throw new CompanyError("Sign in with Snitchpay.co's CFO account to access its treasury.", 403, "SHOWCASE_IDENTITY_MISMATCH");
  }
  return store.restoreVerifiedShowcase(userId, owned);
}

async function walletCandidates(company: CompanyAccount, wallets: EmbeddedWallet[]): Promise<EmbeddedWallet[]> {
  const store = getCompanyStore();
  const baseline = new Set(company.baselineWalletAddresses.map((address) => address.toLowerCase()));
  const seen = new Set<string>();
  const candidates: EmbeddedWallet[] = [];
  for (const wallet of wallets) {
    const address = wallet.address.toLowerCase();
    if (!wallet.eligible || baseline.has(address) || seen.has(address) || await store.isWalletBound(wallet.address)) continue;
    seen.add(address);
    candidates.push(wallet);
  }
  return candidates;
}

const ambiguousWalletMessage = "Multiple new wallets were found. Contact support to link the correct company wallet.";

async function withCandidate(company: CompanyAccount, wallets: EmbeddedWallet[]): Promise<CompanyAccount> {
  if (company.wallet.status === "ready") return company;
  const candidates = await walletCandidates(company, wallets);
  if (candidates.length > 1) return { ...company, walletProvisioningError: ambiguousWalletMessage };
  return candidates.length === 1 ? { ...company, walletCandidateAddress: candidates[0].address } : company;
}

export async function getCompaniesWithWalletCandidates(userId: string): Promise<CompanyAccount[]> {
  const store = getCompanyStore();
  if (userId === SHOWCASE_COMPANY.cfoUserId) {
    const existing = await store.getForUser(userId, SHOWCASE_COMPANY.id);
    if (!existing) await restoreShowcaseCompany(userId);
    else if (!isShowcaseCompany(existing)) {
      throw new CompanyError("Snitchpay.co's treasury configuration needs review.", 409, "SHOWCASE_CONFIGURATION_CONFLICT");
    }
  }
  const companies = await store.listForUser(userId);
  if (!companies.some((company) => company.wallet.status === "pending")) return companies;
  const wallets = await getPrivyEmbeddedWallets(userId);
  return Promise.all(companies.map((company) => withCandidate(company, wallets)));
}

export async function reserveCompany(userId: string, body: Record<string, unknown>) {
  const name = validateCompanyName(body.name);
  const requestId = validateCompanyRequestId(body.requestId);
  const store = getCompanyStore();
  const existing = await store.findRequest(userId, requestId, name);
  if (existing?.wallet.status === "ready") return { company: existing, created: false };
  const wallets = await getPrivyEmbeddedWallets(userId);
  try {
    const reserved = await store.reserve(userId, name, requestId, wallets.map((wallet) => wallet.address));
    return { ...reserved, company: await withCandidate(reserved.company, wallets) };
  } catch (error) {
    if (error instanceof CompanyError && error.company) {
      throw new CompanyError(error.message, error.status, error.code, await withCandidate(error.company, wallets));
    }
    throw error;
  }
}

export async function reservePlaygroundCompany(userId: string) {
  return restoreShowcaseCompany(userId);
}

export async function bindCompanyWallet(userId: string, companyId: string, value: unknown): Promise<CompanyAccount> {
  const store = getCompanyStore();
  const company = await store.getForUser(userId, companyId);
  if (!company) throw new CompanyError("Company not found.", 404, "COMPANY_NOT_FOUND");
  const address = normalizeCompanyWalletAddress(value);
  const wallets = await getPrivyEmbeddedWallets(userId);
  const owned = wallets.find((wallet) => wallet.address.toLowerCase() === address.toLowerCase() && wallet.eligible);
  if (!owned) throw new CompanyError("This wallet is not an eligible Privy wallet owned by your account.", 403, "WALLET_NOT_OWNED");
  if (company.wallet.status !== "ready") {
    const candidates = await walletCandidates(company, wallets);
    if (candidates.length > 1) throw new CompanyError(ambiguousWalletMessage, 409, "WALLET_AMBIGUOUS");
    if (candidates.length !== 1 || candidates[0].address !== address) {
      throw new CompanyError("Create a new wallet for this company, then try linking it again.", 409, "WALLET_NOT_AVAILABLE");
    }
  }
  return store.bindVerifiedWallet(userId, companyId, owned);
}

async function verifyCfoWalletWithPrivy(userId: string, company: CompanyAccount): Promise<EmbeddedWallet> {
  const wallets = await getPrivyEmbeddedWallets(userId);
  const owned = wallets.find((wallet) => wallet.eligible &&
    wallet.address.toLowerCase() === company.wallet.address?.toLowerCase() &&
    (!company.wallet.privyWalletId || company.wallet.privyWalletId === wallet.id));
  if (!owned) {
    throw new CompanyError("The CFO's current Privy account does not control this company wallet.", 403, "WALLET_NOT_OWNED");
  }
  return owned;
}

export async function requestWalletExportApproval(userId: string, companyId: string) {
  const store = getCompanyStore();
  const company = await store.requireCfoExportCompany(userId, companyId);
  const owned = await verifyCfoWalletWithPrivy(userId, company);
  // Re-read CFO and wallet state inside the write transaction after the remote check.
  return store.createWalletExportApproval(userId, companyId, owned);
}

export async function confirmWalletExportApproval(userId: string, companyId: string, body: Record<string, unknown>) {
  if (typeof body.approvalId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.approvalId) ||
    typeof body.signature !== "string" || !/^0x(?:[0-9a-f]{128}|[0-9a-f]{130})$/i.test(body.signature)) {
    throw new CompanyError("A valid export approval and wallet signature are required.", 400, "INVALID_EXPORT_APPROVAL");
  }
  const store = getCompanyStore();
  const company = await store.requireCfoExportCompany(userId, companyId);
  await store.getWalletExportApproval(userId, companyId, body.approvalId);
  await verifyCfoWalletWithPrivy(userId, company);
  const approval = await store.consumeWalletExportApproval(userId, companyId, body.approvalId, body.signature);
  return { approved: true as const, companyId, walletAddress: approval.walletAddress, approvalId: approval.id };
}

export async function companyRequestBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 4096) throw new CompanyError("The request is too large.", 413, "REQUEST_TOO_LARGE");
  try {
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
    return body as Record<string, unknown>;
  } catch {
    throw new CompanyError("A JSON object is required.", 400, "INVALID_REQUEST");
  }
}

export function companyResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function companyErrorResponse(error: unknown) {
  if (error instanceof CompanyError) {
    return companyResponse({ error: error.message, code: error.code, ...(error.company ? { company: error.company } : {}) }, error.status);
  }
  // Never include provider errors, filesystem paths, tokens, or credentials.
  return companyResponse({ error: "Company storage is unavailable. Please try again.", code: "COMPANY_STORAGE_UNAVAILABLE" }, 503);
}
