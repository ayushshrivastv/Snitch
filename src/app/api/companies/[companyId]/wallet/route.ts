import { bindCompanyWallet, companyErrorResponse, companyRequestBody, companyResponse } from "@/lib/company-service";
import { requirePrivyUser } from "@/lib/privy-server";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    const { address } = await companyRequestBody(request);
    return companyResponse({ company: await bindCompanyWallet(auth.userId, companyId, address) });
  } catch (error) { return companyErrorResponse(error); }
}
