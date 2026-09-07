import { companyErrorResponse, companyRequestBody, companyResponse, normalizeCompanyWalletAddress } from "@/lib/company-service";
import { CompanyError, getCompanyForUser } from "@/lib/company-store";
import { getCompanyPayoutStore } from "@/lib/company-payout-store";
import { createCompanyPaymentReader } from "@/lib/company-payment-reader";
import { CompanyPaymentVerificationError, verifyCompanyPayment } from "@/lib/company-payment-verification";
import { requirePrivyUser } from "@/lib/privy-server";
import { isEthereumTransactionHash, parseEthAmount } from "../../../../../../services/ethereum";

export const runtime = "nodejs";

function optionalText(value: unknown, field: string, limit: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new CompanyError(`Enter a valid ${field}.`, 400, "INVALID_PAYOUT_DETAILS");
  }
  return value.trim();
}

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    if (!getCompanyForUser(auth.userId, companyId)) throw new CompanyError("Company not found.", 404, "COMPANY_NOT_FOUND");
    return companyResponse({ payouts: getCompanyPayoutStore().listForCompany(auth.userId, companyId) });
  } catch (error) { return companyErrorResponse(error); }
}

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
    const receiverName = optionalText(body.receiverName, "recipient name", 120);
    const memo = optionalText(body.memo, "note", 2000);
    let confirmation;
    try {
      confirmation = await verifyCompanyPayment({
        from: company.wallet.address, to, amount: body.amount, transactionHash: body.transactionHash,
        provider: createCompanyPaymentReader(AbortSignal.timeout(8000)), requireTransaction: true,
      });
    } catch (error) {
      if (error instanceof CompanyPaymentVerificationError) return companyResponse({ error: error.message, code: "PAYMENT_NOT_VERIFIED" }, error.status);
      return companyResponse({ error: "Saving this payout is temporarily unavailable. Keep its transaction hash and retry saving; do not send it again.", code: "PAYOUT_VERIFICATION_UNAVAILABLE" }, 503);
    }
    const payout = getCompanyPayoutStore().saveVerified(auth.userId, companyId, {
      from: company.wallet.address, to, amount: body.amount, receiverName: receiverName || undefined, memo, confirmation,
    });
    return companyResponse({ payout });
  } catch (error) { return companyErrorResponse(error); }
}
