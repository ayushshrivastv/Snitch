"use client";

import Image from "next/image";
import { getAddress } from "ethers";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";

import { Button } from "@/components/ui/button";
import { CreatePaymentDialog as CreatePaymentModal, type CreatedPaymentInput } from "@/components/payments/create-payment-dialog";
import { CreatePayoutDialog as CreatePayoutModal, type CreatedPayoutInput } from "@/components/payments/create-payout-dialog";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useWorkspaceSession } from "@/components/auth/workspace-session";
import { useCompanyWallets } from "@/components/auth/company-wallet-provider";
import { CompanyTreasuryPanel } from "@/components/auth/company-treasury-panel";
import { WalletPage } from "@/components/wallets/wallet-page";
import { ShowcaseTreasuryPanel } from "@/components/wallets/showcase-treasury-panel";
import { SHOWCASE_COMPANY } from "@/lib/showcase-company";
import type { WalletActivity } from "@/lib/wallet-activity";
import { formatRecordDateTime, formatSavedRecordDate } from "@/lib/record-date";
import { resolveWalletCompany } from "@/lib/company-selection";
import { requestCompanyWallet } from "@/components/auth/company-wallet-request";
import { readPendingCompanyPayouts, rememberPendingCompanyPayout, forgetPendingCompanyPayout, type PendingCompanyPayout } from "@/lib/pending-company-payouts";
import type { Invoice } from "@/lib/invoices";
import type { ConfirmedInvoicePayment } from "@/lib/payment-confirmations";
import { blockchainAddressUrl, formatBlockchainDate, getShowcaseTransfer, type ShowcaseTransfer } from "@/lib/showcase-blockchain";
import { PLAYGROUND_TREASURY_ADDRESS, showcasePayoutWallets } from "@/lib/showcase-payout-wallets";
import { SnitchLandingPage } from "@/components/landing/landing-page";
import {
  ETHEREUM_NETWORK_NAME,
  getEthereumExplorerUrl,
  TEST_INVOICE_AMOUNT_ETH,
} from "../../services/ethereum";

import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  Building2,
  Check,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  KeyRound,
  LogOut,
  Hash,
  MoreHorizontal,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

type NavItem =
  | "Dashboard"
  | "Transactions"
  | "Payouts"
  | "Wallets"
  | "Connect"
  | "Compliance"
  | "API Keys";

type StatusTone = "success" | "warning" | "danger" | "incomplete" | "neutral";

type PaymentStatus = "Succeeded" | "Failed" | "Incomplete";

type TransactionStatus =
  | "Succeeded"
  | "Failed"
  | "Incomplete"
  | "Refunded"
  | "Disputed";

type NetworkName = "Ethereum Sepolia";

type DisplayNetwork = NetworkName | "Base Sepolia";

type AssetSymbol = "ETH";

type TransactionFilter =
  | "All"
  | "Succeeded"
  | "Refunded"
  | "Disputed";

type Payment = {
  saved?: boolean;
  memo?: string;
  walletCompanyId?: string;
  transactionHash?: string;
  confirmedAt?: string;
  confirmedBlock?: number;
  blockchain?: ShowcaseTransfer;
  id: string;
  time: string;
  dateTime: string;
  senderToken: AssetSymbol;
  senderAmount: string;
  receiverCurrency: string;
  receiverAmount: string;
  receiver: string;
  company: string;
  country: string;
  exchangeRate: string;
  payoutMethod: string;
  payoutKeyLabel: string;
  payoutKey: string;
  network: DisplayNetwork;
  address: string;
  status: PaymentStatus;
};

type Transaction = {
  confirmedPayment?: ConfirmedInvoicePayment;
  walletCompanyId?: string;
  blockchain?: ShowcaseTransfer;
  id: string;
  companyId?: string;
  amount: string;
  currency: AssetSymbol;
  network?: DisplayNetwork;
  dateTime: string;
  description: string;
  customerName?: string;
  invoiceId?: string;
  invoiceTitle?: string;
  memo?: string;
  dueDate?: string;
  paymentTerms?: string;
  treasuryAccount?: string;
  status: TransactionStatus;
};

type AccessRole =
  | "CFO"
  | "Administrator"
  | "IAM Administrator"
  | "Developer"
  | "Analyst"
  | "Transfer Analyst"
  | "Support Specialist"
  | "Support Associate"
  | "Support Communications"
  | "View only";

type AccessMember = {
  id: string;
  name: string;
  email: string;
  role: AccessRole;
  protected?: boolean;
};

const accessRoles: AccessRole[] = [
  "CFO",
  "Administrator",
  "IAM Administrator",
  "Developer",
  "Analyst",
  "Transfer Analyst",
  "Support Specialist",
  "Support Associate",
  "Support Communications",
  "View only",
];

const accessRoleDetails: Record<AccessRole, string> = {
  CFO: "Chief Financial Officer · approves wallet export.",
  Administrator: "Manage company operations and team access.",
  "IAM Administrator": "Manage members and roles.",
  Developer: "Manage API keys and integrations.",
  Analyst: "View balances and reports.",
  "Transfer Analyst": "Prepare and review payouts.",
  "Support Specialist": "Inspect support payment records.",
  "Support Associate": "View limited support records.",
  "Support Communications": "Send payment support messages.",
  "View only": "Read-only wallet access.",
};

type CompanyInstance = {
  id: string;
  name: string;
  initials: string;
  receivers: string;
  status: string;
  statusTone: StatusTone;
  activity: string;
  createdAt: string;
  treasuryAddress?: string;
  walletStatus?: "pending" | "ready";
};

type ApiKeyRecord = {
  id: string;
  accountId: string;
  name: string;
  status: string;
  trackingId: string;
  publishableKey: string;
  secretKey: string;
  secretKeyValue: string;
  lastUsed: string;
  created: string;
  createdBy: string;
  permissions: string;
};

const navItems: Array<{
  label: NavItem;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { label: "Dashboard", icon: DashboardNavIcon },
  { label: "Transactions", icon: ArrowLeftRight },
  { label: "Payouts", icon: PayoutNavIcon },
  { label: "Wallets", icon: WalletNavIcon },
  { label: "Connect", icon: UserRound },
  { label: "Compliance", icon: ShieldCheck },
  { label: "API Keys", icon: KeyRound },
];

const demoUser = {
  name: "Ayush Srivastava",
  initials: "AS",
};

const DEMO_COMPANY_ID = "inst_final_snitch";

const initialInstances: CompanyInstance[] = [
  {
    id: "inst_final_snitch",
    name: "Snitchpay.co",
    initials: "SC",
    receivers: "18 receivers",
    status: "Playground",
    statusTone: "success" as StatusTone,
    activity: "",
    createdAt: "September 10, 2026",
  },
];

const legacyDemoAccountIds = new Set([
  "inst_cineintosh",
  "inst_blackin",
  "inst_atlas",
]);

const initialApiKeys: ApiKeyRecord[] = [
  {
    id: "key_1vfy35y2spLEjgV7",
    accountId: "inst_final_snitch",
    name: "Snitchpay.co server",
    status: "Active",
    trackingId: "key_1vfy35y2spLEjgV7",
    publishableKey: "pk_live_SnitchF1n4l9x7Vh2pQ8sLm6N0aYc3dE",
    secretKey: "sk-...6QUA",
    secretKeyValue: "snitch_secret_demo_1vfy35y2spLEjgV7_6QUA",
    lastUsed: "May 6, 2026",
    created: "May 6, 2026",
    createdBy: "Ayush Srivastava",
    permissions: "All",
  },
];

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function DashboardNavIcon({
  className,
  strokeWidth = 2.2,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
    >
      <rect x="4.5" y="4.5" width="15" height="15" rx="1.4" />
      <path d="M9.2 4.5v15" />
      <path d="M4.5 9.2h15" />
    </svg>
  );
}

function WalletNavIcon({
  className,
  strokeWidth = 2.2,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
    >
      <path d="M7.4 7.4 12.6 3l3.2 4.4" />
      <path d="M10.4 7.4 17.6 5l1.1 2.4" />
      <path d="M4.8 7.4h12.9a3 3 0 0 1 3 3v6.2a3 3 0 0 1-3 3H4.8a3 3 0 0 1-3-3v-6.2a3 3 0 0 1 3-3Z" />
      <path d="M15.2 12h4.2a1.8 1.8 0 0 1 1.8 1.8v1.4a1.8 1.8 0 0 1-1.8 1.8h-4.2a1.8 1.8 0 0 1-1.8-1.8v-1.4a1.8 1.8 0 0 1 1.8-1.8Z" />
      <path d="M16.3 14.5h.1" />
    </svg>
  );
}

function PayoutNavIcon({
  className,
  strokeWidth = 2.2,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      aria-hidden="true"
    >
      <path d="M3.2 8.2h17.6a1.7 1.7 0 0 1 1.7 1.7v7.2a1.7 1.7 0 0 1-1.7 1.7H3.2a1.7 1.7 0 0 1-1.7-1.7V9.9a1.7 1.7 0 0 1 1.7-1.7Z" />
      <path d="M4.8 11.2a2.7 2.7 0 0 0 2.7-2.7" />
      <path d="M16.5 8.5a2.7 2.7 0 0 0 2.7 2.7" />
      <path d="M19.2 15.8a2.7 2.7 0 0 0-2.7 2.7" />
      <path d="M7.5 18.5a2.7 2.7 0 0 0-2.7-2.7" />
      <path d="M7.2 12h2.3" />
      <path d="M7.2 15h2.3" />
      <path d="M14.5 12h2.3" />
      <path d="M14.5 15h2.3" />
      <circle cx="12" cy="13.5" r="3.5" />
      <path d="m9.8 13.4 1.5 1.5 3-3.3" />
    </svg>
  );
}

const snitchpayTreasuryWallet = PLAYGROUND_TREASURY_ADDRESS;

const payments: Payment[] = [
  {
    id: "PO_8B29A1F72C90",
    time: "11:17 PM",
    dateTime: "September 12, 2026, 11:17 PM",
    senderToken: "ETH",
    senderAmount: "0.124",
    receiverCurrency: "ETH",
    receiverAmount: "0.124",
    receiver: "Sophia Mendes",
    company: "Luma Comercio",
    country: "Brazil",
    exchangeRate: "1",
    payoutMethod: "ETH transfer",
    payoutKeyLabel: "Receiver Wallet",
    payoutKey: "0x0000000000000000000000000000000000000002",
    network: "Ethereum Sepolia",
    address: snitchpayTreasuryWallet,
    status: "Succeeded",
  },
  {
    id: "PO_C14E7D8A92F3",
    time: "10:21 PM",
    dateTime: "September 12, 2026, 10:21 PM",
    senderToken: "ETH",
    senderAmount: "0.00724",
    receiverCurrency: "ETH",
    receiverAmount: "0.00724",
    receiver: "Mateo Alvarez",
    company: "Rio Plata Imports",
    country: "Argentina",
    exchangeRate: "1",
    payoutMethod: "ETH transfer",
    payoutKeyLabel: "Receiver Wallet",
    payoutKey: "0x0000000000000000000000000000000000000003",
    network: "Base Sepolia",
    address: snitchpayTreasuryWallet,
    status: "Succeeded",
  },
  {
    id: "PO_7DA0E4B19C66",
    time: "10:09 PM",
    dateTime: "September 11, 2026, 10:09 PM",
    senderToken: "ETH",
    senderAmount: "0.098",
    receiverCurrency: "ETH",
    receiverAmount: "0.098",
    receiver: "Olivia Chen",
    company: "Maple North Goods",
    country: "Canada",
    exchangeRate: "1",
    payoutMethod: "ETH transfer",
    payoutKeyLabel: "Receiver Wallet",
    payoutKey: "0x0000000000000000000000000000000000000004",
    network: "Base Sepolia",
    address: snitchpayTreasuryWallet,
    status: "Failed",
  },
  {
    id: "PO_2F5BD907A118",
    time: "10:09 PM",
    dateTime: "September 11, 2026, 10:09 PM",
    senderToken: "ETH",
    senderAmount: "0.041575",
    receiverCurrency: "ETH",
    receiverAmount: "0.041575",
    receiver: "Camila Torres",
    company: "Norte Retail",
    country: "Mexico",
    exchangeRate: "1",
    payoutMethod: "ETH transfer",
    payoutKeyLabel: "Receiver Wallet",
    payoutKey: "0x0000000000000000000000000000000000000005",
    network: "Ethereum Sepolia",
    address: snitchpayTreasuryWallet,
    status: "Incomplete",
  },
  {
    id: "PO_D4E8C3FA7019",
    time: "9:52 PM",
    dateTime: "September 11, 2026, 9:52 PM",
    senderToken: "ETH",
    senderAmount: "0.076",
    receiverCurrency: "ETH",
    receiverAmount: "0.076",
    receiver: "James Walker",
    company: "Albion Studio",
    country: "United Kingdom",
    exchangeRate: "1",
    payoutMethod: "ETH transfer",
    payoutKeyLabel: "Receiver Wallet",
    payoutKey: "0x0000000000000000000000000000000000000006",
    network: "Ethereum Sepolia",
    address: snitchpayTreasuryWallet,
    status: "Incomplete",
  },
  {
    id: "PO_68AB1C32D4F0",
    time: "9:52 PM",
    dateTime: "September 11, 2026, 9:52 PM",
    senderToken: "ETH",
    senderAmount: "0.025",
    receiverCurrency: "ETH",
    receiverAmount: "0.025",
    receiver: "Ines Ferreira",
    company: "Porto Medical",
    country: "Brazil",
    exchangeRate: "1",
    payoutMethod: "ETH transfer",
    payoutKeyLabel: "Receiver Wallet",
    payoutKey: "0x0000000000000000000000000000000000000007",
    network: "Base Sepolia",
    address: snitchpayTreasuryWallet,
    status: "Succeeded",
  },
  {
    id: "PO_9C31F0E74B26",
    time: "9:48 PM",
    dateTime: "September 10, 2026, 9:48 PM",
    senderToken: "ETH",
    senderAmount: "0.01885",
    receiverCurrency: "ETH",
    receiverAmount: "0.01885",
    receiver: "Lucas Rojas",
    company: "Andes Supply",
    country: "Chile",
    exchangeRate: "1",
    payoutMethod: "ETH transfer",
    payoutKeyLabel: "Receiver Wallet",
    payoutKey: "0x0000000000000000000000000000000000000008",
    network: "Base Sepolia",
    address: snitchpayTreasuryWallet,
    status: "Incomplete",
  },
  {
    id: "PO_5E72A9C0D334",
    time: "9:48 PM",
    dateTime: "September 10, 2026, 9:48 PM",
    senderToken: "ETH",
    senderAmount: "0.054",
    receiverCurrency: "ETH",
    receiverAmount: "0.054",
    receiver: "Aisha Khan",
    company: "Dune Logistics",
    country: "UAE",
    exchangeRate: "1",
    payoutMethod: "ETH transfer",
    payoutKeyLabel: "Receiver Wallet",
    payoutKey: "0x0000000000000000000000000000000000000009",
    network: "Ethereum Sepolia",
    address: snitchpayTreasuryWallet,
    status: "Succeeded",
  },
  {
    id: "PO_4A86BE011F92",
    time: "9:46 PM",
    dateTime: "September 10, 2026, 9:46 PM",
    senderToken: "ETH",
    senderAmount: "0.03",
    receiverCurrency: "ETH",
    receiverAmount: "0.03",
    receiver: "Emma Dubois",
    company: "Seine Atelier",
    country: "France",
    exchangeRate: "1",
    payoutMethod: "ETH transfer",
    payoutKeyLabel: "Receiver Wallet",
    payoutKey: "0x0000000000000000000000000000000000000010",
    network: "Ethereum Sepolia",
    address: snitchpayTreasuryWallet,
    status: "Incomplete",
  },
  {
    id: "PO_6F3AD5B98210",
    time: "9:46 PM",
    dateTime: "September 10, 2026, 9:46 PM",
    senderToken: "ETH",
    senderAmount: "0.0042",
    receiverCurrency: "ETH",
    receiverAmount: "0.0042",
    receiver: "Noah Sato",
    company: "Kanda Parts",
    country: "Japan",
    exchangeRate: "1",
    payoutMethod: "ETH transfer",
    payoutKeyLabel: "Receiver Wallet",
    payoutKey: "0x0000000000000000000000000000000000000011",
    network: "Base Sepolia",
    address: snitchpayTreasuryWallet,
    status: "Succeeded",
  },
  {
    id: "PO_B8D24E37CA55",
    time: "9:46 PM",
    dateTime: "September 10, 2026, 9:46 PM",
    senderToken: "ETH",
    senderAmount: "0.105",
    receiverCurrency: "ETH",
    receiverAmount: "0.105",
    receiver: "Rafael Costa",
    company: "Verde Foods",
    country: "Brazil",
    exchangeRate: "1",
    payoutMethod: "ETH transfer",
    payoutKeyLabel: "Receiver Wallet",
    payoutKey: "0x0000000000000000000000000000000000000012",
    network: "Ethereum Sepolia",
    address: snitchpayTreasuryWallet,
    status: "Failed",
  },
  {
    id: "PO_E51C892DF604",
    time: "9:42 PM",
    dateTime: "September 9, 2026, 9:42 PM",
    senderToken: "ETH",
    senderAmount: "0.01253",
    receiverCurrency: "ETH",
    receiverAmount: "0.01253",
    receiver: "Valentina Ruiz",
    company: "Baja Components",
    country: "Mexico",
    exchangeRate: "1",
    payoutMethod: "ETH transfer",
    payoutKeyLabel: "Receiver Wallet",
    payoutKey: "0x0000000000000000000000000000000000000013",
    network: "Base Sepolia",
    address: snitchpayTreasuryWallet,
    status: "Succeeded",
  },
];

const transactions: Transaction[] = [
  {
    id: "TX_137BEFAA",
    amount: TEST_INVOICE_AMOUNT_ETH,
    currency: "ETH",
    dateTime: "September 12, 2026, 1:32 AM",
    description: "INV-349924 · Concert from Blair Woldorf",
    customerName: "Blair Woldorf",
    invoiceId: "INV-349924",
    invoiceTitle: "Concert",
    memo: "Event Fees",
    dueDate: "2026-09-12",
    status: "Succeeded",
  },
  {
    id: "TX_1038F9A2",
    amount: "0.124",
    currency: "ETH",
    network: "Base Sepolia",
    dateTime: "September 12, 2026, 11:17 PM",
    description: "Invoice INV-2048 from Luma Comercio",
    status: "Succeeded",
  },
  {
    id: "TX_7B51DA90",
    amount: "0.00724",
    currency: "ETH",
    dateTime: "September 12, 2026, 10:21 PM",
    description: "Checkout payment for Rio Plata Imports",
    status: "Succeeded",
  },
  {
    id: "TX_BASE_DEMO_01",
    invoiceId: "INV-2055",
    amount: "0.042",
    currency: "ETH",
    network: "Base Sepolia",
    dateTime: "September 12, 2026, 9:45 PM",
    description: "Invoice INV-2055 from Harbor Labs",
    customerName: "Harbor Labs",
    status: "Succeeded",
  },
  {
    id: "TX_91C2F04E",
    invoiceId: "INV-2056",
    amount: "0.098",
    currency: "ETH",
    network: "Base Sepolia",
    dateTime: "September 11, 2026, 10:09 PM",
    description: "Subscription payment for Maple North Goods",
    status: "Failed",
  },
  {
    id: "TX_A8D2217C",
    amount: "0.041575",
    currency: "ETH",
    dateTime: "September 11, 2026, 10:09 PM",
    description: "API checkout session for Norte Retail",
    status: "Incomplete",
  },
  {
    id: "TX_29FE8C61",
    invoiceId: "INV-2057",
    amount: "0.076",
    currency: "ETH",
    network: "Base Sepolia",
    dateTime: "September 11, 2026, 9:52 PM",
    description: "Hosted checkout payment from Albion Studio",
    status: "Incomplete",
  },
  {
    id: "TX_D40B33A5",
    amount: "0.025",
    currency: "ETH",
    dateTime: "September 11, 2026, 9:52 PM",
    description: "Invoice INV-2051 from Porto Medical",
    status: "Succeeded",
  },
  {
    id: "TX_BASE_DEMO_02",
    invoiceId: "INV-2058",
    amount: "0.0185",
    currency: "ETH",
    network: "Base Sepolia",
    dateTime: "September 11, 2026, 8:30 PM",
    description: "Invoice INV-2058 from Orbit Studio",
    customerName: "Orbit Studio",
    status: "Incomplete",
  },
  {
    id: "TX_C6A94310",
    invoiceId: "INV-2059",
    amount: "0.01885",
    currency: "ETH",
    network: "Base Sepolia",
    dateTime: "September 10, 2026, 9:48 PM",
    description: "Payment link checkout for Andes Supply",
    status: "Incomplete",
  },
  {
    id: "TX_5E1F902B",
    amount: "0.054",
    currency: "ETH",
    dateTime: "September 10, 2026, 9:48 PM",
    description: "Checkout payment from Dune Logistics",
    status: "Succeeded",
  },
  {
    id: "TX_6B7E1120",
    amount: "0.03",
    currency: "ETH",
    dateTime: "September 10, 2026, 9:46 PM",
    description: "Invoice INV-2052 from Seine Atelier",
    status: "Incomplete",
  },
  {
    id: "TX_F17A0B2D",
    invoiceId: "INV-2060",
    amount: "0.0042",
    currency: "ETH",
    network: "Base Sepolia",
    dateTime: "September 10, 2026, 9:46 PM",
    description: "Low-value checkout test from Kanda Parts",
    status: "Succeeded",
  },
  {
    id: "TX_84D20C7A",
    invoiceId: "INV-2061",
    amount: "0.248",
    currency: "ETH",
    network: "Base Sepolia",
    dateTime: "September 10, 2026, 8:15 PM",
    description: "Enterprise checkout from Aurora Components",
    status: "Succeeded",
  },
  {
    id: "TX_3E49B6F0",
    amount: "0.012999",
    currency: "ETH",
    dateTime: "September 9, 2026, 7:52 PM",
    description: "Payment link checkout for Pacific Textiles",
    status: "Incomplete",
  },
  {
    id: "TX_A61D2E95",
    amount: "0.087525",
    currency: "ETH",
    dateTime: "September 9, 2026, 6:44 PM",
    description: "Invoice INV-2053 from Verde Freight",
    status: "Succeeded",
  },
  {
    id: "TX_D0F8C132",
    invoiceId: "INV-2062",
    amount: "0.00648",
    currency: "ETH",
    network: "Base Sepolia",
    dateTime: "September 9, 2026, 5:26 PM",
    description: "Hosted checkout payment from Osaka Parts",
    status: "Refunded",
  },
  {
    id: "TX_7A5C90BD",
    amount: "0.1125",
    currency: "ETH",
    dateTime: "September 8, 2026, 4:58 PM",
    description: "Checkout payment from Meridian Health",
    status: "Succeeded",
  },
  {
    id: "TX_C92F40AB",
    amount: "0.03494",
    currency: "ETH",
    dateTime: "September 8, 2026, 3:39 PM",
    description: "API checkout session for Terra Foods",
    status: "Incomplete",
  },
  {
    id: "TX_B5E701AF",
    amount: "0.205",
    currency: "ETH",
    network: "Base Sepolia",
    dateTime: "September 8, 2026, 2:11 PM",
    description: "Invoice INV-2054 from Atlas Robotics",
    status: "Succeeded",
  },
  {
    id: "TX_4F8D6E13",
    amount: "0.05101",
    currency: "ETH",
    dateTime: "September 8, 2026, 1:25 PM",
    description: "Checkout payment for Northstar Design",
    status: "Incomplete",
  },
  {
    id: "TX_E2A93C54",
    invoiceId: "INV-2063",
    amount: "0.0098",
    currency: "ETH",
    network: "Base Sepolia",
    dateTime: "September 8, 2026, 12:42 PM",
    description: "Payment link checkout from Blue Harbor",
    status: "Succeeded",
  },
  {
    id: "TX_19C0B78E",
    amount: "0.069075",
    currency: "ETH",
    dateTime: "September 8, 2026, 11:08 AM",
    description: "Subscription payment from Cedar Analytics",
    status: "Disputed",
  },
];

const statusTone: Record<PaymentStatus, StatusTone> = {
  Succeeded: "success",
  Failed: "danger",
  Incomplete: "incomplete",
};

const transactionStatusTone: Record<TransactionStatus, StatusTone> = {
  Succeeded: "success",
  Failed: "danger",
  Incomplete: "incomplete",
  Refunded: "neutral",
  Disputed: "warning",
};

const toneClasses: Record<StatusTone, string> = {
  success: "border-[#8cef6a] bg-[#f0ffe9] text-[#2f7d12]",
  danger: "border-[#f6a6b4] bg-[#fff1f4] text-[#c7254e]",
  warning: "border-[var(--brand-orange)] bg-[var(--brand-orange-soft)] text-[#9a3a08]",
  incomplete: "border-[#cfd9e6] bg-[#f8fbff] text-[#5f6f88]",
  neutral: "border-border bg-background text-foreground",
};

function IconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Icon className="size-3.5" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  const StatusIcon =
    label === "Succeeded" ? Check : label === "Incomplete" ? Clock3 : label === "Failed" ? X : null;

  return (
    <span
      className={`inline-flex min-h-[1.45rem] items-center gap-1 rounded-[5px] border px-1.5 text-[0.78rem] font-medium leading-none ${toneClasses[tone]}`}
    >
      {label}
      {StatusIcon ? (
        <StatusIcon className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
      ) : null}
    </span>
  );
}

function AssetMark({
  coin,
  network = ETHEREUM_NETWORK_NAME,
}: {
  coin: AssetSymbol;
  network?: DisplayNetwork;
}) {
  return (
    <span
      role="img"
      aria-label={`${coin} on ${network}`}
      className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f1f3f8]"
    >
      <Image src="/payment-methods/ethereum.svg" alt="" width={20} height={20} className="size-5 object-contain" />
      {network === "Base Sepolia" ? (
        <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-white ring-1 ring-white">
          <Image src="/payment-methods/base.svg" alt="" width={10} height={10} className="size-2.5" />
        </span>
      ) : null}
    </span>
  );
}

function isEthereumTransaction(transaction: Transaction) {
  return !transaction.network || transaction.network === ETHEREUM_NETWORK_NAME;
}

function NetworkBadge({ network }: { network: DisplayNetwork }) {
  return (
    <span className="block truncate text-[0.82rem] font-normal text-foreground" title={network}>
      {network === "Base Sepolia" ? "Base ETH" : "Ethereum"}
    </span>
  );
}

function csvValue(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function downloadTransactionsCsv(
  rows: Transaction[],
  filter: TransactionFilter,
) {
  const headers = [
    "Transaction ID",
    "Amount ETH",
    "Currency",
    "Network",
    "Date and Time",
    "Description",
    "Customer Name",
    "Status",
    "Invoice",
    "Invoice Link",
    "Transaction Hash",
    "Block Number",
    "Sender Address",
    "Recipient Address",
    "Block Timestamp UTC",
    "Explorer URL",
    "Record Source",
  ];
  const csvRows = rows.map((transaction) =>
    [
      transaction.id,
      transaction.amount,
      transaction.currency,
      transaction.network ?? ETHEREUM_NETWORK_NAME,
      formatSavedRecordDate(transaction.dateTime),
      transaction.description,
      customerNameFromTransaction(transaction),
      transaction.status,
      invoiceIdFromTransaction(transaction),
      transaction.blockchain || isEthereumTransaction(transaction) ? invoicePathFromTransaction(transaction, "Snitchpay.co") : "",
      transaction.blockchain?.hash ?? transaction.confirmedPayment?.transactionHash ?? "",
      transaction.blockchain?.blockNumber.toString() ?? transaction.confirmedPayment?.blockNumber.toString() ?? "",
      transaction.blockchain?.from ?? transaction.confirmedPayment?.payer ?? "",
      transaction.blockchain?.to ?? transaction.confirmedPayment?.treasury ?? "",
      transaction.blockchain?.blockTimestamp ?? transaction.confirmedPayment?.confirmedAt ?? "",
      transaction.blockchain?.explorerUrl ?? transaction.confirmedPayment?.explorerUrl ?? "",
      transaction.blockchain ? "Public blockchain transfer" : transaction.walletCompanyId ? "Company invoice" : "Invoice record",
    ]
      .map(csvValue)
      .join(","),
  );
  const csv = [headers.map(csvValue).join(","), ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const normalizedFilter = filter.toLowerCase().replace(/\s+/g, "-");

  link.href = url;
  link.download = `snitch-transactions-${normalizedFilter}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadPayoutsCsv(rows: Payment[]) {
  const headers = ["Payout ID", "Amount ETH", "Network", "Date and Time", "Receiver Display Name", "Status", "Sender Address", "Recipient Address", "Transaction Hash", "Block Number", "Explorer URL", "Record Source"];
  const lines = rows.map(payment => [
    payment.id, payment.senderAmount, payment.network, formatSavedRecordDate(payment.dateTime),
    payment.receiver, payment.status, payment.address, payment.payoutKey,
    payment.blockchain?.hash ?? payment.transactionHash ?? "", payment.blockchain?.blockNumber.toString() ?? payment.confirmedBlock?.toString() ?? "",
    payment.blockchain?.explorerUrl ?? (payment.transactionHash ? getEthereumExplorerUrl(payment.transactionHash) : ""),
    payment.blockchain ? "Public blockchain transfer" : payment.walletCompanyId ? "Company wallet payout" : "Payout record",
  ].map(csvValue).join(","));
  const url = URL.createObjectURL(new Blob([[headers.map(csvValue).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "snitch-payouts.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatDateTime(date: Date) {
  return formatRecordDateTime(date);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function showcaseTransaction(transaction: Transaction): Transaction {
  if (transaction.status !== "Succeeded") return { ...transaction, companyId: DEMO_COMPANY_ID };
  const blockchain = getShowcaseTransfer(transaction.id, transaction.network ?? ETHEREUM_NETWORK_NAME);
  return {
    ...transaction, companyId: DEMO_COMPANY_ID, blockchain,
    amount: blockchain.amountEth, network: blockchain.network,
    dateTime: formatBlockchainDate(blockchain.blockTimestamp),
  };
}

function showcasePayout(payment: Payment): Payment {
  if (payment.status !== "Succeeded") {
    const wallets = showcasePayoutWallets[payment.id];
    return wallets ? { ...payment, address: wallets.from, payoutKey: wallets.to } : payment;
  }
  const blockchain = getShowcaseTransfer(payment.id, payment.network);
  return {
    ...payment, blockchain, senderAmount: blockchain.amountEth,
    receiverAmount: blockchain.amountEth, address: blockchain.from,
    payoutKey: blockchain.to, payoutMethod: "Confirmed onchain ETH transfer",
    dateTime: formatBlockchainDate(blockchain.blockTimestamp),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(new Date(blockchain.blockTimestamp)),
  };
}

function customerNameFromTransaction(transaction: Transaction) {
  if (transaction.customerName) {
    return transaction.customerName;
  }

  const [, fromName] = transaction.description.split(" from ");
  const [, forName] = transaction.description.split(" for ");

  return fromName ?? forName ?? "Customer";
}

function slugifyPath(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "") || "snitchpay.co"
  );
}

function invoiceIdFromTransaction(transaction: Transaction) {
  if (transaction.invoiceId) {
    return transaction.invoiceId;
  }

  const match = transaction.description.match(/\bINV-\d+\b/i);

  return (match?.[0] ?? transaction.id).toUpperCase();
}

function sharePathFromTransaction(transactionId: string) {
  const compactId = transactionId.toLowerCase().replace(/[^a-z0-9]/g, "");

  return `checkout-${compactId.slice(-8) || "invoice"}`;
}

function invoiceTitleFromTransaction(transaction: Transaction) {
  if (transaction.invoiceTitle) {
    return transaction.invoiceTitle;
  }

  return transaction.description
    .replace(/\bInvoice\s+INV-\d+\s+from\s+/i, "Invoice from ")
    .replace(/\s+from\s+.+$/i, "")
    .replace(/\s+for\s+.+$/i, "")
    .trim();
}

function invoicePathFromTransaction(
  transaction: Transaction,
  accountName: string,
) {
  if (transaction.blockchain) return transaction.blockchain.explorerUrl;
  if (!isEthereumTransaction(transaction)) return "";
  const invoiceId = invoiceIdFromTransaction(transaction);
  const params = new URLSearchParams({
    customerName: customerNameFromTransaction(transaction),
    title: invoiceTitleFromTransaction(transaction),
    memo: transaction.memo || transaction.description,
    amount: transaction.amount,
    currency: transaction.currency,
    network: ETHEREUM_NETWORK_NAME,
    dueDate: transaction.dueDate || (transaction.companyId === DEMO_COMPANY_ID ? "2026-09-12" : todayIsoDate()),
    createdAt: formatSavedRecordDate(transaction.dateTime),
    status: transaction.status,
  });

  return `/transactions/${encodeURIComponent(slugifyPath(accountName))}/${encodeURIComponent(
    sharePathFromTransaction(transaction.id),
  )}/${encodeURIComponent(invoiceId)}?${params.toString()}`;
}

function parsePaymentDueDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function effectiveTransactionStatus(transaction: Transaction): TransactionStatus {
  if (transaction.status !== "Incomplete") {
    return transaction.status;
  }

  const dueDate = parsePaymentDueDate(transaction.dueDate);

  if (!dueDate) {
    return transaction.status;
  }

  const dueEnd = new Date(dueDate);
  dueEnd.setHours(23, 59, 59, 999);

  return dueEnd.getTime() < Date.now() ? "Failed" : transaction.status;
}

function TransactionActionButton({
  label,
  icon: Icon,
  className,
  onClick,
  disabled = false,
  tooltipClassName = "left-1/2 -translate-x-1/2",
}: {
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  tooltipClassName?: string;
}) {
  return (
    <span className="group/action relative inline-flex">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        title={label}
        onClick={onClick}
        disabled={disabled}
        className={className}
      >
        <Icon className="size-4" aria-hidden="true" />
      </Button>
      <span
        className={`pointer-events-none absolute bottom-[calc(100%+0.4rem)] z-30 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[0.68rem] font-medium text-background opacity-0 shadow-sm transition-opacity group-hover/action:opacity-100 group-focus-within/action:opacity-100 ${tooltipClassName}`}
      >
        {label}
      </span>
    </span>
  );
}

function SendInvoiceModal({
  accountName,
  transaction,
  onClose,
  onSent,
}: {
  accountName: string;
  transaction: Transaction;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const session = useWorkspaceSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const requiresSignIn = !session || needsSignIn;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-invoice-title"
    >
      <form
        className="w-full max-w-[520px] overflow-hidden rounded-xl bg-background shadow-2xl"
        onSubmit={async (event) => {
          event.preventDefault();
          if (isSubmitting || requiresSignIn) return;

          const emailToSend = customerEmail.trim();

          setIsSubmitting(true);
          setSubmitError("");

          try {
            const accessToken = await session.getAccessToken();
            if (!accessToken) {
              setNeedsSignIn(true);
              setSubmitError("Sign in again to send this invoice.");
              return;
            }

            const response = await fetch("/api/send-receipt", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                accountName,
                customerEmail: emailToSend,
                transaction,
              }),
            });
            const result = (await response.json().catch(() => null)) as
              | { error?: string }
              | null;

            if (!response.ok) {
              if (response.status === 401) setNeedsSignIn(true);
              throw new Error(result?.error ?? "Unable to send invoice email.");
            }

            onSent(`Invoice sent to ${emailToSend}.`);
            onClose();
          } catch (error) {
            setSubmitError(
              error instanceof Error
                ? error.message
                : "Unable to send invoice email.",
            );
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <header className="flex items-start justify-between gap-5 border-b border-border px-6 py-5">
          <div className="flex min-w-0 items-start gap-4">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-background">
              <ReceiptText className="size-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="send-invoice-title"
                className="text-xl font-medium tracking-[-0.03em]"
              >
                Send invoice
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {session
                  ? `Email a payment link for ${transaction.id}.`
                  : "Sign in to email this invoice to a customer."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close send invoice dialog"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="px-6 py-6">
          <label className="grid gap-2 text-sm font-medium">
            Customer Email
            <input
              name="customerEmail"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              placeholder="customer@example.com"
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </label>
          <p className="mt-3 text-sm leading-5 text-muted-foreground">
            {accountName} will send a short invoice email with a secure link to
            complete this ETH payment.
          </p>
          {submitError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg px-5"
            onClick={onClose}
          >
            Cancel
          </Button>
          {requiresSignIn ? (
            <a
              href="/login"
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Sign in to send invoice
            </a>
          ) : (
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-10 rounded-lg px-5"
            >
              {isSubmitting ? "Sending..." : "Send"}
            </Button>
          )}
        </footer>
      </form>
    </div>
  );
}

function SidebarNavButton({
  label,
  active,
  icon: Icon,
  onClick,
}: {
  label: NavItem;
  active: boolean;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3.5 text-left text-[0.84rem] font-normal tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        active
          ? "bg-[#e7e5e2] text-foreground"
          : "text-[#333333] hover:bg-[#efeeeb] hover:text-foreground"
      }`}
    >
      <Icon className="size-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SidebarUserMenu() {
  const session = useWorkspaceSession();
  const currentUser = session?.user ?? demoUser;
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const handleExit = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError("");

    try {
      if (session) await session.logout();
      window.location.assign("/");
    } catch {
      setSignOutError("Could not sign out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="grid gap-2 px-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_28%,#5f91d7_0_12%,transparent_24%),linear-gradient(135deg,#c9c1ab,#a9763b_58%,#2b2a2d)] shadow-sm">
          <span className="absolute -bottom-1.5 flex min-h-4 min-w-7 items-center justify-center rounded-full bg-[#151515] px-1.5 text-[0.56rem] font-semibold text-white ring-2 ring-background">
            {currentUser.initials}
          </span>
        </span>
        <span
          className="min-w-0 truncate text-[0.8rem] font-normal text-foreground"
          title={currentUser.name}
        >
          {currentUser.name}
        </span>
      </button>

      {open ? (
        <div className="grid gap-2">
          {session?.user.email ? (
            <p className="truncate px-1.5 text-xs text-muted-foreground" title={session.user.email}>
              {session.user.email}
            </p>
          ) : null}
          {!session ? (
            <a
              href="/login"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-[1rem] border border-border px-3 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Sign in
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => void handleExit()}
            disabled={isSigningOut}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[1rem] bg-[#171717] px-3 text-xs font-medium text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            <LogOut className="size-4" strokeWidth={2.1} aria-hidden="true" />
            {isSigningOut ? "Leaving…" : session ? "Sign out" : "Exit workspace"}
          </button>
          {signOutError ? <p className="text-xs text-destructive" role="alert">{signOutError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function PaymentSidebar({
  activeNav,
  setActiveNav,
  instances,
  selectedAccountId,
  setSelectedAccountId,
}: {
  activeNav: NavItem;
  setActiveNav: (item: NavItem) => void;
  instances: CompanyInstance[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
}) {
  const [companyOpen, setCompanyOpen] = useState(false);
  const selectedAccount =
    instances.find((instance) => instance.id === selectedAccountId) ??
    instances[0] ??
    { id: "", name: "Your companies", initials: "+", status: "Create an" };
  const accountLabel =
    selectedAccount.id === "inst_final_snitch"
      ? "Shared ETH account"
      : `${selectedAccount.status} account`;

  return (
    <aside className="flex h-screen flex-col border-r border-border bg-background px-2 pb-2.5 pt-4">
      <div className="flex items-center gap-2.5 px-2">
        <Image
          src="/snitch-logo.png"
          alt="Snitch logo"
          width={34}
          height={34}
          className="size-7 shrink-0"
          priority
        />
        <div className="min-w-0">
          <h1 className="whitespace-nowrap text-[1rem] font-medium tracking-[-0.02em] text-foreground">
            Snitch
          </h1>
        </div>
      </div>

      <div className="relative mt-5 px-1">
        <button
          type="button"
          aria-expanded={companyOpen}
          onClick={() => setCompanyOpen((open) => !open)}
          className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-[0.62rem] font-semibold text-foreground">
            {selectedAccount.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-[0.78rem] font-semibold"
              title={selectedAccount.name}
            >
              {selectedAccount.name}
            </span>
            <span className="block truncate text-[0.6rem] font-medium text-muted-foreground">
              {accountLabel}
            </span>
          </span>
          <ChevronsUpDown
            className="size-3 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>

        {companyOpen ? (
          <div className="absolute left-1 right-1 top-[calc(100%+6px)] z-20 overflow-hidden rounded-lg border border-border bg-background shadow-md">
            {instances.map((company) => (
              <button
                key={company.id}
                type="button"
                onClick={() => {
                  setSelectedAccountId(company.id);
                  setCompanyOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-[0.62rem] font-semibold text-foreground">
                  {company.initials}
                </span>
                <span className="min-w-0">
                  <span
                    className="block truncate text-[0.8rem] font-medium"
                    title={company.name}
                  >
                    {company.name}
                  </span>
                  <span className="block truncate text-[0.66rem] text-muted-foreground">
                    {company.id === "inst_final_snitch"
                      ? "Shared ETH account"
                      : `${company.status} account`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <nav aria-label="Workspace" className="mt-5 grid gap-1.5">
        {navItems.map(({ label, icon }) => (
          <SidebarNavButton
            key={label}
            label={label}
            icon={icon}
            active={activeNav === label}
            onClick={() => setActiveNav(label)}
          />
        ))}
      </nav>

      <div className="mt-auto grid gap-2 pb-0">
        <SidebarUserMenu />
      </div>
    </aside>
  );
}

function InstanceStatusPill({
  label,
  tone,
}: {
  label: string;
  tone: StatusTone;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-border bg-background text-muted-foreground";

  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${toneClass}`}
    >
      {tone === "warning" ? (
        <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      ) : tone === "success" ? (
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      ) : (
        <AlertCircle className="size-3.5" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

function DashboardView({
  activeNav,
  setActiveNav,
  instances,
  setInstances,
  selectedAccountId,
  setSelectedAccountId,
}: {
  activeNav: NavItem;
  setActiveNav: (item: NavItem) => void;
  instances: CompanyInstance[];
  setInstances: (items: CompanyInstance[]) => void;
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
}) {
  const currentUser = useWorkspaceSession()?.user ?? demoUser;
  const companyWallets = useCompanyWallets();
  const firstName = currentUser.name.trim().split(/\s+/)[0] || "there";
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [activeInstance, setActiveInstance] = useState<CompanyInstance | null>(
    null,
  );
  const [instanceType, setInstanceType] = useState("Testnet");
  const [instanceName, setInstanceName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [saveError, setSaveError] = useState("");
  const creationRequestId = useRef<string | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const confirmDeleteButtonRef = useRef<HTMLButtonElement>(null);

  const openCreateInstance = () => {
    if (companyWallets?.companies.some(company => company.wallet.status === "pending")) {
      setSaveError("Finish the existing company wallet setup before creating another company.");
      return;
    }
    setSaveError("");
    creationRequestId.current = crypto.randomUUID();
    setModalMode("create");
    setActiveInstance(null);
    setInstanceType("Testnet");
    setInstanceName("");
    setDeleteConfirmOpen(false);
  };

  const openEditInstance = (instance: CompanyInstance) => {
    setSaveError("");
    setSelectedAccountId(instance.id);
    setModalMode("edit");
    setActiveInstance(instance);
    setInstanceType(
      instance.id === DEMO_COMPANY_ID ? "Playground" : instance.status === "Development" ? "Development" : "Testnet",
    );
    setInstanceName(instance.name);
    setDeleteConfirmOpen(false);
  };

  const closeInstanceModal = () => {
    if (saving || deleting) return;
    setModalMode(null);
    setActiveInstance(null);
    setDeleteConfirmOpen(false);
    setSaveError("");
  };

  const cancelDeleteConfirmation = () => {
    if (deleting) return;
    setDeleteConfirmOpen(false);
    setSaveError("");
    requestAnimationFrame(() => deleteButtonRef.current?.focus());
  };

  useEffect(() => {
    if (!modalMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving || deleting) return;
      if (deleteConfirmOpen) {
        setDeleteConfirmOpen(false);
        setSaveError("");
        requestAnimationFrame(() => deleteButtonRef.current?.focus());
      } else {
        setModalMode(null);
        setActiveInstance(null);
        setSaveError("");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleteConfirmOpen, deleting, modalMode, saving]);

  useEffect(() => {
    if (!deleteConfirmOpen) return;
    requestAnimationFrame(() => confirmDeleteButtonRef.current?.focus());
  }, [deleteConfirmOpen]);

  const saveInstance = async () => {
    const trimmedName = instanceName.trim();

    if (!trimmedName || saving) {
      return;
    }

    if (companyWallets) {
      setSaving(true); setSaveError("");
      try {
        if (modalMode === "edit" && activeInstance) {
          await companyWallets.renameCompany(activeInstance.id, trimmedName);
          if (activeInstance.walletStatus === "pending") await companyWallets.resumeWallet(activeInstance.id);
          setSelectedAccountId(activeInstance.id);
        } else {
          creationRequestId.current ??= crypto.randomUUID();
          const company = await companyWallets.createCompany(trimmedName, creationRequestId.current);
          setSelectedAccountId(company.id);
          setActiveNav("Wallets");
        }
        setModalMode(null); setActiveInstance(null);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Your company could not be saved. Please try again.");
      } finally { setSaving(false); }
      return;
    }

    if (modalMode === "edit" && activeInstance) {
      setInstances(
        instances.map((item) =>
          item.id === activeInstance.id
            ? {
                ...item,
                name: trimmedName,
                initials: getInitials(trimmedName),
                status: instanceType,
                statusTone:
                  instanceType === "Testnet" || instanceType === "Playground" ? "success" : "neutral",
              }
            : item,
        ),
      );
    }

    if (modalMode === "create") {
      const newInstance: CompanyInstance = {
        id: `inst_${Date.now()}`,
        name: trimmedName,
        initials: getInitials(trimmedName),
        receivers: "0 receivers",
        status: instanceType,
        statusTone: instanceType === "Testnet" ? "success" : "neutral",
        activity: "No payout yet",
        createdAt: "Created May 10",
      };

      setInstances([...instances, newInstance]);
      setSelectedAccountId(newInstance.id);
    }

    closeInstanceModal();
  };

  const deleteInstance = async () => {
    if (!activeInstance || activeInstance.id === DEMO_COMPANY_ID || deleting) return;
    setDeleting(true);
    setSaveError("");
    try {
      if (companyWallets) {
        await companyWallets.deleteCompany(activeInstance.id);
      } else {
        setInstances(instances.filter((item) => item.id !== activeInstance.id));
      }
      if (selectedAccountId === activeInstance.id) setSelectedAccountId(DEMO_COMPANY_ID);
      setModalMode(null);
      setActiveInstance(null);
      setDeleteConfirmOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "This company account could not be deleted. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <div className="grid h-screen grid-cols-1 lg:grid-cols-[176px_minmax(0,1fr)]">
        <PaymentSidebar
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          instances={instances}
          selectedAccountId={selectedAccountId}
          setSelectedAccountId={setSelectedAccountId}
        />

        <section className="h-screen min-w-0 overflow-auto px-5 py-5 xl:px-7">
          <div className="mx-auto max-w-[1120px]">
            <header>
              <h1 className="text-[1.35rem] font-normal tracking-[-0.03em] text-muted-foreground">
                Welcome, <span className="font-semibold text-foreground">{firstName}.</span>{" "}
                Which company account should Snitch move today?
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
                Create separate company accounts for ETH checkout,
                compliance, receivers, and payout operations.
              </p>
            </header>

            <section className="mt-7 grid justify-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,280px))]">
              <button
                type="button"
                onClick={openCreateInstance}
                disabled={companyWallets?.loading || Boolean(companyWallets?.error)}
                className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-[#d1d5dc] bg-background text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="inline-flex items-center gap-2.5 text-sm font-medium">
                  <Plus className="size-4" strokeWidth={2.2} aria-hidden="true" />
                  {companyWallets?.loading ? "Loading accounts…" : "Create Account"}
                </span>
              </button>

              {instances.map((instance) => (
                <article
                  key={instance.id}
                  className="group relative min-h-[160px] overflow-visible rounded-lg border border-border bg-background shadow-[0_8px_22px_rgba(15,23,42,0.04)] transition-colors hover:border-foreground/25"
                >
                  <button
                    type="button"
                    onClick={() => openEditInstance(instance)}
                    className="block h-full w-full overflow-hidden rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="block p-4">
                      <span className="flex items-start justify-between gap-4">
                        <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          {instance.initials}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {instance.receivers}
                        </span>
                      </span>

                      <span className="mt-9 block">
                        <span className="block truncate text-base font-medium tracking-[-0.02em] text-foreground">
                          {instance.name}
                        </span>
                        <span className="mt-2 inline-flex">
                          <InstanceStatusPill
                            label={instance.status === "Playground" ? "Active" : instance.status}
                            tone={instance.statusTone}
                          />
                        </span>
                      </span>
                    </span>

                    <span className="flex min-h-11 items-center justify-between gap-3 border-t border-border bg-muted/35 px-4">
                      {instance.activity ? <span className="truncate text-xs font-medium text-muted-foreground">
                        {instance.activity}
                      </span> : null}
                      <span className={`shrink-0 text-[0.68rem] text-muted-foreground${instance.activity ? " ml-auto" : ""}`}>
                        {instance.createdAt}
                      </span>
                    </span>
                  </button>

                </article>
              ))}
            </section>
            {companyWallets?.error ? <div className="mt-5 text-sm" role="alert"><p>{companyWallets.error}</p><button type="button" className="mt-2 underline" onClick={() => void companyWallets.reload().catch(() => undefined)}>Try again</button></div> : null}
            {saveError && !modalMode ? <p className="mt-5 text-sm text-destructive" role="alert">{saveError}</p> : null}
          </div>
        </section>
      </div>

      {modalMode ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="instance-dialog-title"
          aria-describedby="instance-dialog-description"
        >
          <div className="w-full max-w-[520px] overflow-hidden rounded-xl bg-background shadow-2xl" aria-busy={saving || deleting}>
            <header className="flex items-start justify-between gap-5 border-b border-border px-6 py-5">
              <div className="flex min-w-0 items-start gap-4">
                <span className={`inline-flex size-12 shrink-0 items-center justify-center rounded-full border ${deleteConfirmOpen ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-border bg-background"}`}>
                  {deleteConfirmOpen ? <Trash2 className="size-5" aria-hidden="true" /> : <span className="grid gap-1">
                    <span className="block h-1.5 w-5 rounded-full bg-muted-foreground" />
                    <span className="block h-1.5 w-5 rounded-full bg-muted-foreground" />
                  </span>}
                </span>
                <div className="min-w-0">
                  <h2
                    id="instance-dialog-title"
                    className="text-xl font-medium tracking-[-0.03em]"
                  >
                    {deleteConfirmOpen ? `Delete ${activeInstance?.name}?` : modalMode === "create" ? "New account" : "Account details"}
                  </h2>
                  <p id="instance-dialog-description" className="mt-1 text-sm text-muted-foreground">
                    {deleteConfirmOpen
                      ? "This permanently removes the company account from Snitch."
                      : activeInstance?.id === DEMO_COMPANY_ID
                        ? "The protected Snitchpay.co workspace account."
                      : companyWallets
                        ? "A dedicated company account and treasury wallet."
                        : "Create a separate environment to receive payments and manage payouts."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeInstanceModal}
                disabled={saving || deleting}
                aria-label="Close account dialog"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </header>

            {deleteConfirmOpen ? <div className="grid gap-4 px-6 py-6">
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-foreground">Account data will be removed</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Invoices, payout records, and the Snitch connection to this company wallet will be deleted. The underlying Privy wallet remains in Privy.
                </p>
              </div>
              {saveError ? <p className="text-sm text-destructive" role="alert">{saveError}</p> : null}
            </div> : <div className="grid gap-5 px-6 py-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Account type*
                  <select
                    value={instanceType}
                    disabled={Boolean(companyWallets) || activeInstance?.id === DEMO_COMPANY_ID || saving}
                    onChange={(event) => setInstanceType(event.target.value)}
                    className="h-12 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {activeInstance?.id === DEMO_COMPANY_ID ? <option value="Playground">Active</option> : <option>Testnet</option>}
                    <option>Development</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Account name*
                  <input
                    value={instanceName}
                    disabled={saving || activeInstance?.id === DEMO_COMPANY_ID}
                    maxLength={80}
                    onChange={(event) => setInstanceName(event.target.value)}
                    placeholder="Snitchpay.co"
                    className="h-12 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </label>
              </div>

              <div className="flex gap-4 rounded-lg border border-border p-4">
                <AlertCircle
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm leading-6 text-foreground">
                  {activeInstance?.id === DEMO_COMPANY_ID
                    ? "Snitchpay.co is your fixed workspace account. Its connected company wallet remains available for payments and payouts."
                    : companyWallets
                      ? "This company uses a separate Ethereum wallet through Privy. You are its CFO and authorized wallet controller. Snitch does not receive the wallet’s private key."
                      : "Accounts help you keep dev, staging, and production separated. Each account has its own receivers, payouts, compliance state, and settings."}
                </p>
              </div>
              {saveError ? <p className="text-sm text-destructive" role="alert">{saveError}</p> : null}
            </div>}

            {deleteConfirmOpen ? <footer className="flex justify-end gap-2 px-6 pb-6">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-lg px-5"
                onClick={cancelDeleteConfirmation}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                ref={confirmDeleteButtonRef}
                type="button"
                variant="destructive"
                className="h-10 rounded-lg px-5"
                onClick={() => void deleteInstance()}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete account"}
              </Button>
            </footer> : <footer className="flex flex-wrap items-center justify-end gap-2 px-6 pb-6">
              {modalMode === "edit" && activeInstance?.id !== DEMO_COMPANY_ID ? <Button
                ref={deleteButtonRef}
                type="button"
                variant="outline"
                className="mr-auto h-10 rounded-lg border-destructive/30 px-4 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => { setSaveError(""); setDeleteConfirmOpen(true); }}
                disabled={saving}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Delete account
              </Button> : <span className="mr-auto" />}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-lg px-5"
                  onClick={closeInstanceModal}
                  disabled={saving}
                >
                  {activeInstance?.id === DEMO_COMPANY_ID ? "Close" : "Cancel"}
                </Button>
                {activeInstance?.id !== DEMO_COMPANY_ID ? <Button
                  type="button"
                  className="h-10 rounded-lg px-5"
                  onClick={() => void saveInstance()}
                  disabled={!instanceName.trim() || saving}
                >
                  {saving ? "Setting up company…" : activeInstance?.walletStatus === "pending" ? "Finish wallet setup" : modalMode === "create" ? "Create" : "Save"}
                </Button> : null}
              </div>
            </footer>}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function PaymentsView({
  activeNav,
  setActiveNav,
  instances,
  selectedAccountId,
  setSelectedAccountId,
  accountPayments,
  onCreatePayout,
}: {
  activeNav: NavItem;
  setActiveNav: (item: NavItem) => void;
  instances: CompanyInstance[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  accountPayments: Payment[];
  onCreatePayout: (payout: CreatedPayoutInput) => Promise<string | null>;
}) {
  const [selectedId, setSelectedId] = useState(accountPayments[0]?.id ?? "");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [isCreatePayoutOpen, setIsCreatePayoutOpen] = useState(false);
  const activeAccountName =
    instances.find((instance) => instance.id === selectedAccountId)?.name ??
    "Snitchpay.co";

  const selectedPayment = useMemo(
    () =>
      accountPayments.find((payment) => payment.id === selectedId) ??
      accountPayments[0],
    [accountPayments, selectedId],
  );
  const detailsVisible = detailsOpen && Boolean(selectedPayment);

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <div
        className={`grid h-screen grid-cols-1 ${
          detailsVisible
            ? "lg:grid-cols-[176px_minmax(0,1fr)_332px] xl:grid-cols-[176px_minmax(0,1fr)_356px]"
            : "lg:grid-cols-[176px_minmax(0,1fr)] xl:grid-cols-[176px_minmax(0,1fr)]"
        }`}
      >
        <PaymentSidebar
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          instances={instances}
          selectedAccountId={selectedAccountId}
          setSelectedAccountId={setSelectedAccountId}
        />

        <section className="min-w-0 overflow-hidden border-r border-border">
          <header className="flex min-h-14 min-w-0 items-center justify-between gap-3 overflow-hidden px-5 xl:px-6">
            <div className="flex min-w-0 items-center gap-3 overflow-hidden">
              <IconButton label="Filters" icon={SlidersHorizontal} />
              <IconButton label="Table view" icon={Table2} />
              <span className="inline-flex min-h-8 items-center rounded-full bg-muted px-3 text-sm font-semibold">
                50
              </span>
              <span className="hidden items-center gap-3 xl:flex">
                <IconButton label="Previous page" icon={ChevronLeft} />
                <IconButton label="Next page" icon={ChevronRight} />
                <span className="mx-1 h-8 w-px bg-border" />
                <IconButton label="Export payouts" icon={Download} onClick={() => downloadPayoutsCsv(accountPayments)} />
              </span>
            </div>

            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => setIsCreatePayoutOpen(true)}
                className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Plus className="size-4" aria-hidden="true" />
                Create Payout
              </button>
            </div>
          </header>

          <div className="h-[calc(100vh-56px)] min-w-0 overflow-auto px-5 pb-6 xl:px-6">
            <div className="min-w-[900px] max-w-[980px]">
              <div className="sticky top-0 z-10 grid min-h-11 min-w-0 grid-cols-[100px_94px_150px_150px_114px_210px] items-center gap-x-3 border-b border-border bg-background text-sm font-medium">
                <div>Amount</div>
                <div>Network</div>
                <div>Conversion</div>
                <div>Receiver</div>
                <div>Status</div>
                <div>Date and Time</div>
              </div>

              <div className="divide-y-0">
                {accountPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className={`relative isolate grid min-h-[3rem] w-full min-w-0 grid-cols-1 gap-2 rounded-md px-0 py-2 text-left transition-colors hover:bg-muted/60 md:grid-cols-[100px_94px_150px_150px_114px_210px] md:items-center md:gap-x-3 ${
                      selectedPayment?.id === payment.id ? "bg-muted/50" : ""
                    }`}
                  >
                    <button
                    type="button"
                    aria-label={`View payout ${payment.id} for ${payment.receiver}`}
                    title={`${payment.senderAmount} ETH · ${payment.receiver} · ${formatSavedRecordDate(payment.dateTime)}`}
                    onClick={() => {
                      setSelectedId(payment.id);
                      setDetailsOpen(true);
                    }}
                    className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    />
                    <div className="pointer-events-none relative flex min-w-0 items-center gap-2">
                      <AssetMark coin={payment.senderToken} network={payment.network} />
                      <span title={`${payment.senderAmount} ETH`} className="min-w-0 truncate font-mono text-[0.82rem] text-muted-foreground tabular-nums">
                        {payment.senderAmount}
                      </span>
                    </div>
                    <div className="pointer-events-none relative min-w-0">
                      {(payment.status === "Succeeded" && payment.blockchain) || payment.transactionHash ? (
                        <a
                          href={payment.blockchain?.explorerUrl ?? getEthereumExplorerUrl(payment.transactionHash!)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`View ${payment.network} payout ${payment.id} on explorer (opens in a new tab)`}
                          title="View transaction on explorer"
                          className="pointer-events-auto relative z-10 inline-flex max-w-full rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <NetworkBadge network={payment.network} />
                        </a>
                      ) : <NetworkBadge network={payment.network} />}
                    </div>
                    <div title={`${payment.receiverAmount} ETH`} className="pointer-events-none relative min-w-0 truncate font-mono text-[0.82rem] font-medium tabular-nums">
                      {payment.receiverCurrency} {payment.receiverAmount}
                    </div>
                    <div className="pointer-events-none relative min-w-0 truncate text-[0.82rem] font-medium text-muted-foreground">
                      {payment.receiver}
                    </div>
                    <div className="pointer-events-none relative">
                      <StatusBadge
                        label={payment.status}
                        tone={statusTone[payment.status]}
                      />
                    </div>
                    <div title={formatSavedRecordDate(payment.dateTime)} className="pointer-events-none relative min-w-0 truncate text-[0.82rem] font-medium text-muted-foreground">
                      {formatSavedRecordDate(payment.dateTime)}
                    </div>
                  </div>
                ))}
                {accountPayments.length === 0 ? (
                  <div className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
                    No payouts yet for this account.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {detailsVisible && selectedPayment ? (
          <PaymentDetails
            payment={selectedPayment}
            onClose={() => setDetailsOpen(false)}
          />
        ) : null}
        {isCreatePayoutOpen ? (
          <CreatePayoutModal
            key={selectedAccountId}
            companyId={selectedAccountId}
            accountName={activeAccountName}
            onClose={() => setIsCreatePayoutOpen(false)}
            onCreatePayout={async (payout) => {
              const createdId = await onCreatePayout(payout);

              if (createdId) {
                setSelectedId(createdId);
                setDetailsOpen(true);
              }

              return createdId;
            }}
          />
        ) : null}
      </div>
    </main>
  );
}

function AccessRoleSelect({
  value,
  onChange,
  label,
  className = "",
  locked = false,
}: {
  value: AccessRole;
  onChange: (role: AccessRole) => void;
  label: string;
  className?: string;
  locked?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = 0;
      }
    });
  }, [isOpen]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {locked ? <div title={accessRoleDetails[value]} className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-muted/25 px-3 text-sm font-medium"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />{value}<span className="sr-only">{accessRoleDetails[value]}</span></div> : <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="truncate">{value}</span>
        <ChevronsUpDown
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute right-0 top-[calc(100%+0.375rem)] z-30 w-[min(30rem,calc(100vw-3rem))] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
        >
          {accessRoles.map((role) => {
            const isSelected = role === value;

            return (
              <button
                key={role}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={role === "CFO"}
                title={role === "CFO" ? "CFO is assigned to the verified company wallet controller." : undefined}
                onClick={() => {
                  onChange(role);
                  setIsOpen(false);
                }}
                className={`grid w-full grid-cols-[1.1rem_minmax(8rem,11rem)_minmax(0,1fr)] items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  role === "CFO" ? "cursor-not-allowed bg-muted/20 text-muted-foreground" : isSelected ? "bg-muted text-foreground" : "hover:bg-muted/70"
                }`}
              >
                <span className="inline-flex size-4 items-center justify-center">
                  {isSelected ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : null}
                </span>
                <span className="truncate text-sm font-semibold leading-5">
                  {role}
                </span>
                <span className="truncate text-xs leading-5 text-muted-foreground">
                  {accessRoleDetails[role]}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      </>}
    </div>
  );
}

function AdminAccessModal({
  companyName,
  members,
  onClose,
  onAddMember,
  onRemoveMember,
  onUpdateRole,
}: {
  companyName: string;
  members: AccessMember[];
  onClose: () => void;
  onAddMember: (member: Omit<AccessMember, "id">) => void;
  onRemoveMember: (id: string) => void;
  onUpdateRole: (id: string, role: AccessRole) => void;
}) {
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<AccessRole>("Developer");
  const [error, setError] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-access-title"
    >
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-[760px] flex-col rounded-2xl bg-background shadow-2xl">
        <header className="flex items-start justify-between gap-5 px-6 pb-1 pt-6">
          <div className="min-w-0">
            <h2
              id="admin-access-title"
              className="text-xl font-semibold leading-tight tracking-[-0.03em]"
            >
              Manage team
            </h2>
            <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted-foreground">
              Invite members and assign clear permissions for {companyName}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close admin access dialog"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 px-6 pb-4">
          <form
            className="grid gap-3 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmedName = memberName.trim();
              const trimmedEmail = memberEmail.trim();

              if (!trimmedName || !trimmedEmail) {
                setError("Add a member name and email before assigning access.");
                return;
              }

              onAddMember({
                name: trimmedName,
                email: trimmedEmail,
                role: memberRole,
              });
              setMemberName("");
              setMemberEmail("");
              setMemberRole("Developer");
              setError("");
            }}
          >
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_210px]">
                <label className="grid gap-2 text-sm font-medium">
                  Member name*
                  <input
                    value={memberName}
                    onChange={(event) => setMemberName(event.target.value)}
                    type="text"
                    autoComplete="name"
                    placeholder="Priya Shah"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Email*
                  <input
                    value={memberEmail}
                    onChange={(event) => setMemberEmail(event.target.value)}
                    type="email"
                    autoComplete="email"
                    placeholder="priya@company.com"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </label>
                <div className="grid gap-2 text-sm font-medium">
                  Role*
                  <AccessRoleSelect
                    value={memberRole}
                    onChange={setMemberRole}
                    label="Role for new admin member"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  The selected role controls wallet visibility, API key access,
                  and payout permissions.
                </p>
                <Button
                  type="submit"
                  className="h-10 rounded-lg px-4 text-sm md:min-w-32"
                  disabled={!memberName.trim() || !memberEmail.trim()}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Add member
                </Button>
              </div>
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </form>

          <section className="pb-1">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Members</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Review every person with admin access and change roles from
                  the popup list.
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                {members.length} active
              </span>
            </div>

            <div className="mt-3 rounded-xl border border-border">
              {members.length > 0 ? (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="grid min-h-12 grid-cols-1 gap-2 border-b border-border px-4 py-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_220px_40px] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {member.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {member.email}
                      </p>
                    </div>
                    <AccessRoleSelect
                      value={member.role}
                      locked={member.protected || member.role === "CFO"}
                      onChange={(role) => onUpdateRole(member.id, role)}
                      label={`Role for ${member.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveMember(member.id)}
                      disabled={member.protected || member.role === "CFO"}
                      aria-label={`Remove ${member.name}`}
                      title={member.protected || member.role === "CFO" ? "The company’s designated wallet controller cannot be removed here." : `Remove ${member.name}`}
                      className="inline-flex size-10 items-center justify-center justify-self-start rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35 md:justify-self-end"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="grid min-h-32 place-items-center px-4 py-8 text-center">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      No members assigned
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add a name, email, and role above to grant admin access.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button
            type="button"
            className="h-10 rounded-lg px-5"
            onClick={onClose}
          >
            Done
          </Button>
        </footer>
      </div>
    </div>
  );
}

function TeamView({
  activeNav,
  setActiveNav,
  instances,
  selectedAccountId,
  setSelectedAccountId,
  members,
  setMembers,
}: {
  activeNav: NavItem;
  setActiveNav: (item: NavItem) => void;
  instances: CompanyInstance[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  members: AccessMember[];
  setMembers: (update: (members: AccessMember[]) => AccessMember[]) => void;
}) {
  const [manageOpen, setManageOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"All roles" | AccessRole>("All roles");
  const selectedAccount =
    instances.find((instance) => instance.id === selectedAccountId) ?? instances[0];
  const companyName = selectedAccount?.name ?? "Your company";
  const normalizedQuery = query.trim().toLowerCase();
  const filteredMembers = members.filter((member) => {
    const matchesRole = roleFilter === "All roles" || member.role === roleFilter;
    const matchesQuery =
      !normalizedQuery ||
      `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(normalizedQuery);
    return matchesRole && matchesQuery;
  });
  const cfoCount = members.filter((member) => member.role === "CFO").length;
  const assignedRoleCount = new Set(members.map((member) => member.role)).size;

  const addMember = (member: Omit<AccessMember, "id">) => {
    if (member.role === "CFO") return;
    setMembers((currentMembers) => [
      ...currentMembers,
      { id: `member_${Date.now()}`, ...member },
    ]);
  };
  const removeMember = (id: string) =>
    setMembers((currentMembers) =>
      currentMembers.filter((member) => member.id !== id || member.protected || member.role === "CFO"),
    );
  const updateRole = (id: string, role: AccessRole) =>
    setMembers((currentMembers) =>
      currentMembers.map((member) =>
        member.id === id && !member.protected && member.role !== "CFO" && role !== "CFO" ? { ...member, role } : member,
      ),
    );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:h-screen lg:grid-cols-[176px_minmax(0,1fr)] lg:overflow-hidden">
        <div className="hidden lg:block">
          <PaymentSidebar
            activeNav={activeNav}
            setActiveNav={setActiveNav}
            instances={instances}
            selectedAccountId={selectedAccountId}
            setSelectedAccountId={setSelectedAccountId}
          />
        </div>

        <section className="min-w-0 lg:h-screen lg:overflow-y-auto">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 lg:hidden">
            <button
              type="button"
              onClick={() => setActiveNav("Dashboard")}
              className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Image src="/snitch-logo.png" alt="" width={24} height={24} />
              Snitch
            </button>
            <label className="min-w-0">
              <span className="sr-only">Company account</span>
              <select
                value={selectedAccountId}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                className="min-h-10 max-w-48 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>{instance.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
            <header className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Settings</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">Team and access</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Assign the people responsible for {companyName} and control what each role can do.
                </p>
              </div>
              <Button type="button" onClick={() => setManageOpen(true)} className="h-10 rounded-lg px-4">
                <Plus className="size-4" aria-hidden="true" />
                Add member
              </Button>
            </header>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                { label: "All members", value: members.length },
                { label: "Chief Financial Officer", value: cfoCount },
                { label: "Assigned roles", value: assignedRoleCount },
              ].map((stat, index) => (
                <div
                  key={stat.label}
                  className={`rounded-xl border bg-background px-5 py-4 ${index === 0 ? "border-foreground/25 shadow-sm" : "border-border"}`}
                >
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>

            <section aria-labelledby="team-members-title" className="mt-5 overflow-hidden rounded-2xl border border-border bg-background">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                <div>
                  <h2 id="team-members-title" className="text-sm font-semibold">Members</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Wallet export requires the assigned CFO’s signature.</p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="sr-only">Search team members</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search members"
                      className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                  <label>
                    <span className="sr-only">Filter by role</span>
                    <select
                      value={roleFilter}
                      onChange={(event) => setRoleFilter(event.target.value as "All roles" | AccessRole)}
                      className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option>All roles</option>
                      {accessRoles.map((role) => <option key={role}>{role}</option>)}
                    </select>
                  </label>
                </div>
              </header>

              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[minmax(180px,1fr)_minmax(220px,1.15fr)_220px_52px] gap-4 border-b border-border bg-muted/20 px-5 py-3 text-xs font-medium text-muted-foreground sm:px-6">
                    <div>Name</div>
                    <div>Email</div>
                    <div>Role</div>
                    <div><span className="sr-only">Actions</span></div>
                  </div>
                  <div className="divide-y divide-border">
                    {filteredMembers.map((member) => (
                      <div key={member.id} className="grid min-h-[72px] grid-cols-[minmax(180px,1fr)_minmax(220px,1.15fr)_220px_52px] items-center gap-4 px-5 py-3 hover:bg-muted/15 sm:px-6">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-xs font-semibold">
                            {member.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{member.name}</p>
                            {member.role === "CFO" ? <span className="mt-1 block text-xs text-muted-foreground">Chief Financial Officer</span> : null}
                          </div>
                        </div>
                        <p className="truncate text-sm text-muted-foreground" title={member.email}>{member.email}</p>
                        <AccessRoleSelect value={member.role} locked={member.protected || member.role === "CFO"} onChange={(role) => updateRole(member.id, role)} label={`Role for ${member.name}`} />
                        <button
                          type="button"
                          onClick={() => removeMember(member.id)}
                          disabled={member.protected || member.role === "CFO"}
                          aria-label={member.role === "CFO" ? `${member.name} is the Chief Financial Officer` : member.protected ? "Company controller" : `Remove ${member.name}`}
                          title={member.protected || member.role === "CFO" ? "The company’s designated wallet controller cannot be removed here." : `Remove ${member.name}`}
                          className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    {!filteredMembers.length ? (
                      <div className="grid min-h-36 place-items-center px-5 py-8 text-center">
                        <div><p className="text-sm font-semibold">No matching members</p><p className="mt-1 text-xs text-muted-foreground">Try another name, email, or role.</p></div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6">
                Showing {filteredMembers.length} of {members.length} {members.length === 1 ? "member" : "members"}
              </p>
            </section>
          </div>
        </section>
      </div>

      {manageOpen ? (
        <AdminAccessModal
          companyName={companyName}
          members={members}
          onClose={() => setManageOpen(false)}
          onAddMember={addMember}
          onRemoveMember={removeMember}
          onUpdateRole={updateRole}
        />
      ) : null}
    </main>
  );
}

function WalletsView({
  activeNav, setActiveNav, instances, selectedAccountId, setSelectedAccountId, accountPayments, accountTransactions,
}: {
  activeNav: NavItem;
  setActiveNav: (item: NavItem) => void;
  instances: CompanyInstance[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  accountPayments: Payment[];
  accountTransactions: Transaction[];
}) {
  const companyWallets = useCompanyWallets();
  const activity = useMemo<WalletActivity[]>(() => [
    ...accountTransactions.map(transaction => ({
      id: transaction.id, kind: "payment" as const,
      counterparty: customerNameFromTransaction(transaction),
      reference: invoiceIdFromTransaction(transaction), amount: transaction.amount,
      network: transaction.network ?? ETHEREUM_NETWORK_NAME,
      status: transaction.status, dateTime: transaction.dateTime,
      occurredAt: transaction.blockchain?.blockTimestamp ?? transaction.confirmedPayment?.confirmedAt,
      explorerUrl: transaction.blockchain?.explorerUrl ?? transaction.confirmedPayment?.explorerUrl,
    })),
    ...accountPayments.map(payment => ({
      id: payment.id, kind: "payout" as const, counterparty: payment.receiver,
      reference: payment.id, amount: payment.senderAmount,
      network: payment.network, status: payment.status, dateTime: payment.dateTime,
      occurredAt: payment.blockchain?.blockTimestamp ?? payment.confirmedAt,
      explorerUrl: payment.blockchain?.explorerUrl ?? (payment.transactionHash ? getEthereumExplorerUrl(payment.transactionHash) : undefined),
    })),
  ], [accountPayments, accountTransactions]);
  const walletCompany = resolveWalletCompany(companyWallets?.companies ?? [], selectedAccountId);
  const navigation = {
    onViewPayments: () => setActiveNav("Transactions"),
    onViewPayouts: () => setActiveNav("Payouts"),
    onManageCompanies: () => setActiveNav("Dashboard"),
  };

  return (
    <main className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[176px_minmax(0,1fr)]">
        <div className="hidden lg:block"><PaymentSidebar activeNav={activeNav} setActiveNav={setActiveNav} instances={instances} selectedAccountId={selectedAccountId} setSelectedAccountId={setSelectedAccountId} /></div>
        <section aria-label="Company wallet workspace" className="min-h-0 min-w-0 overflow-y-auto overscroll-y-none">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 lg:hidden">
            <button type="button" onClick={() => setActiveNav("Dashboard")} className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Image src="/snitch-logo.png" alt="" width={24} height={24} />Snitch</button>
            <label className="min-w-0"><span className="sr-only">Company account</span><select value={selectedAccountId} onChange={event => setSelectedAccountId(event.target.value)} className="min-h-10 max-w-48 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{instances.map(instance => <option key={instance.id} value={instance.id}>{instance.name}</option>)}</select></label>
          </div>
          {selectedAccountId === DEMO_COMPANY_ID ?
            <ShowcaseTreasuryPanel activity={activity} {...navigation} onManageAccess={() => setActiveNav("Connect")} /> :
            companyWallets && walletCompany ?
            <CompanyTreasuryPanel key={walletCompany.id} companyId={walletCompany.id} environment={selectedAccountId === DEMO_COMPANY_ID ? "Playground" : "Testnet"} activity={activity} {...navigation} onManageAccess={() => setActiveNav("Connect")} /> :
            <WalletPage key={selectedAccountId} companyName={instances.find(instance => instance.id === selectedAccountId)?.name ?? "Your company"} environment={selectedAccountId === DEMO_COMPANY_ID ? "Playground" : "Testnet"} balance={null} balanceState="unavailable" activity={activity} {...navigation} signInToConnect={!companyWallets} setupLabel={walletCompany ? "Finish wallet setup" : "Connect company wallet"} onSetupWallet={companyWallets && selectedAccountId === DEMO_COMPANY_ID ? () => companyWallets.connectPlaygroundWallet() : undefined} onManageAccess={() => setActiveNav("Connect")} />}
        </section>
      </div>
    </main>
  );
}

function TransactionsView({
  activeNav,
  setActiveNav,
  instances,
  selectedAccountId,
  setSelectedAccountId,
  accountTransactions,
  onCreatePayment,
  onRemoveTransaction,
  onMarkPaymentSucceeded,
}: {
  activeNav: NavItem;
  setActiveNav: (item: NavItem) => void;
  instances: CompanyInstance[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  accountTransactions: Transaction[];
  onCreatePayment: (payment: CreatedPaymentInput) => void;
  onRemoveTransaction: (id: string) => void;
  onMarkPaymentSucceeded: (invoiceId: string, payment?: ConfirmedInvoicePayment) => void;
}) {
  const [activeTransactionFilter, setActiveTransactionFilter] =
    useState<TransactionFilter>("All");
  const [isCreatePaymentOpen, setIsCreatePaymentOpen] = useState(false);
  const [invoiceToSend, setInvoiceToSend] = useState<Transaction | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const activeAccountName =
    instances.find((instance) => instance.id === selectedAccountId)?.name ??
    "Snitchpay.co";
  const displayTransactions = useMemo(
    () =>
      accountTransactions.map((transaction) => ({
        ...transaction,
        status: effectiveTransactionStatus(transaction),
      })),
    [accountTransactions],
  );
  const succeededCount = displayTransactions.filter(
    (transaction) => transaction.status === "Succeeded",
  ).length;
  const refundedCount = displayTransactions.filter(
    (transaction) => transaction.status === "Refunded",
  ).length;
  const disputedCount = displayTransactions.filter(
    (transaction) => transaction.status === "Disputed",
  ).length;
  const transactionFilters: Array<{
    label: TransactionFilter;
    count: number;
  }> = [
    { label: "All", count: displayTransactions.length },
    { label: "Succeeded", count: succeededCount },
    { label: "Refunded", count: refundedCount },
    { label: "Disputed", count: disputedCount },
  ];
  const visibleTransactions =
    activeTransactionFilter === "All"
      ? displayTransactions
      : displayTransactions.filter(
          (transaction) => transaction.status === activeTransactionFilter,
        );
  useEffect(() => {
    const invoiceIds = accountTransactions
      .filter((transaction) => isEthereumTransaction(transaction) && transaction.status !== "Succeeded" && (selectedAccountId !== DEMO_COMPANY_ID || transaction.walletCompanyId))
      .map((transaction) => invoiceIdFromTransaction(transaction));

    if (invoiceIds.length === 0) {
      return;
    }

    let cancelled = false;

    async function syncConfirmedPayments() {
      const response = await fetch(
        `/api/payments/status?invoiceIds=${encodeURIComponent(
          invoiceIds.join(","),
        )}`,
        { cache: "no-store" },
      ).catch(() => null);

      if (!response?.ok || cancelled) {
        return;
      }

      const result = (await response.json().catch(() => null)) as
        | {
            payments?: ConfirmedInvoicePayment[];
          }
        | null;

      result?.payments?.forEach((payment) => {
        if (payment.invoiceId && payment.status === "Succeeded") {
          onMarkPaymentSucceeded(payment.invoiceId, payment);
        }
      });
    }

    void syncConfirmedPayments();
    const intervalId = window.setInterval(syncConfirmedPayments, 6000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [accountTransactions, onMarkPaymentSucceeded, selectedAccountId]);
  const copyInvoiceLink = async (transaction: Transaction) => {
    if (!isEthereumTransaction(transaction) && !transaction.blockchain) return;
    const invoicePath = invoicePathFromTransaction(transaction, activeAccountName);
    const invoiceUrl =
      typeof window === "undefined"
        ? invoicePath
        : new URL(invoicePath, window.location.origin).href;

    try {
      await navigator.clipboard.writeText(transaction.blockchain?.hash ?? invoiceUrl);
      setReceiptStatus({
        tone: "success",
        message: transaction.blockchain ? "Transaction hash copied." : `${invoiceIdFromTransaction(transaction)} link copied.`,
      });
    } catch {
      setReceiptStatus({
        tone: "error",
        message: "Could not copy this transaction reference.",
      });
    }
  };

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <div className="grid h-screen grid-cols-1 lg:grid-cols-[176px_minmax(0,1fr)]">
        <PaymentSidebar
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          instances={instances}
          selectedAccountId={selectedAccountId}
          setSelectedAccountId={setSelectedAccountId}
        />

        <section className="flex h-screen min-w-0 flex-col overflow-hidden px-5 py-0 xl:px-6">
          <div className="shrink-0">
            <header className="flex min-h-14 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-6">
                <div className="flex shrink-0 items-center gap-3">
                  <IconButton label="Filter payments" icon={SlidersHorizontal} />
                  <IconButton label="Table view" icon={Table2} />
                  <span className="inline-flex min-h-8 items-center rounded-full bg-muted px-3 text-sm font-semibold text-foreground">
                    50
                  </span>
                </div>

                <h1 className="whitespace-nowrap text-sm font-semibold">
                  Payments
                </h1>
              </div>

              <Button
                type="button"
                onClick={() => setIsCreatePaymentOpen(true)}
                className="h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="size-4" aria-hidden="true" />
                Create payment
              </Button>
            </header>


            <section className="flex min-h-11 items-center justify-between gap-4 border-b border-border py-1">
              <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
                <ButtonGroup
                  aria-label="Transaction status filters"
                  className="shrink-0 rounded-md"
                >
                  {transactionFilters.map((filter, index) => {
                    const active = activeTransactionFilter === filter.label;

                    return (
                      <Button
                        key={filter.label}
                        type="button"
                        variant="ghost"
                        onClick={() => setActiveTransactionFilter(filter.label)}
                        aria-pressed={active}
                        className={`h-8 rounded-none px-2.5 text-xs font-medium ${
                          index < transactionFilters.length - 1
                            ? "border-r border-border"
                            : ""
                        } ${
                          active
                            ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                            : "text-foreground hover:bg-muted"
                        }`}
                      >
                        {filter.label}
                        <span
                          className={`ml-1.5 rounded-md px-1.5 py-0.5 text-xs ${
                            active
                              ? "bg-white/20 text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {filter.count}
                        </span>
                      </Button>
                    );
                  })}
                </ButtonGroup>

                {["Date and time", "Amount", "Currency"].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className="inline-flex min-h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-[#cfd9e6] px-2.5 text-xs font-semibold text-[#26364f] transition-colors hover:bg-muted"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    {filter}
                  </button>
                ))}
                {["Payment method", "More filters"].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className="inline-flex min-h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-[#cfd9e6] px-2.5 text-xs font-semibold text-[#26364f] transition-colors hover:bg-muted"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    {filter}
                  </button>
                ))}
                <button
                  type="button"
                  className="min-h-7 shrink-0 px-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Clear filters
                </button>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    downloadTransactionsCsv(
                      visibleTransactions,
                      activeTransactionFilter,
                    )
                  }
                  className="h-8 rounded-lg px-3 text-sm font-semibold text-[#31425c]"
                >
                  <Download className="size-4" aria-hidden="true" />
                  Export
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-lg px-3 text-sm font-semibold text-[#31425c]"
                >
                  <Settings className="size-4" aria-hidden="true" />
                  Edit columns
                </Button>
              </div>
            </section>
            {receiptStatus ? (
              <p
                role={receiptStatus.tone === "success" ? "status" : "alert"}
                className={`mt-2 text-sm ${
                  receiptStatus.tone === "success"
                    ? "text-emerald-700"
                    : "text-destructive"
                }`}
              >
                {receiptStatus.message}
              </p>
            ) : null}
          </div>

          <section
            aria-label="Received payments"
            className="min-h-0 flex-1 overflow-auto"
          >
            <div className="min-w-0">
              <div className="sticky top-0 z-10 grid min-h-11 grid-cols-[24px_minmax(104px,0.9fr)_minmax(96px,0.8fr)_minmax(140px,1.35fr)_minmax(100px,0.9fr)_minmax(100px,0.85fr)_minmax(140px,1.15fr)_minmax(72px,0.65fr)_104px] items-center gap-x-2 border-b border-border bg-background pr-1 text-sm font-medium text-[#1f2a3d]">
                <div>
                  <Checkbox aria-label="Select all transactions" />
                </div>
                <div>Amount</div>
                <div>Payment method</div>
                <div>Description</div>
                <div>Customer</div>
                <div>Status</div>
                <div>Date and Time</div>
                <div>Invoice</div>
                <div aria-label="Actions" />
              </div>

              <div className="divide-y divide-border">
                {visibleTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="grid min-h-[3rem] grid-cols-[24px_minmax(104px,0.9fr)_minmax(96px,0.8fr)_minmax(140px,1.35fr)_minmax(100px,0.9fr)_minmax(100px,0.85fr)_minmax(140px,1.15fr)_minmax(72px,0.65fr)_104px] items-center gap-x-2 bg-background pr-1 transition-colors hover:bg-muted/50"
                  >
                    <div>
                      <Checkbox aria-label={`Select ${transaction.id}`} />
                    </div>
                    <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                      <span title={`${transaction.amount} ETH`} className="min-w-0 truncate text-sm font-semibold tabular-nums text-[#1f2a3d]">
                        {transaction.amount}
                      </span>
                      <span className="shrink-0 text-sm text-[#1f2a3d]">
                        ETH
                      </span>
                    </div>
                    {transaction.status === "Succeeded" && (transaction.blockchain || transaction.confirmedPayment) ? (
                      <a
                        href={transaction.blockchain?.explorerUrl ?? transaction.confirmedPayment?.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View ${transaction.network ?? ETHEREUM_NETWORK_NAME} payment ${invoiceIdFromTransaction(transaction)} on explorer (opens in a new tab)`}
                        title="View transaction on explorer"
                        className="flex min-w-0 items-center gap-2 rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <AssetMark coin={transaction.currency} network={transaction.network} />
                        <span className="truncate text-[0.82rem] text-[#4a5260]">
                          {isEthereumTransaction(transaction) ? "Ethereum" : "Base ETH"}
                        </span>
                      </a>
                    ) : <div className="flex min-w-0 items-center gap-2" title={transaction.network ?? ETHEREUM_NETWORK_NAME}>
                      <AssetMark coin={transaction.currency} network={transaction.network} />
                      <span className="truncate text-[0.82rem] text-[#4a5260]">
                        {isEthereumTransaction(transaction) ? "Ethereum" : "Base ETH"}
                      </span>
                    </div>}
                    <div className="min-w-0 truncate font-mono text-[0.82rem] text-[#1f2a3d]">
                      {transaction.description}
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="min-w-0 truncate text-[0.82rem] font-medium text-[#1f2a3d]">
                          {customerNameFromTransaction(transaction)}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <StatusBadge
                        label={transaction.status}
                        tone={transactionStatusTone[transaction.status]}
                      />
                    </div>
                    <div className="min-w-0">
                        <p title={formatSavedRecordDate(transaction.dateTime)} className="truncate text-[0.82rem] text-[#4a5260]">
                          {formatSavedRecordDate(transaction.dateTime)}
                        </p>
                    </div>
                    <div className="min-w-0">
                      {transaction.blockchain || isEthereumTransaction(transaction) ? (
                      <div className="inline-flex max-w-full items-center gap-1.5">
                        <a
                          href={invoicePathFromTransaction(
                            transaction,
                            activeAccountName,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          title={transaction.blockchain ? `${transaction.blockchain.network} · ${transaction.blockchain.hash}` : undefined}
                          aria-label={transaction.blockchain ? `View ${transaction.blockchain.hash} on ${transaction.blockchain.network} explorer` : undefined}
                          className="min-w-0 truncate text-[0.82rem] font-medium text-[#1f2a3d] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {invoiceIdFromTransaction(transaction)}
                          {transaction.blockchain ? <span className="block truncate font-mono text-[0.64rem] text-muted-foreground">{transaction.blockchain.hash.slice(0, 8)}…{transaction.blockchain.hash.slice(-4)} ↗</span> : null}
                        </a>
                        <button
                          type="button"
                          aria-label={transaction.blockchain ? `Copy transaction hash ${transaction.blockchain.hash}` : `Copy link for ${invoiceIdFromTransaction(
                            transaction,
                          )}`}
                          title={transaction.blockchain ? "Copy transaction hash" : "Copy invoice link"}
                          onClick={() => void copyInvoiceLink(transaction)}
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <Copy className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                      ) : (
                        <span
                          className="block truncate text-[0.82rem] font-medium text-[#1f2a3d]"
                          title={invoiceIdFromTransaction(transaction)}
                        >
                          {invoiceIdFromTransaction(transaction)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-end">
                      <div className="inline-flex rounded-lg border border-border bg-background shadow-sm">
                        <TransactionActionButton
                          label="Refund payment"
                          icon={RotateCcw}
                          disabled={selectedAccountId === DEMO_COMPANY_ID || !isEthereumTransaction(transaction)}
                          className="rounded-l-lg rounded-r-none border-r border-border"
                        />
                        <TransactionActionButton
                          label="Send invoice"
                          icon={ReceiptText}
                          disabled={(selectedAccountId === DEMO_COMPANY_ID && !transaction.walletCompanyId) || !isEthereumTransaction(transaction)}
                          onClick={() => {
                            setReceiptStatus(null);
                            setInvoiceToSend(transaction);
                          }}
                          className="rounded-none border-r border-border"
                        />
                        <TransactionActionButton
                          label="Remove invoice"
                          icon={Trash2}
                          onClick={() => onRemoveTransaction(transaction.id)}
                          className="rounded-l-none rounded-r-lg"
                          tooltipClassName="right-0"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {visibleTransactions.length === 0 ? (
                <div className="grid min-h-40 place-items-center border-b border-border text-sm text-muted-foreground">
                  No {activeTransactionFilter.toLowerCase()} payments yet.
                </div>
              ) : null}

              <p className="border-t border-border py-4 text-sm text-[#4a5260]">
                {visibleTransactions.length} items
              </p>
            </div>
          </section>
        </section>
      </div>

      {isCreatePaymentOpen ? (
        <CreatePaymentModal
          key={selectedAccountId}
          accountName={activeAccountName}
          companyId={selectedAccountId}
          onCreatePayment={onCreatePayment}
          onClose={() => setIsCreatePaymentOpen(false)}
        />
      ) : null}
      {invoiceToSend ? (
        <SendInvoiceModal
          accountName={activeAccountName}
          transaction={invoiceToSend}
          onClose={() => setInvoiceToSend(null)}
          onSent={(message) => setReceiptStatus({ tone: "success", message })}
        />
      ) : null}
    </main>
  );
}

function PayoutWalletAddress({
  label,
  address,
  explorerUrl,
}: {
  label: string;
  address: string;
  explorerUrl?: string;
}) {
  const [copiedAddress, setCopiedAddress] = useState("");
  const [copyError, setCopyError] = useState("");
  let walletAddress = "";
  try {
    walletAddress = getAddress(address);
  } catch {
    // Never display a malformed wallet address.
  }

  const copyAddress = async () => {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopiedAddress(walletAddress);
    } catch {
      setCopyError("Couldn't copy. Select the address to copy it manually.");
    }
  };

  return (
    <section aria-label={label} className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {walletAddress ? (
          <button
            type="button"
            aria-label={`Copy ${label.toLowerCase()} address`}
            title={copiedAddress === walletAddress ? "Copied" : "Copy address"}
            onClick={() => void copyAddress()}
            className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copiedAddress === walletAddress ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          </button>
        ) : null}
      </div>
      {walletAddress ? <code className="block max-w-[28ch] select-text break-all text-xs leading-5 text-foreground">{walletAddress}</code> : <p className="mt-2 text-xs text-muted-foreground">Wallet address unavailable</p>}
      {walletAddress && explorerUrl ? (
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          View on explorer <ArrowRight className="size-3 -rotate-45" aria-hidden="true" />
        </a>
      ) : null}
      <span role="status" className="sr-only">{copiedAddress === walletAddress && walletAddress ? `${label} address copied` : ""}</span>
      {copyError ? <p role="alert" className="mt-2 text-xs text-destructive">{copyError}</p> : null}
    </section>
  );
}

function PaymentDetails({
  payment,
  onClose,
}: {
  payment: Payment;
  onClose: () => void;
}) {
  const blockchain = payment.blockchain;
  const transactionHash = blockchain?.hash ?? payment.transactionHash;
  const explorerUrl = blockchain?.explorerUrl ?? (transactionHash ? getEthereumExplorerUrl(transactionHash) : undefined);
  const confirmedBlock = blockchain?.blockNumber ?? payment.confirmedBlock;
  const settled = Boolean(blockchain || (transactionHash && payment.status === "Succeeded"));
  const sourceWallet = blockchain?.from ?? payment.address;
  const receiverWallet = blockchain?.to ?? payment.payoutKey;
  const assetLabel = payment.network === "Base Sepolia" ? "Base ETH" : payment.senderToken;

  const tracking = blockchain ? [
    {
      title: "Transfer confirmed onchain",
      meta: `${blockchain.network} · Block ${blockchain.blockNumber}`,
      time: formatBlockchainDate(blockchain.blockTimestamp),
      description: `${blockchain.amountEth} ETH transferred. The transaction receipt records a successful execution.`,
    },
    {
      title: "Public record verified",
      meta: "Transaction receipt verified",
      time: formatBlockchainDate(blockchain.verifiedAt),
      description: null,
    },
  ] : transactionHash ? [
    {
      title: "Submitted through Privy",
      meta: `${payment.network} · Company wallet`,
      time: payment.dateTime,
      description: "Authorized from your company wallet.",
    },
    {
      title: settled ? "Transfer confirmed onchain" : payment.status === "Failed" ? "Transaction reverted" : "Waiting for confirmation",
      meta: confirmedBlock ? `Block ${confirmedBlock}` : null,
      time: payment.confirmedAt ? formatBlockchainDate(payment.confirmedAt) : null,
      description: settled ? `${payment.senderAmount} ETH received by the recipient wallet.` : payment.status === "Failed" ? "The network rejected this transfer. Funds were not transferred; gas may have been charged." : "The transaction has been submitted. Its receipt is checked automatically.",
    },
  ] : [
    {
      title: "Payout request",
      meta: `${payment.network} · native ETH`,
      time: payment.dateTime,
      description: null,
    },
    {
      title: payment.status === "Failed" ? "Payout not completed" : "Awaiting completion",
      meta: null,
      time: null,
      description: "No confirmed blockchain transaction is attached to this payout.",
    },
  ];

  return (
    <aside className="hidden min-w-0 overflow-hidden bg-background lg:block">
      <header className="flex min-h-14 min-w-0 items-center justify-between gap-2 px-5">
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-border px-3 py-1.5">
          <Hash className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="truncate font-mono text-xs font-medium">{payment.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="h-[calc(100vh-56px)] overflow-auto px-5 pb-6">
        <section className="pt-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium tracking-[-0.01em] text-foreground">
              Payout details
            </p>
            <StatusBadge label={payment.status} tone={statusTone[payment.status]} />
          </div>

          <div className="mt-4">
            <div className="grid gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Date &amp; Time
                </p>
                <p className="mt-1 text-xs font-normal">
                  {formatSavedRecordDate(payment.dateTime)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Network
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs font-normal">
                  <AssetMark coin={payment.senderToken} network={payment.network} />
                  {payment.network}
                </p>
              </div>
            </div>

            <div className="my-4 h-px bg-border" />

            <div className="grid gap-3">
              <PayoutWalletAddress key={`source-${sourceWallet}`} label="Source wallet" address={sourceWallet} explorerUrl={blockchain ? blockchainAddressUrl(blockchain, sourceWallet) : transactionHash ? `https://sepolia.etherscan.io/address/${sourceWallet}` : undefined} />
              <PayoutWalletAddress key={`receiver-${receiverWallet}`} label="Recipient wallet" address={receiverWallet} explorerUrl={blockchain ? blockchainAddressUrl(blockchain, receiverWallet) : transactionHash ? `https://sepolia.etherscan.io/address/${receiverWallet}` : undefined} />
            </div>

            <div className="my-4 h-px bg-border" />

            <section>
              <p className="text-xs font-medium text-muted-foreground">
                Recipient
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <p className="text-[0.68rem] font-normal text-muted-foreground">
                    Name
                  </p>
                  <p className="mt-1 text-xs font-normal">{payment.receiver}</p>
                </div>
                <div>
                  <p className="text-[0.68rem] font-normal text-muted-foreground">
                    Company
                  </p>
                  <p className="mt-1 text-xs font-normal">{payment.company}</p>
                </div>
                <div>
                  <p className="text-[0.68rem] font-normal text-muted-foreground">
                    Destination Asset
                  </p>
                  <p className="mt-1 text-xs font-normal">{assetLabel}</p>
                </div>
                <div>
                  <p className="text-[0.68rem] font-normal text-muted-foreground">
                    Account Type
                  </p>
                  <p className="mt-1 text-xs font-normal">{payment.network} wallet</p>
                </div>
              </div>
            </section>

            <div className="my-4 border-t border-dashed border-border" />

            <section className="grid gap-3">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-baseline gap-4">
                <p className="text-xs font-normal text-muted-foreground">
                  Sending Amount
                </p>
                <p className="break-all text-right font-mono text-xs font-normal tabular-nums">
                  {payment.senderAmount} {assetLabel}
                </p>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-baseline gap-4">
                <p className="text-xs font-normal text-muted-foreground">
                  Network gas fee
                </p>
                <p className="text-right text-xs text-muted-foreground">
                  {explorerUrl ? <a href={explorerUrl} target="_blank" rel="noreferrer" className="rounded-sm underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View transaction fee ↗</a> : "Not available"}
                </p>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-baseline gap-4">
                <p className="text-xs font-normal text-muted-foreground">
                  {settled ? "Amount received" : "Requested amount"}
                </p>
                <p className="break-all text-right font-mono text-xs font-normal tabular-nums">
                  {payment.receiverAmount} {assetLabel}
                </p>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-baseline gap-4">
                <p className="text-xs font-normal text-muted-foreground">
                  Settlement
                </p>
                <p className="text-right text-xs text-muted-foreground">
                  {settled ? "Confirmed onchain" : payment.transactionHash && payment.status === "Failed" ? "Reverted" : "Not confirmed"}
                </p>
              </div>
            </section>
            {explorerUrl && transactionHash ? <section className="mt-5 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">Blockchain transaction</p>
              <a href={explorerUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all rounded-sm font-mono text-xs leading-5 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{transactionHash} ↗</a>
              <p className="mt-2 text-xs text-muted-foreground">{confirmedBlock ? `Block ${confirmedBlock} · ` : ""}{payment.network}</p>
            </section> : null}
          </div>
        </section>

        <section className="mt-6 border-t border-border pt-5">
          <p className="text-sm font-normal">Payout Tracking</p>
          <div className="mt-5 space-y-6">
            {tracking.map((item, index) => (
              <article key={item.title} className="relative pl-6">
                <span
                  className="absolute left-0 top-1.5 size-2.5 rounded-full bg-muted-foreground"
                  aria-hidden="true"
                />
                {index < tracking.length - 1 ? (
                  <span
                    className="absolute bottom-[-30px] left-[4px] top-5 w-px bg-border"
                    aria-hidden="true"
                  />
                ) : null}
                <p className="text-sm font-normal">{item.title}</p>
                {item.meta ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.meta}
                  </p>
                ) : null}
                {item.description ? (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
                {item.time ? <p className="mt-2 text-xs text-muted-foreground">{formatSavedRecordDate(item.time)}</p> : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function ComplianceView({
  activeNav,
  setActiveNav,
  instances,
  selectedAccountId,
  setSelectedAccountId,
}: {
  activeNav: NavItem;
  setActiveNav: (item: NavItem) => void;
  instances: CompanyInstance[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
}) {
  const checks = [
    {
      title: "Personal Identity Verification",
      status: "Pending",
      tone: "neutral" as const,
      icon: UserRound,
      action: ArrowRight,
    },
    {
      title: "Business Verification",
      status: "Verifying",
      tone: "warning" as const,
      icon: Building2,
      action: MoreHorizontal,
    },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[176px_minmax(0,1fr)]">
        <PaymentSidebar
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          instances={instances}
          selectedAccountId={selectedAccountId}
          setSelectedAccountId={setSelectedAccountId}
        />

        <section className="min-w-0">
          <header className="flex min-h-14 items-center justify-between px-5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveNav("Payouts")}
                className="min-h-8 rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Accounts
              </button>
              <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="inline-flex min-h-8 items-center rounded-full border border-border px-3 text-xs font-medium">
                Onboarding
              </span>
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-[560px] flex-col items-center px-6 pt-8">
            <span className="inline-flex min-h-7 items-center rounded-full border border-border px-3 text-xs font-medium">
              Onboarding
            </span>
            <h1 className="mt-4 text-center text-4xl font-medium tracking-tight">
              Compliance
            </h1>
            <p className="mt-3 max-w-[480px] text-center text-base leading-6 text-muted-foreground">
              We need to verify who you are before you can send payments through
              Prism. Please continue to start the process.
            </p>

            <div className="mt-8 flex w-full items-start gap-3 rounded-lg border border-border px-4 py-4">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs leading-5">
                Please ensure that you remove any hats, glasses, or other items that
                may cover your face before taking a picture.
              </p>
            </div>

            <div className="mt-5 grid w-full gap-2.5">
              {checks.map((check) => (
                <button
                  key={check.title}
                  type="button"
                  className="grid min-h-18 w-full grid-cols-[40px_minmax(0,1fr)_118px_32px] items-center gap-3 rounded-lg border border-border px-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="flex size-9 items-center justify-center rounded-full border border-border">
                    <check.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
                      {check.title}
                    </span>
                    <span className="mt-1 inline-flex">
                      <StatusBadge label={check.status} tone={check.tone} />
                    </span>
                  </span>
                  <span className="text-center">
                    <span className="block text-xs text-muted-foreground">
                      Time to verify
                    </span>
                    <span className="mt-1 block text-xs font-medium">
                      2 business days
                    </span>
                  </span>
                  <check.action className="size-4 justify-self-end" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function ApiKeysView({
  activeNav,
  setActiveNav,
  instances,
  selectedAccountId,
  setSelectedAccountId,
  apiKeys,
  setApiKeys,
}: {
  activeNav: NavItem;
  setActiveNav: (item: NavItem) => void;
  instances: CompanyInstance[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  apiKeys: ApiKeyRecord[];
  setApiKeys: (keys: ApiKeyRecord[]) => void;
}) {
  const currentUser = useWorkspaceSession()?.user ?? demoUser;
  const [createOpen, setCreateOpen] = useState(false);
  const [ownedBy, setOwnedBy] = useState<"You" | "Service account">("You");
  const [permissions, setPermissions] = useState<"All" | "Restricted" | "Read only">(
    "All",
  );
  const [keyName, setKeyName] = useState("");
  const [newSecretKey, setNewSecretKey] = useState("");
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const selectedAccount =
    instances.find((instance) => instance.id === selectedAccountId) ??
    initialInstances[0];
  const accountApiKeys = apiKeys.filter(
    (apiKey) => apiKey.accountId === selectedAccountId,
  );

  const createSecretKey = () => {
    const idSuffix = Math.random().toString(36).slice(2, 10).toUpperCase();
    const name = keyName.trim() || `${selectedAccount.name} key`;
    const publishablePrefix =
      selectedAccountId === "inst_final_snitch" ? "pk_live" : "pk_test";
    const visiblePublishable = `${publishablePrefix}_${selectedAccount.initials}${idSuffix}${Math.random()
      .toString(36)
      .slice(2, 18)}`;
    const visibleSecret = `sk-proj-${idSuffix}${Math.random()
      .toString(36)
      .slice(2, 18)}${Date.now().toString(36)}`;

    setApiKeys([
      ...apiKeys,
      {
        id: `key_${idSuffix}`,
        accountId: selectedAccountId,
        name,
        status: "Active",
        trackingId: `key_${idSuffix}`,
        publishableKey: visiblePublishable,
        secretKey: `sk-...${visibleSecret.slice(-4)}`,
        secretKeyValue: visibleSecret,
        lastUsed: "Never",
        created: "May 6, 2026",
        createdBy:
          ownedBy === "You" ? currentUser.name : `${selectedAccount.name} service`,
        permissions,
      },
    ]);
    setKeyName("");
    setOwnedBy("You");
    setPermissions("All");
    setNewSecretKey(visibleSecret);
  };

  const closeCreateFlow = () => {
    setCreateOpen(false);
    setNewSecretKey("");
    setKeyName("");
    setOwnedBy("You");
    setPermissions("All");
  };

  const rotateKey = (keyId: string) => {
    const idSuffix = Math.random().toString(36).slice(2, 10).toUpperCase();
    const publishablePrefix =
      selectedAccountId === "inst_final_snitch" ? "pk_live" : "pk_test";
    const nextPublishableKey = `${publishablePrefix}_${selectedAccount.initials}${idSuffix}${Math.random()
      .toString(36)
      .slice(2, 18)}`;
    const nextSecretKey = `sk-proj-${idSuffix}${Math.random()
      .toString(36)
      .slice(2, 18)}${Date.now().toString(36)}`;

    setApiKeys(
      apiKeys.map((key) =>
        key.id === keyId
          ? {
              ...key,
              publishableKey: nextPublishableKey,
              secretKey: `sk-...${nextSecretKey.slice(-4)}`,
              secretKeyValue: nextSecretKey,
              lastUsed: "Never",
            }
          : key,
      ),
    );
    setOpenActionMenu(null);
    setActionMenuPosition(null);
    setNewSecretKey(nextSecretKey);
    setCreateOpen(true);
  };

  const copyApiKey = (apiKey: string) => {
    navigator.clipboard?.writeText(apiKey);
    setOpenActionMenu(null);
    setActionMenuPosition(null);
  };

  const removeKeyPair = (keyId: string) => {
    setApiKeys(apiKeys.filter((key) => key.id !== keyId));
    setOpenActionMenu(null);
    setActionMenuPosition(null);
  };

  const closeActionMenu = () => {
    setOpenActionMenu(null);
    setActionMenuPosition(null);
  };

  const toggleActionMenu = (
    menuId: string,
    event: { currentTarget: HTMLButtonElement },
  ) => {
    if (openActionMenu === menuId) {
      closeActionMenu();
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 154;
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      window.innerWidth - menuWidth - 8,
    );
    const top =
      rect.top > menuHeight + 12 ? rect.top - menuHeight - 8 : rect.bottom + 8;

    setActionMenuPosition({ top, left });
    setOpenActionMenu(menuId);
  };

  const activeActionKey = openActionMenu
    ? accountApiKeys.find((apiKey) =>
        openActionMenu.startsWith(`${apiKey.id}:`),
      )
    : undefined;
  const activeActionType = openActionMenu?.endsWith(":publishable")
    ? "publishable"
    : "secret";

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <div className="grid h-screen grid-cols-1 lg:grid-cols-[176px_minmax(0,1fr)]">
        <PaymentSidebar
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          instances={instances}
          selectedAccountId={selectedAccountId}
          setSelectedAccountId={setSelectedAccountId}
        />

        <section className="h-screen min-w-0 overflow-auto px-5 py-5 xl:px-7">
          <div className="mx-auto max-w-[1280px]">
            <nav
              aria-label="API keys breadcrumb"
              className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"
            >
              <button
                type="button"
                onClick={() => setActiveNav("Dashboard")}
                className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Accounts
              </button>
              <ChevronRight className="size-4" aria-hidden="true" />
              <span className="text-foreground">API</span>
            </nav>

            <div className="min-h-[calc(100vh-76px)] overflow-hidden bg-background">
            <header className="flex min-h-16 items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-medium tracking-[-0.03em]">
                  API keys
                </h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedAccount.name}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="h-10 rounded-lg px-4 text-sm"
              >
                <Plus className="size-4" aria-hidden="true" />
                Create new secret key
              </Button>
            </header>

            <div className="py-7">
              <div className="max-w-5xl space-y-5 text-sm leading-6 text-[#2f3033]">
                <p>
                  You have permission to view and manage all API keys for this
                  account.
                </p>
                <p>
                  Do not share your API key with others or expose it in browser or
                  client-side code. To protect account security, Snitch may
                  automatically disable any key that appears to have leaked publicly.
                </p>
                <p>
                  View usage per API key on the{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => setActiveNav("Wallets")}
                  >
                    usage page
                  </button>
                  .
                </p>
              </div>

              <div className="mt-10 max-w-full">
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-medium tracking-[-0.03em]">
                      Standard keys
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Use the publishable key in client-side checkout and secret
                      keys on trusted servers.
                    </p>
                  </div>
                </div>

                <div className="max-w-full overflow-x-auto pb-4">
                  <div className="min-w-[1280px] max-w-7xl">
                    <div className="grid grid-cols-[1.05fr_0.7fr_1.3fr_1.55fr_0.9fr_1fr_1.15fr_0.9fr_52px] gap-4 border-b border-border pb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#333333]">
                      <div>Name</div>
                      <div>Status</div>
                      <div>Tracking ID</div>
                      <div>Secret Key</div>
                      <div>Last used</div>
                      <div>Project Access</div>
                      <div>Created by</div>
                      <div>Permissions</div>
                      <div />
                    </div>

                    <div className="divide-y divide-border">
                  {accountApiKeys.map((apiKey) => (
                    <div key={apiKey.id} className="contents">
                      <div className="grid min-h-14 grid-cols-[1.05fr_0.7fr_1.3fr_1.55fr_0.9fr_1fr_1.15fr_0.9fr_52px] items-center gap-4 text-sm">
                        <div className="font-medium">Publishable key</div>
                        <div>{apiKey.status}</div>
                        <div className="min-w-0 truncate font-mono text-muted-foreground">
                          {apiKey.trackingId}-pub
                        </div>
                        <div className="min-w-0 truncate font-mono text-muted-foreground">
                          {apiKey.publishableKey}
                        </div>
                        <div>{apiKey.lastUsed}</div>
                        <div>{selectedAccount.name}</div>
                        <div>{apiKey.createdBy}</div>
                        <div>Public</div>
                        <div className="relative flex justify-end">
                          <button
                            type="button"
                            aria-label="Publishable key actions"
                            onClick={(event) =>
                              toggleActionMenu(`${apiKey.id}:publishable`, event)
                            }
                            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <MoreHorizontal className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <div className="grid min-h-14 grid-cols-[1.05fr_0.7fr_1.3fr_1.55fr_0.9fr_1fr_1.15fr_0.9fr_52px] items-center gap-4 text-sm">
                        <div className="truncate font-medium">Secret key</div>
                        <div>{apiKey.status}</div>
                        <div className="min-w-0 truncate font-mono text-muted-foreground">
                          {apiKey.trackingId}
                        </div>
                        <div className="min-w-0 truncate font-mono text-muted-foreground">
                          {apiKey.secretKey}
                        </div>
                        <div>{apiKey.lastUsed}</div>
                        <div>{selectedAccount.name}</div>
                        <div>{apiKey.createdBy}</div>
                        <div>{apiKey.permissions}</div>
                        <div className="relative flex justify-end">
                          <button
                            type="button"
                            aria-label="Secret key actions"
                            onClick={(event) =>
                              toggleActionMenu(`${apiKey.id}:secret`, event)
                            }
                            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <MoreHorizontal className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {accountApiKeys.length === 0 ? (
                    <div className="grid min-h-36 place-items-center text-sm text-muted-foreground">
                      No API keys yet for this account.
                    </div>
                  ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </section>
      </div>

      {activeActionKey && actionMenuPosition ? (
        <div
          className="fixed z-[60] w-44 overflow-hidden rounded-lg border border-border bg-background py-1 text-sm shadow-lg"
          style={{
            top: actionMenuPosition.top,
            left: actionMenuPosition.left,
          }}
        >
          <button
            type="button"
            onClick={() =>
              copyApiKey(
                activeActionType === "publishable"
                  ? activeActionKey.publishableKey
                  : activeActionKey.secretKeyValue,
              )
            }
            className="flex min-h-9 w-full items-center px-3 text-left text-[#635bff] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            Copy API key
          </button>
          <button
            type="button"
            onClick={() => rotateKey(activeActionKey.id)}
            className="flex min-h-9 w-full items-center px-3 text-left text-[#635bff] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            Rotate key
          </button>
          <button
            type="button"
            onClick={closeActionMenu}
            className="flex min-h-9 w-full items-center px-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            View request logs
          </button>
          <button
            type="button"
            onClick={() => removeKeyPair(activeActionKey.id)}
            className="flex min-h-9 w-full items-center px-3 text-left text-destructive transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            Remove API key
          </button>
        </div>
      ) : null}

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="secret-key-dialog-title"
        >
          <div className="w-full max-w-[520px] rounded-xl bg-background p-6 shadow-2xl">
            {newSecretKey ? (
              <>
                <h2
                  id="secret-key-dialog-title"
                  className="text-xl font-medium tracking-[-0.03em]"
                >
                  Save your key
                </h2>
                <div className="mt-4 grid gap-4">
                  <p className="max-w-[440px] text-sm leading-6 text-foreground">
                    Please save your secret key in a safe place since{" "}
                    <span className="font-semibold">
                      you won&apos;t be able to view it again.
                    </span>{" "}
                    Keep it secure, as anyone with your API key can make requests
                    for this account.
                  </p>
                  <button
                    type="button"
                    className="w-fit text-sm underline underline-offset-2 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Learn more about API key best practices
                  </button>
                  <div className="flex min-h-12 items-center gap-2 rounded-lg border border-border px-3">
                    <span className="min-w-0 flex-1 truncate font-mono text-sm text-[#1f2a3d]">
                      {newSecretKey}
                    </span>
                    <Button
                      type="button"
                      className="h-9 rounded-lg px-3"
                      onClick={() => navigator.clipboard?.writeText(newSecretKey)}
                    >
                      <Copy className="size-4" aria-hidden="true" />
                      Copy
                    </Button>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Permissions</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {permissions === "Read only"
                        ? "Read only API resources"
                        : permissions === "Restricted"
                          ? "Restricted API resources"
                          : "Read and write API resources"}
                    </p>
                  </div>
                </div>
                <footer className="mt-10 flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10 rounded-lg px-5"
                    onClick={closeCreateFlow}
                  >
                    Done
                  </Button>
                </footer>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <h2
                    id="secret-key-dialog-title"
                    className="text-xl font-medium tracking-[-0.03em]"
                  >
                    Create new secret key
                  </h2>
                  <button
                    type="button"
                    onClick={closeCreateFlow}
                    aria-label="Close secret key dialog"
                    className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-6 grid gap-5">
                  <section>
                    <p className="text-sm font-medium">Owned by</p>
                    <ButtonGroup className="mt-2 bg-muted" aria-label="Secret key owner">
                      {(["You", "Service account"] as const).map((owner) => (
                        <Button
                          key={owner}
                          type="button"
                          variant="ghost"
                          onClick={() => setOwnedBy(owner)}
                          className={`h-9 rounded-none px-4 text-sm ${
                            ownedBy === owner
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {owner}
                        </Button>
                      ))}
                    </ButtonGroup>
                    <p className="mt-4 max-w-[420px] text-sm leading-5 text-muted-foreground">
                      This API key can make requests against the selected Snitch
                      account. If access changes, this key can be disabled.
                    </p>
                  </section>

                  <label className="grid gap-2 text-sm font-medium">
                    <span>
                      Name <span className="font-normal text-muted-foreground">Optional</span>
                    </span>
                    <input
                      value={keyName}
                      onChange={(event) => setKeyName(event.target.value)}
                      placeholder="Testnet checkout key"
                      className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-medium">
                    Account
                    <select
                      value={selectedAccountId}
                      onChange={(event) => setSelectedAccountId(event.target.value)}
                      className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {instances.map((instance) => (
                        <option key={instance.id} value={instance.id}>
                          {instance.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <section>
                    <p className="text-sm font-medium">Permissions</p>
                    <ButtonGroup className="mt-2 bg-muted" aria-label="Secret key permissions">
                      {(["All", "Restricted", "Read only"] as const).map((permission) => (
                        <Button
                          key={permission}
                          type="button"
                          variant="ghost"
                          onClick={() => setPermissions(permission)}
                          className={`h-9 rounded-none px-4 text-sm ${
                            permissions === permission
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {permission}
                        </Button>
                      ))}
                    </ButtonGroup>
                  </section>
                </div>

                <footer className="mt-9 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-lg px-5"
                    onClick={closeCreateFlow}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="h-10 rounded-lg px-5"
                    onClick={createSecretKey}
                  >
                    Create secret key
                  </Button>
                </footer>
              </>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function LandingPage() {
  return <SnitchLandingPage />;
}

function companyPayoutRow(record: PendingCompanyPayout & {
  status?: PaymentStatus; blockNumber?: number; confirmedAt?: string;
}, saved: boolean): Payment {
  return {
    id: `PO_${record.transactionHash.slice(2, 18).toUpperCase()}`,
    walletCompanyId: record.companyId, transactionHash: record.transactionHash,
    saved, memo: record.memo,
    time: new Date(record.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    dateTime: formatDateTime(new Date(record.createdAt)), senderToken: "ETH", senderAmount: record.amount,
    receiverCurrency: "ETH", receiverAmount: record.amount,
    receiver: record.receiverName, company: record.receiverName,
    country: ETHEREUM_NETWORK_NAME, exchangeRate: "1.0000",
    payoutMethod: "Privy ETH transfer", payoutKeyLabel: "Receiver Wallet",
    payoutKey: record.to, network: ETHEREUM_NETWORK_NAME, address: record.from,
    status: record.status ?? "Incomplete", confirmedAt: record.confirmedAt, confirmedBlock: record.blockNumber,
  };
}

export default function HomePage({ workspace = false }: { workspace?: boolean } = {}) {
  const companyWallets = useCompanyWallets();
  const session = useWorkspaceSession();
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavItem>("Dashboard");
  const [instances, setInstances] =
    useState<CompanyInstance[]>(initialInstances);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>(initialApiKeys);
  const [accessMembersByAccount, setAccessMembersByAccount] = useState<
    Record<string, AccessMember[]>
  >({});
  const [transactionRows, setTransactionRows] =
    useState<Transaction[]>(() => transactions.map(showcaseTransaction));
  const [paymentRowsByAccount, setPaymentRowsByAccount] = useState<
    Record<string, Payment[]>
  >(() => ({
    inst_final_snitch: payments.map(showcasePayout),
  }));
  const [selectedAccountId, setSelectedAccountId] =
    useState(DEMO_COMPANY_ID);

  useEffect(() => {
    if (!companyWallets || companyWallets.loading || !session) return;
    const controller = new AbortController();
    const ownerId = session.user.id;
    const pending = readPendingCompanyPayouts(ownerId);
    const recoveryFrame = window.requestAnimationFrame(() => {
      if (controller.signal.aborted || !pending.length) return;
      setPaymentRowsByAccount(current => {
        const next = { ...current };
        for (const company of companyWallets.companies) {
          const accountId = company.purpose === "playground" ? DEMO_COMPANY_ID : company.id;
          const existing = next[accountId] ?? [];
          const recovered = pending.filter(row => row.companyId === company.id && !existing.some(item => item.transactionHash === row.transactionHash));
          if (recovered.length) next[accountId] = [...existing, ...recovered.map(row => companyPayoutRow(row, false))];
        }
        return next;
      });
    });
    for (const company of companyWallets.companies) {
      const accountId = company.purpose === "playground" ? DEMO_COMPANY_ID : company.id;
      void companyWallets.listCompanyPayouts(company.id).then(records => {
        if (controller.signal.aborted) return;
        records.forEach(record => forgetPendingCompanyPayout(ownerId, record.transactionHash));
        setPaymentRowsByAccount(current => ({ ...current, [accountId]: [
          ...records.map(record => companyPayoutRow(record, true)),
          ...(current[accountId] ?? []).filter(row => !records.some(record => record.transactionHash === row.transactionHash)),
        ] }));
      }).catch(() => undefined);
      void requestCompanyWallet<{ invoices: Array<Invoice & {status: "Incomplete" | "Succeeded"; payment: ConfirmedInvoicePayment | null}> }>(
        `/api/companies/${company.id}/invoices`, { signal: controller.signal, getAccessToken: session.getAccessToken },
      ).then(({ invoices }) => {
        if (controller.signal.aborted) return;
        const rows: Transaction[] = invoices.map(invoice => ({
          id: `TX_${invoice.id}`, companyId: accountId, walletCompanyId: company.id,
          amount: invoice.amount, currency: invoice.currency, network: ETHEREUM_NETWORK_NAME,
          dateTime: formatDateTime(new Date(invoice.createdAt)),
          description: `${invoice.id} · ${invoice.title} from ${invoice.customerName}`,
          customerName: invoice.customerName, invoiceId: invoice.id, invoiceTitle: invoice.title,
          memo: invoice.memo, dueDate: invoice.dueDate, paymentTerms: invoice.paymentTerms,
          treasuryAccount: invoice.treasuryAccount, status: invoice.status,
          confirmedPayment: invoice.payment ?? undefined,
        }));
        setTransactionRows(current => [...rows, ...current.filter(row => !rows.some(record => record.invoiceId === row.invoiceId && record.walletCompanyId === row.walletCompanyId))]);
      }).catch(() => undefined);
    }
    return () => { controller.abort(); window.cancelAnimationFrame(recoveryFrame); };
  }, [companyWallets, session]);

  const visibleInstances = useMemo(
    () =>
      companyWallets ? [...initialInstances.map(instance => {
        return instance.id === DEMO_COMPANY_ID ? { ...instance, treasuryAddress: SHOWCASE_COMPANY.walletAddress, walletStatus: "ready" as const } : instance;
      }), ...companyWallets.companies.filter(company => company.purpose !== "playground").map(company => ({
        id: company.id, name: company.name, initials: getInitials(company.name),
        receivers: "0 receivers", status: "Testnet", statusTone: "success" as StatusTone,
        activity: company.wallet.status === "ready" ? "Privy treasury ready" : "Finish wallet setup",
        createdAt: new Date(company.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        treasuryAddress: company.wallet.address, walletStatus: company.wallet.status,
      }))] : instances
        .filter((instance) => !legacyDemoAccountIds.has(instance.id))
        .map((instance) =>
          instance.id === "inst_final_snitch"
            ? { ...instance, name: "Snitchpay.co", initials: "SC", status: "Playground", activity: "", treasuryAddress: SHOWCASE_COMPANY.walletAddress, walletStatus: "ready" as const }
            : instance,
        ),
    [instances, companyWallets],
  );
  const activeAccountId = visibleInstances.some(
    (instance) => instance.id === selectedAccountId,
  )
    ? selectedAccountId
    : visibleInstances[0]?.id ?? "";
  const activeWalletCompany = resolveWalletCompany(companyWallets?.companies ?? [], activeAccountId);
  const teamScope = `${session?.user.id ?? "showcase"}:${activeAccountId}`;
  // The shared company's designated CFO is public directory information. Export
  // authority is independently verified by the server and Privy, not this row.
  const controllerTeam: AccessMember[] = activeAccountId === DEMO_COMPANY_ID ? [
    {
      id: "company_controller",
      name: SHOWCASE_COMPANY.cfoName,
      email: SHOWCASE_COMPANY.cfoEmail,
      role: "CFO",
      protected: true,
    },
    ...(session && session.user.id !== SHOWCASE_COMPANY.cfoUserId ? [{
      id: "current_viewer",
      name: session.user.name,
      email: session.user.email ?? "—",
      role: "View only" as AccessRole,
      protected: true,
    }] : []),
  ] : activeAccountId ? [
    {
      id: "company_controller",
      name: session?.user.name ?? demoUser.name,
      email: session?.user.email ?? (session ? "—" : "ayush@snitchpay.co"),
      role: session
        ? activeWalletCompany?.cfoUserId === session.user.id ? "CFO" : "Administrator"
        : "CFO",
      protected: true,
    },
  ] : [];
  const defaultTeamMembers: AccessMember[] = !session && activeAccountId === DEMO_COMPANY_ID
    ? [{ id: "member_dev", name: "Dev Console", email: "developers@snitchpay.co", role: "Developer" }]
    : [];
  const activeAccessMembers = [
    ...controllerTeam,
    ...(accessMembersByAccount[teamScope] ?? defaultTeamMembers),
  ];
  const updateActiveAccessMembers = (
    update: (members: AccessMember[]) => AccessMember[],
  ) => {
    if (!activeAccountId) return;
    setAccessMembersByAccount((current) => ({
      ...current,
      [teamScope]: update([...controllerTeam, ...(current[teamScope] ?? defaultTeamMembers)])
        .filter(member => !member.protected && member.role !== "CFO" && member.id !== "company_controller"),
    }));
  };
  const visibleApiKeys = useMemo(
    () =>
      apiKeys.map((key) =>
        key.accountId === "inst_final_snitch"
          ? {
              ...key,
              name:
                key.name === "Final Snitch server"
                  ? "Snitchpay.co server"
                  : key.name,
              secretKeyValue: key.secretKeyValue.replace(
                "FinalSnitch",
                "SnitchpayCo",
              ),
            }
          : key,
      ),
    [apiKeys],
  );

  const accountPayments = useMemo(
    () => {
      const rows = paymentRowsByAccount[activeAccountId] ?? [];
      return activeAccountId === DEMO_COMPANY_ID
        ? [...rows].sort((a, b) => Date.parse(b.dateTime) - Date.parse(a.dateTime))
        : rows;
    },
    [activeAccountId, paymentRowsByAccount],
  );
  const accountTransactions =
    transactionRows.filter(row => row.companyId === activeAccountId).sort((a, b) => Date.parse(b.dateTime) - Date.parse(a.dateTime));

  const createPayment = (payment: CreatedPaymentInput) => {
    if (!payment.companyId) {
      return;
    }

    const normalizedAmount = payment.amount.trim().replace(/,/g, "");
    const createdAt = new Date();
    const transactionId = `TX_${payment.invoiceId}`;

    setTransactionRows((currentRows) => [
      {
        id: transactionId,
        companyId: payment.companyId,
        walletCompanyId: payment.walletCompanyId,
        amount: normalizedAmount,
        currency: payment.currency,
        network: ETHEREUM_NETWORK_NAME,
        dateTime: formatDateTime(createdAt),
        description: `${payment.invoiceId} · ${payment.invoiceTitle} from ${payment.customerName}`,
        customerName: payment.customerName,
        invoiceId: payment.invoiceId,
        invoiceTitle: payment.invoiceTitle,
        memo: payment.memo,
        dueDate: payment.dueDate,
        paymentTerms: payment.paymentTerms,
        treasuryAccount: payment.treasuryAccount,
        status: "Incomplete",
      },
      ...currentRows,
    ]);
  };

  const createPayout = async (payout: CreatedPayoutInput) => {
    if (payout.receiverName.length > 120 || payout.memo.length > 1000) {
      throw new Error("Use a recipient name under 120 characters and a note under 1,000 characters.");
    }
    const accountId = activeAccountId;
    const company = resolveWalletCompany(companyWallets?.companies ?? [], accountId);
    if (!companyWallets || !company || company.wallet.status !== "ready") {
      throw new Error("Connect this company’s Privy wallet before sending a payout.");
    }
    const sent = await companyWallets.sendCompanyPayment(company.id, {
      to: payout.receiverWallet, amount: payout.payoutAmount,
    });
    // Preserve a broadcast hash immediately. Receipt verification never resends.
    const pending: PendingCompanyPayout = {
      ...sent, companyId: company.id, receiverName: payout.receiverName,
      memo: payout.memo, createdAt: new Date().toISOString(),
    };
    if (session) rememberPendingCompanyPayout(session.user.id, pending);
    const row = companyPayoutRow(pending, false);
    setPaymentRowsByAccount(currentRows => ({
      ...currentRows,
      [accountId]: [row, ...(currentRows[accountId] ?? []).filter(item => item.transactionHash !== sent.transactionHash)],
    }));
    return row.id;
  };

  useEffect(() => {
    if (!companyWallets || !session) return;
    const pending = Object.entries(paymentRowsByAccount).flatMap(([accountId, rows]) =>
      rows.filter(row => row.walletCompanyId && row.transactionHash && (!row.saved || row.status === "Incomplete"))
        .map(row => ({ accountId, row })),
    );
    if (!pending.length) return;
    let cancelled = false;
    let checking = false;
    async function confirmPayouts() {
      if (checking || cancelled) return;
      checking = true;
      try {
        const updates = await Promise.all(pending.map(async ({ accountId, row }) => {
          try {
            if (!row.saved) {
              const record = await companyWallets!.recordCompanyPayout(row.walletCompanyId!, {
                transactionHash: row.transactionHash!, to: row.payoutKey, amount: row.senderAmount,
                receiverName: row.receiver, memo: row.memo,
              });
              forgetPendingCompanyPayout(session!.user.id, record.transactionHash);
              return { accountId, row: companyPayoutRow(record, true) };
            }
            const result = await companyWallets!.confirmCompanyPayment(row.walletCompanyId!, {
              transactionHash: row.transactionHash!, to: row.payoutKey, amount: row.senderAmount,
            });
            if (cancelled || result.status === "Incomplete") return;
            return { accountId, row: { ...row, status: result.status, confirmedAt: result.confirmedAt, confirmedBlock: result.blockNumber } };
          } catch { /* Keep the hash pending; the next check retries verification only. */ }
        }));
        if (cancelled || !updates.some(Boolean)) return;
        setPaymentRowsByAccount(current => {
          const next = { ...current };
          for (const update of updates) {
            if (!update) continue;
            next[update.accountId] = (next[update.accountId] ?? []).map(item => item.transactionHash === update.row.transactionHash ? update.row : item);
          }
          return next;
        });
      } finally { checking = false; }
    }
    void confirmPayouts();
    const interval = window.setInterval(confirmPayouts, 12000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [companyWallets, paymentRowsByAccount, session]);

  const removeTransaction = (id: string) => {
    if (!activeAccountId) {
      return;
    }

    setTransactionRows((currentRows) =>
      currentRows.filter((transaction) => transaction.companyId !== activeAccountId || transaction.id !== id),
    );
  };

  const markPaymentSucceeded = (invoiceId: string, payment?: ConfirmedInvoicePayment) => {
    if (!activeAccountId) {
      return;
    }

    setTransactionRows((currentRows) =>
      currentRows.map((transaction) =>
        transaction.companyId === activeAccountId && isEthereumTransaction(transaction) && invoiceIdFromTransaction(transaction) === invoiceId
          ? { ...transaction, status: "Succeeded", confirmedPayment: payment ?? transaction.confirmedPayment }
          : transaction,
      ),
    );
  };

  useEffect(() => {
    if (workspace) return;

    const params = new URLSearchParams(window.location.search);

    if (params.get("demo") === "1") {
      const frameId = window.requestAnimationFrame(() => {
        setIsDemoOpen(true);
      });

      return () => window.cancelAnimationFrame(frameId);
    }
  }, [workspace]);

  if (!workspace && !isDemoOpen) {
    return <LandingPage />;
  }

  if (activeNav === "Dashboard" || (workspace && !activeAccountId)) {
    return (
      <DashboardView
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        instances={visibleInstances}
        setInstances={setInstances}
        selectedAccountId={activeAccountId}
        setSelectedAccountId={setSelectedAccountId}
      />
    );
  }

  if (activeNav === "Wallets") {
    return (
      <WalletsView
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        instances={visibleInstances}
        selectedAccountId={activeAccountId}
        setSelectedAccountId={setSelectedAccountId}
        accountPayments={accountPayments}
        accountTransactions={accountTransactions}
      />
    );
  }

  if (activeNav === "Connect") {
    return (
      <TeamView
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        instances={visibleInstances}
        selectedAccountId={activeAccountId}
        setSelectedAccountId={setSelectedAccountId}
        members={activeAccessMembers}
        setMembers={updateActiveAccessMembers}
      />
    );
  }

  if (activeNav === "Compliance") {
    return (
      <ComplianceView
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        instances={visibleInstances}
        selectedAccountId={activeAccountId}
        setSelectedAccountId={setSelectedAccountId}
      />
    );
  }

  if (activeNav === "Transactions") {
    return (
      <TransactionsView
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        instances={visibleInstances}
        selectedAccountId={activeAccountId}
        setSelectedAccountId={setSelectedAccountId}
        accountTransactions={accountTransactions}
        onCreatePayment={createPayment}
        onRemoveTransaction={removeTransaction}
        onMarkPaymentSucceeded={markPaymentSucceeded}
      />
    );
  }

  if (activeNav === "API Keys") {
    return (
      <ApiKeysView
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        instances={visibleInstances}
        selectedAccountId={activeAccountId}
        setSelectedAccountId={setSelectedAccountId}
        apiKeys={visibleApiKeys}
        setApiKeys={setApiKeys}
      />
    );
  }

  return (
    <PaymentsView
      activeNav={activeNav}
      setActiveNav={setActiveNav}
      instances={visibleInstances}
      selectedAccountId={activeAccountId}
      setSelectedAccountId={setSelectedAccountId}
      accountPayments={accountPayments}
      onCreatePayout={createPayout}
    />
  );
}
