import {
  getAddress,
  hexlify,
  JsonRpcProvider,
  parseEther,
  toQuantity,
  toUtf8Bytes,
  ZeroAddress,
} from "ethers";

export const ETHEREUM_CHAIN_ID = 11155111;
export const ETHEREUM_NETWORK_NAME = "Ethereum Sepolia";
export const ETHEREUM_CURRENCY = "ETH";
export const TEST_INVOICE_AMOUNT_ETH = "0.001";
export const ETHEREUM_RPC_URL =
  process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";
export const ETHEREUM_TREASURY_ADDRESS =
  process.env.NEXT_PUBLIC_ETHEREUM_TREASURY_ADDRESS || undefined;

export type EthereumWallet = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export function normalizeEthereumAddress(value: string): string {
  const address = getAddress(value.trim());
  if (address === ZeroAddress) {
    throw new Error("The zero address cannot receive invoice payments.");
  }
  return address;
}

export function parseEthAmount(value: string): bigint {
  const amount = value.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(amount)) {
    throw new Error("Enter an ETH amount with at most 18 decimal places.");
  }
  const wei = parseEther(amount);
  if (wei <= BigInt(0)) {
    throw new Error("The ETH amount must be greater than zero.");
  }
  return wei;
}

export function isEthereumTransactionHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function getEthereumExplorerUrl(transactionHash: string): string {
  if (!isEthereumTransactionHash(transactionHash)) {
    throw new Error("Invalid Ethereum transaction hash.");
  }
  return `https://sepolia.etherscan.io/tx/${transactionHash}`;
}

export function getInvoicePaymentData(invoiceId: string): string {
  if (!invoiceId || invoiceId.length > 128) {
    throw new Error("Invalid invoice reference.");
  }
  return hexlify(toUtf8Bytes(`snitchpay:${invoiceId}`));
}

function errorCode(error: unknown): unknown {
  return error && typeof error === "object" && "code" in error
    ? error.code
    : undefined;
}

export async function sendEthPayment({
  to,
  amount,
  invoiceId,
  wallet = typeof window === "undefined"
    ? undefined
    : (window as Window & { ethereum?: EthereumWallet }).ethereum,
}: {
  to: string;
  amount: string;
  invoiceId?: string;
  wallet?: EthereumWallet;
}): Promise<{ transactionHash: string; payer: string }> {
  const recipient = normalizeEthereumAddress(to);
  const value = parseEthAmount(amount);
  const data = invoiceId ? getInvoicePaymentData(invoiceId) : "0x";
  if (!wallet) {
    throw new Error("Connect an Ethereum wallet such as MetaMask to pay with test ETH.");
  }

  const chainId = toQuantity(ETHEREUM_CHAIN_ID);
  if ((await wallet.request({ method: "eth_chainId" })) !== chainId) {
    try {
      await wallet.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId }],
      });
    } catch (error) {
      if (errorCode(error) !== 4902) throw error;
      await wallet.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId,
          chainName: ETHEREUM_NETWORK_NAME,
          nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [ETHEREUM_RPC_URL],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        }],
      });
      await wallet.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId }],
      });
    }
  }

  const accounts = await wallet.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
    throw new Error("No Ethereum account is connected.");
  }
  const payer = normalizeEthereumAddress(accounts[0]);
  // Re-check immediately before sending: the wallet can change networks while connecting.
  if ((await wallet.request({ method: "eth_chainId" })) !== chainId) {
    throw new Error("Switch your wallet to Ethereum Sepolia before paying.");
  }
  const transactionHash = await wallet.request({
    method: "eth_sendTransaction",
    params: [{ from: payer, to: recipient, value: toQuantity(value), data, chainId }],
  });
  if (!isEthereumTransactionHash(transactionHash)) {
    throw new Error("The wallet did not return a valid transaction hash. Check your wallet before retrying.");
  }
  return { transactionHash: transactionHash.toLowerCase(), payer };
}

export function getEthereumProvider(): JsonRpcProvider {
  return new JsonRpcProvider(
    process.env.ETHEREUM_RPC_URL || ETHEREUM_RPC_URL,
    ETHEREUM_CHAIN_ID,
    { batchMaxCount: 1 },
  );
}

export type EthereumPaymentReader = {
  getNetwork(): Promise<{ chainId: bigint }>;
  getTransaction(hash: string): Promise<{
    hash: string;
    chainId: bigint;
    from: string;
    to: string | null;
    value: bigint;
    data: string;
  } | null>;
  getTransactionReceipt(hash: string): Promise<{
    hash: string;
    status: number | null;
    blockNumber: number;
  } | null>;
};

export class PaymentVerificationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = "payment_not_verified",
  ) {
    super(message);
    this.name = "PaymentVerificationError";
  }
}

export async function verifyEthPayment({
  invoice,
  transactionHash,
  provider,
}: {
  invoice: { id: string; amount: string; treasury: string; chainId: number };
  transactionHash: string;
  provider: EthereumPaymentReader;
}): Promise<{ payer: string; treasury: string; blockNumber: number }> {
  if (!isEthereumTransactionHash(transactionHash)) {
    throw new PaymentVerificationError("Invalid Ethereum transaction hash.", 400);
  }
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(ETHEREUM_CHAIN_ID) || invoice.chainId !== ETHEREUM_CHAIN_ID) {
    throw new PaymentVerificationError("Payment verification requires Ethereum Sepolia.", 503);
  }
  const [transaction, receipt] = await Promise.all([
    provider.getTransaction(transactionHash),
    provider.getTransactionReceipt(transactionHash),
  ]);
  if (!transaction || !receipt) {
    throw new PaymentVerificationError("The transaction is not confirmed yet. Check its status again shortly.", 202);
  }
  if (receipt.status === 0) {
    throw new PaymentVerificationError("The Ethereum transaction reverted. You can submit a new payment.", 422, "transaction_reverted");
  }
  if (receipt.status !== 1) {
    throw new PaymentVerificationError("The transaction receipt is not confirmed yet.", 202);
  }
  const treasury = normalizeEthereumAddress(invoice.treasury);
  if (
    transaction.hash.toLowerCase() !== transactionHash.toLowerCase() ||
    receipt.hash.toLowerCase() !== transactionHash.toLowerCase() ||
    transaction.chainId !== BigInt(ETHEREUM_CHAIN_ID) ||
    !transaction.to ||
    normalizeEthereumAddress(transaction.to) !== treasury ||
    transaction.value !== parseEthAmount(invoice.amount) ||
    transaction.data.toLowerCase() !== getInvoicePaymentData(invoice.id)
  ) {
    throw new PaymentVerificationError("This transaction does not match the invoice's recipient, ETH amount, or reference.", 422);
  }
  return { payer: normalizeEthereumAddress(transaction.from), treasury, blockNumber: receipt.blockNumber };
}
