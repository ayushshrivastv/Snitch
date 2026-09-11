import { readEthereumWalletBalance } from "@/lib/ethereum-wallet-balance";
import { SHOWCASE_COMPANY } from "@/lib/showcase-company";
import { ETHEREUM_CHAIN_ID, ETHEREUM_CURRENCY, ETHEREUM_NETWORK_NAME } from "../../../../../services/ethereum";

export const runtime = "nodejs";

// This fixed public address can be viewed without company storage or a signing session.
// Private company wallets continue to use the authenticated company balance route.
export async function GET(request: Request) {
  const details = {
    address: SHOWCASE_COMPANY.walletAddress,
    currency: ETHEREUM_CURRENCY,
    network: ETHEREUM_NETWORK_NAME,
    chainId: ETHEREUM_CHAIN_ID,
  };
  const headers = { "Cache-Control": "no-store" };
  try {
    const balance = await readEthereumWalletBalance({
      address: SHOWCASE_COMPANY.walletAddress,
      signal: request.signal,
    });
    return Response.json({ ...details, balance }, { headers });
  } catch {
    return Response.json({
      ...details,
      balance: null,
      error: "Balance is temporarily unavailable.",
    }, { status: 503, headers });
  }
}
