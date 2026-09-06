export type CompanyPayoutRecord = {
  id: string;
  companyId: string;
  transactionHash: string;
  from: string;
  to: string;
  amount: string;
  receiverName: string;
  memo: string;
  status: "Succeeded" | "Failed" | "Incomplete";
  createdAt: string;
  updatedAt: string;
  blockNumber?: number;
  confirmedAt?: string;
  explorerUrl: string;
  currency: "ETH";
  network: "Ethereum Sepolia";
};

export type RecordCompanyPayoutInput = {
  transactionHash: string;
  to: string;
  amount: string;
  receiverName?: string;
  memo?: string;
};
