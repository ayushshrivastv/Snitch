import { companyErrorResponse, companyResponse } from "@/lib/company-service";
import { CompanyError, getCompanyForUser } from "@/lib/company-store";
import { readEthereumWalletBalance } from "@/lib/ethereum-wallet-balance";
import { requirePrivyUser } from "@/lib/privy-server";
import { ETHEREUM_CHAIN_ID, ETHEREUM_NETWORK_NAME } from "../../../../../../services/ethereum";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    const company = await getCompanyForUser(auth.userId, companyId);
    if (!company) throw new CompanyError("Company not found.", 404, "COMPANY_NOT_FOUND");
    if (company.wallet.status !== "ready" || !company.wallet.address) {
      throw new CompanyError("Finish setting up your company wallet first.", 409, "COMPANY_WALLET_PENDING");
    }
    try {
      const balance = await readEthereumWalletBalance({ address: company.wallet.address, signal: request.signal });
      return companyResponse({ balance, currency: "ETH", network: ETHEREUM_NETWORK_NAME, chainId: ETHEREUM_CHAIN_ID });
    } catch {
      return companyResponse({ balance: null, currency: "ETH", network: ETHEREUM_NETWORK_NAME, chainId: ETHEREUM_CHAIN_ID, error: "Balance is temporarily unavailable." }, 503);
    }
  } catch (error) { return companyErrorResponse(error); }
}
