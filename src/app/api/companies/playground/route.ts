import { companyErrorResponse, companyResponse, reservePlaygroundCompany } from "@/lib/company-service";
import { requirePrivyUser } from "@/lib/privy-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    // Recover the existing treasury only after the original CFO and wallet are verified.
    const { company, created } = await reservePlaygroundCompany(auth.userId);
    return companyResponse({ company }, created ? 201 : 200);
  } catch (error) { return companyErrorResponse(error); }
}
