import { formatEther } from "ethers";
import type { UnsignedTransactionRequest, SendTransactionModalUIOptions } from "@privy-io/react-auth";

import type { CompanyAccount } from "@/lib/company-types";
import { ETHEREUM_CHAIN_ID, isEthereumTransactionHash, normalizeEthereumAddress, parseEthAmount } from "../../../services/ethereum";

export type CompanyPaymentInput = { to: string; amount: string };
export type CompanyPaymentBroadcast = CompanyPaymentInput & { from: string; transactionHash: string };
export type CompanyPaymentConfirmation = {
  status: "Succeeded" | "Failed" | "Incomplete";
  transactionHash: string;
  blockNumber?: number;
  confirmedAt?: string;
  explorerUrl: string;
};

type SendTransaction = (transaction: UnsignedTransactionRequest, options: {
  address: string;
  uiOptions: SendTransactionModalUIOptions;
}) => Promise<{ hash: string }>;

/** Only the selected company's user-controlled wallet can authorize this request. */
export async function sendCompanyWalletPayment({ company, userId, input, signal, sendTransaction }: {
  company: CompanyAccount;
  userId: string;
  input: CompanyPaymentInput;
  signal: AbortSignal;
  sendTransaction: SendTransaction;
}): Promise<CompanyPaymentBroadcast> {
  signal.throwIfAborted();
  if (company.ownerUserId !== userId) throw new Error("Only the company wallet owner can send this payment.");
  if (company.wallet.status !== "ready" || !company.wallet.address) throw new Error("Finish setting up your company wallet first.");
  const from = normalizeEthereumAddress(company.wallet.address);
  const to = normalizeEthereumAddress(input.to);
  const value = parseEthAmount(input.amount);
  const amount = formatEther(value);
  signal.throwIfAborted();
  const result = await sendTransaction({ from, to, value, data: "0x", chainId: ETHEREUM_CHAIN_ID }, {
    // Omitting this would let Privy select the user's first (possibly personal) wallet.
    address: from,
    uiOptions: {
      showWalletUIs: true,
      isCancellable: true,
      description: `${company.name} · Send ${amount} test ETH on Ethereum Sepolia`,
      buttonText: "Send test ETH",
    },
  });
  // A session can end while Privy is broadcasting. Retain a returned hash: throwing
  // an abort here would hide an already-sent transaction and invite a duplicate.
  if (!isEthereumTransactionHash(result.hash)) throw new Error("Privy did not return a transaction hash. Check the company wallet before trying again.");
  return { from, to, amount, transactionHash: result.hash.toLowerCase() };
}
