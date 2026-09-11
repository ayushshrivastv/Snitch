import { companyErrorResponse, companyResponse } from "@/lib/company-service";
import { CompanyError, getCompanyForUser } from "@/lib/company-store";
import { getInvoiceStore } from "@/lib/invoice-store";
import { reconcileInvoicePayments } from "@/lib/invoice-payment-service";
import { requirePrivyUser } from "@/lib/privy-server";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    if (!await getCompanyForUser(auth.userId, companyId)) throw new CompanyError("Company not found.", 404, "COMPANY_NOT_FOUND");
    const invoices = await getInvoiceStore().listForCompany(auth.userId, companyId);
    const states = await reconcileInvoicePayments(invoices.filter(invoice => !invoice.payment).map(invoice => invoice.id));
    return companyResponse({ invoices: invoices.map(invoice => {
      const state = states.get(invoice.id);
      return state?.payment ? { ...invoice, status: state.status, payment: state.payment } : invoice;
    }) });
  } catch (error) { return companyErrorResponse(error); }
}
