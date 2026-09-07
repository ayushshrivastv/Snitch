import type { CompanyAccount } from "@/lib/company-types";
import { walletSignedExportApproval, type WalletExportApproval } from "@/lib/wallet-export-approval";

export type WalletExportStage = "requesting" | "signing" | "verifying" | "exporting";

type ExportReceipt = {
  approved: boolean;
  companyId: string;
  walletAddress: string;
  approvalId: string;
};

/** The server grants Snitch approval; Privy independently authenticates key export. */
export async function approveCompanyWalletExport({
  company, userId, signal, requestApproval, signMessage, confirmApproval, exportWallet, onStage,
}: {
  company: CompanyAccount;
  userId: string;
  signal: AbortSignal;
  requestApproval: () => Promise<{ approval: WalletExportApproval }>;
  signMessage: (input: { message: string }, options: {
    address: string;
    uiOptions: { showWalletUIs: true; title: string; description: string; buttonText: string };
  }) => Promise<{ signature: string }>;
  confirmApproval: (input: { approvalId: string; signature: string }) => Promise<ExportReceipt>;
  exportWallet: (input: { address: string }) => Promise<void>;
  onStage?: (stage: WalletExportStage) => void;
}) {
  signal.throwIfAborted();
  if (!userId || company.cfoUserId !== userId || company.ownerUserId !== userId) {
    throw new Error("Only this company’s Chief Financial Officer can export its wallet.");
  }
  const address = company.wallet.address;
  if (company.wallet.status !== "ready" || !address) throw new Error("Connect the company wallet before exporting.");

  onStage?.("requesting");
  const { approval } = await requestApproval();
  signal.throwIfAborted();
  if (approval.companyId !== company.id || approval.userId !== userId ||
    approval.walletAddress.toLowerCase() !== address.toLowerCase() ||
    !approval.id || !approval.message || !(Date.parse(approval.expiresAt) > Date.now())) {
    throw new Error("The export request is invalid or has expired. Please try again.");
  }

  onStage?.("signing");
  const { signature } = await signMessage({ message: approval.message }, {
    address,
    uiOptions: {
      showWalletUIs: true,
      title: "Verify CFO access",
      description: "Verify your CFO access to open this company’s wallet export. This is a message signature; no funds move or gas is charged.",
      buttonText: "Verify",
    },
  });
  signal.throwIfAborted();
  if (!(Date.parse(approval.expiresAt) > Date.now())) throw new Error("The export approval expired. Please try again.");
  if (!walletSignedExportApproval(approval.message, signature, address)) {
    throw new Error("The approval was not signed by this company’s wallet.");
  }

  onStage?.("verifying");
  const receipt = await confirmApproval({ approvalId: approval.id, signature });
  signal.throwIfAborted();
  if (receipt.approved !== true || receipt.companyId !== company.id ||
    receipt.approvalId !== approval.id || receipt.walletAddress.toLowerCase() !== address.toLowerCase()) {
    throw new Error("CFO approval could not be verified. Please try again.");
  }
  if (!(Date.parse(approval.expiresAt) > Date.now())) throw new Error("The export approval expired. Please try again.");

  onStage?.("exporting");
  // No key material enters Snitch. Privy displays it inside its protected origin.
  await exportWallet({ address });
  signal.throwIfAborted();
}
