import { companyErrorResponse, companyRequestBody, companyResponse, getCompaniesWithWalletCandidates, reserveCompany } from "@/lib/company-service";
import { requirePrivyUser } from "@/lib/privy-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    return companyResponse({ companies: await getCompaniesWithWalletCandidates(auth.userId) });
  } catch (error) { return companyErrorResponse(error); }
}

export async function POST(request: Request) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { company, created } = await reserveCompany(auth.userId, await companyRequestBody(request));
    return companyResponse({ company }, created ? 201 : 200);
  } catch (error) { return companyErrorResponse(error); }
}
