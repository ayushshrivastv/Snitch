import { getAddress, verifyMessage } from "ethers";

export type WalletExportApproval = {
  id: string;
  companyId: string;
  userId: string;
  walletAddress: string;
  message: string;
  expiresAt: string;
};

export function buildWalletExportApprovalMessage({
  companyId,
  companyName,
  walletAddress,
  issuedAt,
  requestId,
  userId,
  expiresAt,
}: {
  companyId: string;
  companyName: string;
  walletAddress: string;
  issuedAt: string;
  requestId: string;
  userId?: string;
  expiresAt?: string;
}): string {
  return [
    "Snitch CFO wallet export approval",
    "",
    `Company: ${companyName}`,
    `Company ID: ${companyId}`,
    ...(userId ? [`CFO user ID: ${userId}`] : []),
    `Wallet: ${getAddress(walletAddress)}`,
    `Issued at: ${issuedAt}`,
    ...(expiresAt ? [`Expires at: ${expiresAt}`] : []),
    `Request ID: ${requestId}`,
    "",
    "Approve opening Privy's private-key export dialog for this company wallet.",
    "This signature does not create a blockchain transaction or spend funds or gas.",
  ].join("\n");
}

export function walletSignedExportApproval(
  message: string,
  signature: string,
  walletAddress: string,
): boolean {
  try {
    return getAddress(verifyMessage(message, signature)) === getAddress(walletAddress);
  } catch {
    return false;
  }
}
