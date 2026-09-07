import { ETHEREUM_CHAIN_ID, getEthereumExplorerUrl, isEthereumTransactionHash, normalizeEthereumAddress, parseEthAmount } from "../../services/ethereum";
import type { CompanyPaymentConfirmation } from "../components/auth/company-payment-request";

export type CompanyPaymentReader = {
  getNetwork(): Promise<{ chainId: bigint }>;
  getTransaction(hash: string): Promise<{
    hash: string; chainId: bigint; from: string; to: string | null; value: bigint; data: string;
  } | null>;
  getTransactionReceipt(hash: string): Promise<{
    hash: string; from: string; to: string | null; status: number | null; blockNumber: number; blockHash: string;
  } | null>;
  getBlock(blockNumber: number): Promise<{ hash: string; timestamp: number } | null>;
};

export class CompanyPaymentVerificationError extends Error {
  constructor(message: string, public readonly status = 422) {
    super(message);
    this.name = "CompanyPaymentVerificationError";
  }
}

function sameAddress(actual: string | null, expected: string) {
  try { return actual !== null && normalizeEthereumAddress(actual) === expected; }
  catch { return false; }
}

export async function verifyCompanyPayment({ from, to, amount, transactionHash, provider, requireTransaction = false }: {
  from: string; to: string; amount: string; transactionHash: string; provider: CompanyPaymentReader; requireTransaction?: boolean;
}): Promise<CompanyPaymentConfirmation> {
  if (!isEthereumTransactionHash(transactionHash)) throw new CompanyPaymentVerificationError("Provide a valid transaction hash.", 400);
  const sender = normalizeEthereumAddress(from);
  const recipient = normalizeEthereumAddress(to);
  const expectedValue = parseEthAmount(amount);
  const hash = transactionHash.toLowerCase();
  const result = { transactionHash: hash, explorerUrl: getEthereumExplorerUrl(hash) };
  if ((await provider.getNetwork()).chainId !== BigInt(ETHEREUM_CHAIN_ID)) {
    throw new CompanyPaymentVerificationError("Payment confirmation requires Ethereum Sepolia.", 503);
  }
  const [transaction, receipt] = await Promise.all([
    provider.getTransaction(hash), provider.getTransactionReceipt(hash),
  ]);
  if (transaction && (transaction.hash.toLowerCase() !== hash || transaction.chainId !== BigInt(ETHEREUM_CHAIN_ID) ||
    !sameAddress(transaction.from, sender) || !sameAddress(transaction.to, recipient) ||
    transaction.value !== expectedValue || transaction.data !== "0x")) {
    throw new CompanyPaymentVerificationError("This transaction does not match the company wallet, recipient, or ETH amount.");
  }
  if (receipt && (receipt.hash.toLowerCase() !== hash || !sameAddress(receipt.from, sender) || !sameAddress(receipt.to, recipient))) {
    throw new CompanyPaymentVerificationError("This receipt does not match the company payment.");
  }
  if (requireTransaction && !transaction) throw new CompanyPaymentVerificationError("This transaction is not indexed yet. Retry saving this payout; do not send it again.", 409);
  if (!transaction || !receipt || receipt.status === null) return { ...result, status: "Incomplete" };
  if (receipt.status !== 0 && receipt.status !== 1) throw new CompanyPaymentVerificationError("The transaction receipt is not valid.", 503);
  if (!Number.isSafeInteger(receipt.blockNumber) || receipt.blockNumber < 1) throw new CompanyPaymentVerificationError("The transaction block is not available.", 503);
  const block = await provider.getBlock(receipt.blockNumber);
  if (!block || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) return { ...result, status: "Incomplete" };
  if (!Number.isSafeInteger(block.timestamp) || block.timestamp < 1 || block.timestamp > 8640000000000) {
    throw new CompanyPaymentVerificationError("The transaction timestamp is not available.", 503);
  }
  return { ...result, status: receipt.status === 1 ? "Succeeded" : "Failed", blockNumber: receipt.blockNumber, confirmedAt: new Date(block.timestamp * 1000).toISOString() };
}
