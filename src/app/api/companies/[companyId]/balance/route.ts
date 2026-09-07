import { formatEther } from "ethers";

import { companyErrorResponse, companyResponse } from "@/lib/company-service";
import { CompanyError, getCompanyForUser } from "@/lib/company-store";
import { requirePrivyUser } from "@/lib/privy-server";
import { ETHEREUM_CHAIN_ID, ETHEREUM_NETWORK_NAME, ETHEREUM_RPC_URL } from "../../../../../../services/ethereum";

export const runtime = "nodejs";

async function rpc(method: string, params: unknown[]): Promise<string> {
  const response = await fetch(process.env.ETHEREUM_RPC_URL || ETHEREUM_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("RPC unavailable");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || "error" in body || !("result" in body) || typeof body.result !== "string" || !/^0x[0-9a-f]+$/i.test(body.result)) {
    throw new Error("Invalid RPC response");
  }
  return body.result;
}

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const auth = await requirePrivyUser(request);
  if ("response" in auth) return auth.response;
  try {
    const { companyId } = await context.params;
    const company = getCompanyForUser(auth.userId, companyId);
    if (!company) throw new CompanyError("Company not found.", 404, "COMPANY_NOT_FOUND");
    if (company.wallet.status !== "ready" || !company.wallet.address) {
      throw new CompanyError("Finish setting up your company wallet first.", 409, "COMPANY_WALLET_PENDING");
    }
    try {
      if (BigInt(await rpc("eth_chainId", [])) !== BigInt(ETHEREUM_CHAIN_ID)) throw new Error("Wrong chain");
      const balance = formatEther(BigInt(await rpc("eth_getBalance", [company.wallet.address, "latest"])));
      return companyResponse({ balance, currency: "ETH", network: ETHEREUM_NETWORK_NAME, chainId: ETHEREUM_CHAIN_ID });
    } catch {
      return companyResponse({ balance: null, currency: "ETH", network: ETHEREUM_NETWORK_NAME, chainId: ETHEREUM_CHAIN_ID, error: "Balance is temporarily unavailable." }, 503);
    }
  } catch (error) { return companyErrorResponse(error); }
}
