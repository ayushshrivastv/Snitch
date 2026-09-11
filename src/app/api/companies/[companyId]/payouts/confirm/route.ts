import { companyErrorResponse, companyRequestBody, companyResponse } from "@/lib/company-service";
import { CompanyError, getCompanyForUser } from "@/lib/company-store";
import { CompanyPaymentVerificationError, verifyCompanyPayment } from "@/lib/company-payment-verification";
import { requirePrivyUser } from "@/lib/privy-server";
import { parseEthAmount } from "../../../../../../../services/ethereum";
import { parseCompanyPayoutInput } from "@/lib/company-payout-service";
import type { CompanyPayoutRecord } from "@/lib/company-payout-types";

import { createCompanyPaymentReader } from "@/lib/company-payment-reader";
import { getCompanyPayoutStore } from "@/lib/company-payout-store";

export const runtime = "nodejs";

function confirmationResponse(payout: CompanyPayoutRecord) {
  return companyResponse({ status: payout.status, transactionHash: payout.transactionHash, explorerUrl: payout.explorerUrl,
    ...(payout.blockNumber === undefined ? {} : { blockNumber: payout.blockNumber }),
    ...(payout.confirmedAt === undefined ? {} : { confirmedAt: payout.confirmedAt }),
  });
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
    const stored = await getCompanyPayoutStore().findForCompany(auth.userId, companyId, payment.transactionHash);
    if (stored && (stored.to !== payment.to || parseEthAmount(stored.amount) !== parseEthAmount(payment.amount))) {
      throw new CompanyError("This transaction is already recorded with different payout details.", 409, "PAYOUT_CONFLICT");
    }
    if (stored && stored.status !== "Incomplete") return confirmationResponse(stored);
    const submission = stored ? undefined : await getCompanyPayoutStore().findSubmissionForCompany(auth.userId, companyId, payment.transactionHash);
    if (submission && (submission.payout.to !== payment.to || parseEthAmount(submission.payout.amount) !== parseEthAmount(payment.amount))) {
      throw new CompanyError("This transaction is already recorded with different payout details.", 409, "PAYOUT_CONFLICT");
    }
    if (submission && submission.nextCheckAt > new Date().toISOString()) return confirmationResponse(submission.payout);
    let confirmation;
    try {
      confirmation = await verifyCompanyPayment({ from: company.wallet.address, ...payment, provider: createCompanyPaymentReader(AbortSignal.timeout(8000)), requireTransaction: true });
    } catch (error) {
      if (error instanceof CompanyPaymentVerificationError && error.status < 500 && error.status !== 409) {
        await getCompanyPayoutStore().discardSubmission(auth.userId, companyId, payment.transactionHash);
        return companyResponse({ error: error.message, code: "PAYMENT_NOT_VERIFIED" }, error.status);
      }
      const payout = await getCompanyPayoutStore().saveSubmission(auth.userId, companyId, { from: company.wallet.address, ...payment });
      await getCompanyPayoutStore().deferSubmission(auth.userId, companyId, payment.transactionHash);
      return confirmationResponse(payout);
    }
    const payout = await getCompanyPayoutStore().saveVerified(auth.userId, companyId, { from: company.wallet.address, ...payment, confirmation });
    return confirmationResponse(payout);
  } catch (error) { return companyErrorResponse(error); }
}
