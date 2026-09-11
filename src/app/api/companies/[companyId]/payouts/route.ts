import { companyErrorResponse, companyRequestBody, companyResponse } from "@/lib/company-service";
import { CompanyError, getCompanyForUser } from "@/lib/company-store";
import { getCompanyPayoutStore } from "@/lib/company-payout-store";
import { createCompanyPaymentReader } from "@/lib/company-payment-reader";
import { CompanyPaymentVerificationError, verifyCompanyPayment } from "@/lib/company-payment-verification";
import { requirePrivyUser } from "@/lib/privy-server";
import { listRefreshedCompanyPayouts, parseCompanyPayoutInput } from "@/lib/company-payout-service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    if (!await getCompanyForUser(auth.userId, companyId)) throw new CompanyError("Company not found.", 404, "COMPANY_NOT_FOUND");
    return companyResponse({ payouts: await listRefreshedCompanyPayouts(auth.userId, companyId) });
  } catch (error) { return companyErrorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    const company = await getCompanyForUser(auth.userId, companyId);
    if (!company) throw new CompanyError("Company not found.", 404, "COMPANY_NOT_FOUND");
    if (company.wallet.status !== "ready" || !company.wallet.address) throw new CompanyError("Finish setting up your company wallet first.", 409, "COMPANY_WALLET_PENDING");
    const payment = parseCompanyPayoutInput(await companyRequestBody(request));
    // Commit the broadcast hint before waiting on the chain. A client disconnect
    // or RPC timeout must not lose recovery for an already-sent transaction.
    const submitted = await getCompanyPayoutStore().saveSubmission(auth.userId, companyId, { from: company.wallet.address, ...payment });
    let confirmation;
    try {
      confirmation = await verifyCompanyPayment({
        from: company.wallet.address, ...payment,
        provider: createCompanyPaymentReader(AbortSignal.timeout(8000)), requireTransaction: true,
      });
    } catch (error) {
      if (error instanceof CompanyPaymentVerificationError && error.status < 500 && error.status !== 409) {
        await getCompanyPayoutStore().discardSubmission(auth.userId, companyId, payment.transactionHash);
        return companyResponse({ error: error.message, code: "PAYMENT_NOT_VERIFIED" }, error.status);
      }
      const payout = await getCompanyPayoutStore().findForCompany(auth.userId, companyId, payment.transactionHash) ?? submitted;
      return companyResponse({ payout });
    }
    const payout = await getCompanyPayoutStore().saveVerified(auth.userId, companyId, {
      from: company.wallet.address, ...payment, confirmation,
    });
    return companyResponse({ payout });
  } catch (error) { return companyErrorResponse(error); }
}
