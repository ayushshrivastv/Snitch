export type CompanyAccount = {
  id: string;
  name: string;
  purpose: "company" | "playground";
  ownerUserId: string;
  /** Server-assigned export authority; never inferred from editable team labels. */
  cfoUserId: string | null;
  createdAt: string;
  updatedAt: string;
  wallet: {
    status: "pending" | "ready";
    address?: string;
    privyWalletId?: string;
  };
  baselineWalletAddresses: string[];
  walletCandidateAddress?: string;
  walletProvisioningError?: string;
};
