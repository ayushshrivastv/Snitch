import { companyErrorResponse, companyRequestBody, companyResponse, confirmWalletExportApproval, requestWalletExportApproval } from "@/lib/company-service";
import { requirePrivyUser } from "@/lib/privy-server";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    return companyResponse({ approval: await requestWalletExportApproval(auth.userId, companyId) }, 201);
  } catch (error) { return companyErrorResponse(error); }
}

export async function PUT(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    return companyResponse(await confirmWalletExportApproval(auth.userId, companyId, await companyRequestBody(request)));
  } catch (error) { return companyErrorResponse(error); }
}
