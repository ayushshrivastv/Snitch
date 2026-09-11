import { companyErrorResponse, companyRequestBody, companyResponse } from "@/lib/company-service";
import { getCompanyRecordDeletionStore, type CompanyRecordType } from "@/lib/company-record-deletions";
import { requirePrivyUser } from "@/lib/privy-server";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    const body = await companyRequestBody(request);
    const deletedRecordId = await getCompanyRecordDeletionStore().delete(auth.userId, companyId, {
      type: body.type as CompanyRecordType, recordId: body.recordId,
      invoiceId: body.invoiceId, transactionHash: body.transactionHash,
    });
    return companyResponse({ deletedRecordId });
  } catch (error) { return companyErrorResponse(error); }
}
