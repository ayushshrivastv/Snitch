import { companyErrorResponse, companyRequestBody, companyResponse } from "@/lib/company-service";
import { getCompanyStore, validateCompanyName } from "@/lib/company-store";
import { requirePrivyUser } from "@/lib/privy-server";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    const name = validateCompanyName((await companyRequestBody(request)).name);
    return companyResponse({ company: getCompanyStore().rename(auth.userId, companyId, name) });
  } catch (error) { return companyErrorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    const company = getCompanyStore().deleteForUser(auth.userId, companyId);
    return companyResponse({ deletedCompanyId: company.id });
  } catch (error) { return companyErrorResponse(error); }
}
