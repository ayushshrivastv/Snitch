import { companyErrorResponse, companyResponse } from "@/lib/company-service";
import { CompanyError, getCompanyForUser } from "@/lib/company-store";
import { getInvoiceStore } from "@/lib/invoice-store";
import { requirePrivyUser } from "@/lib/privy-server";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    if (!getCompanyForUser(auth.userId, companyId)) throw new CompanyError("Company not found.", 404, "COMPANY_NOT_FOUND");
    return companyResponse({ invoices: getInvoiceStore().listForCompany(auth.userId, companyId) });
  } catch (error) { return companyErrorResponse(error); }
}
