import { companyErrorResponse, companyRequestBody, companyResponse, normalizeCompanyWalletAddress } from "@/lib/company-service";
import { CompanyError, getCompanyForUser } from "@/lib/company-store";
import { CompanyPaymentVerificationError, verifyCompanyPayment } from "@/lib/company-payment-verification";
import { requirePrivyUser } from "@/lib/privy-server";
import { getEthereumExplorerUrl, isEthereumTransactionHash, parseEthAmount } from "../../../../../../../services/ethereum";

import { createCompanyPaymentReader } from "@/lib/company-payment-reader";
import { getCompanyPayoutStore } from "@/lib/company-payout-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    const company = getCompanyForUser(auth.userId, companyId);
    if (!company) throw new CompanyError("Company not found.", 404, "COMPANY_NOT_FOUND");
    if (company.wallet.status !== "ready" || !company.wallet.address) throw new CompanyError("Finish setting up your company wallet first.", 409, "COMPANY_WALLET_PENDING");
    const body = await companyRequestBody(request);
    if (!isEthereumTransactionHash(body.transactionHash) || typeof body.amount !== "string") throw new CompanyError("Provide a transaction hash, recipient, and ETH amount.", 400, "INVALID_PAYMENT");
    const to = normalizeCompanyWalletAddress(body.to);
    try { parseEthAmount(body.amount); } catch { throw new CompanyError("Enter a positive ETH amount with at most 18 decimal places.", 400, "INVALID_PAYMENT_AMOUNT"); }
    try {
      const confirmation = await verifyCompanyPayment({ from: company.wallet.address, to, amount: body.amount, transactionHash: body.transactionHash, provider: createCompanyPaymentReader(AbortSignal.timeout(8000)), requireTransaction: true });
      getCompanyPayoutStore().saveVerified(auth.userId, companyId, { from: company.wallet.address, to, amount: body.amount, confirmation });
      return companyResponse(confirmation);
    } catch (error) {
      if (error instanceof CompanyPaymentVerificationError && error.status === 409) return companyResponse({ status: "Incomplete", transactionHash: body.transactionHash.toLowerCase(), explorerUrl: getEthereumExplorerUrl(body.transactionHash) });
      if (error instanceof CompanyPaymentVerificationError) return companyResponse({ error: error.message, code: "PAYMENT_NOT_VERIFIED" }, error.status);
      return companyResponse({ error: "Confirmation is temporarily unavailable. Check this transaction again; do not send it again.", code: "PAYMENT_CONFIRMATION_UNAVAILABLE" }, 503);
    }
  } catch (error) { return companyErrorResponse(error); }
}
