"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";

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
  Printer,
  ReceiptText,
  RotateCcw,
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

type NetworkName = "Solana";

type StableCoin = "USDC" | "Tether" | "USDG" | "Palm USD";

type TransactionFilter =
  | "All"
  | "Succeeded"
  | "Refunded"
  | "Disputed"
  | "Confidential";

type TransactionActivityTab =
  | "Payments"
  | "Confidential Payments"
  | "All activity";

type Payment = {
  id: string;
  time: string;
  dateTime: string;
  senderToken: StableCoin;
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
  network: NetworkName;
  address: string;
  status: PaymentStatus;
};

type Transaction = {
  id: string;
  amountUsd: string;
  stablecoin: StableCoin;
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
  confidential?: boolean;
};

type CreatedPaymentInput = {
  invoiceId: string;
  customerName: string;
  invoiceTitle: string;
  memo: string;
  dueDate: string;
  amountUsd: string;
  stablecoin: StableCoin;
  paymentTerms: string;
  treasuryAccount: string;
  confidential: boolean;
  encryptFinancialData: boolean;
  financialVisibility: "plain" | "protected";
  paymentVisibility: "standard" | "confidential";
};

type CreatedPayoutInput = {
  receiverName: string;
  receiverWallet: string;
  destinationAsset: StableCoin;
  network: NetworkName;
  payoutAmount: string;
  approvalPolicy: string;
  treasuryAccount: string;
  memo: string;
  screenReceiverWallet: boolean;
  confidentialPayout: boolean;
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
  { label: "Compliance", icon: ShieldCheck },
  { label: "API Keys", icon: KeyRound },
];

const currentUser = {
  name: "Ayush Srivastava",
  initials: "AS",
};

const initialInstances: CompanyInstance[] = [
  {
    id: "inst_final_snitch",
    name: "Snitchpay.co",
    initials: "SC",
    receivers: "18 receivers",
    status: "Production",
    statusTone: "success" as StatusTone,
    activity: "$7,197.99 available",
    createdAt: "Updated May 10",
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

const snitchpayTreasuryWallet = "J7XpHFtKQUB66NajCPdoQU4HFR8iTjS6wtq4foKA1CYn";

const payments: Payment[] = [
  {
    id: "PO_8B29A1F72C90",
    time: "11:17 PM",
    dateTime: "May 10, 2026, 11:17 PM",
    senderToken: "USDC",
    senderAmount: "1,240.00",
    receiverCurrency: "BRL",
    receiverAmount: "6,085.55",
    receiver: "Sophia Mendes",
    company: "Luma Comercio",
    country: "Brazil",
    exchangeRate: "4.9077",
    payoutMethod: "PIX Instant",
    payoutKeyLabel: "PIX Key",
    payoutKey: "417.890.***-22",
    network: "Solana",
    address: snitchpayTreasuryWallet,
    status: "Succeeded",
  },
  {
    id: "PO_C14E7D8A92F3",
    time: "10:21 PM",
    dateTime: "May 9, 2026, 10:21 PM",
    senderToken: "Tether",
    senderAmount: "72.40",
    receiverCurrency: "ARS",
    receiverAmount: "100,853.20",
    receiver: "Mateo Alvarez",
    company: "Rio Plata Imports",
    country: "Argentina",
    exchangeRate: "1,393.0000",
    payoutMethod: "Bank Transfer",
    payoutKeyLabel: "CBU",
    payoutKey: "00001903****6241",
    network: "Solana",
    address: snitchpayTreasuryWallet,
    status: "Succeeded",
  },
  {
    id: "PO_7DA0E4B19C66",
    time: "10:09 PM",
    dateTime: "May 8, 2026, 10:09 PM",
    senderToken: "USDG",
    senderAmount: "980.00",
    receiverCurrency: "CAD",
    receiverAmount: "1,334.47",
    receiver: "Olivia Chen",
    company: "Maple North Goods",
    country: "Canada",
    exchangeRate: "1.3617",
    payoutMethod: "Bank Transfer",
    payoutKeyLabel: "Account",
    payoutKey: "Transit 03412 **** 8419",
    network: "Solana",
    address: snitchpayTreasuryWallet,
    status: "Failed",
  },
  {
    id: "PO_2F5BD907A118",
    time: "10:09 PM",
    dateTime: "May 8, 2026, 10:09 PM",
    senderToken: "Palm USD",
    senderAmount: "415.75",
    receiverCurrency: "MXN",
    receiverAmount: "7,244.03",
    receiver: "Camila Torres",
    company: "Norte Retail",
    country: "Mexico",
    exchangeRate: "17.4240",
    payoutMethod: "SPEI",
    payoutKeyLabel: "CLABE",
    payoutKey: "002180****7712",
    network: "Solana",
    address: snitchpayTreasuryWallet,
    status: "Incomplete",
  },
  {
    id: "PO_D4E8C3FA7019",
    time: "9:52 PM",
    dateTime: "May 7, 2026, 9:52 PM",
    senderToken: "USDG",
    senderAmount: "760.00",
    receiverCurrency: "GBP",
    receiverAmount: "561.11",
    receiver: "James Walker",
    company: "Albion Studio",
    country: "United Kingdom",
    exchangeRate: "0.7383",
    payoutMethod: "Faster Payments",
    payoutKeyLabel: "Sort Code",
    payoutKey: "20-18-** / **** 4921",
    network: "Solana",
    address: snitchpayTreasuryWallet,
    status: "Incomplete",
  },
  {
    id: "PO_68AB1C32D4F0",
    time: "9:52 PM",
    dateTime: "May 7, 2026, 9:52 PM",
    senderToken: "USDC",
    senderAmount: "250.00",
    receiverCurrency: "BRL",
    receiverAmount: "1,226.93",
    receiver: "Ines Ferreira",
    company: "Porto Medical",
    country: "Brazil",
    exchangeRate: "4.9077",
    payoutMethod: "PIX Instant",
    payoutKeyLabel: "PIX Key",
    payoutKey: "319.210.***-48",
    network: "Solana",
    address: snitchpayTreasuryWallet,
    status: "Succeeded",
  },
  {
    id: "PO_9C31F0E74B26",
    time: "9:48 PM",
    dateTime: "May 6, 2026, 9:48 PM",
    senderToken: "Tether",
    senderAmount: "188.50",
    receiverCurrency: "CLP",
    receiverAmount: "172,768.78",
    receiver: "Lucas Rojas",
    company: "Andes Supply",
    country: "Chile",
    exchangeRate: "916.2800",
    payoutMethod: "Bank Transfer",
    payoutKeyLabel: "RUT",
    payoutKey: "18.245.***-7",
    network: "Solana",
    address: snitchpayTreasuryWallet,
    status: "Incomplete",
  },
  {
    id: "PO_5E72A9C0D334",
    time: "9:48 PM",
    dateTime: "May 6, 2026, 9:48 PM",
    senderToken: "Tether",
    senderAmount: "540.00",
    receiverCurrency: "AED",
    receiverAmount: "1,983.15",
    receiver: "Aisha Khan",
    company: "Dune Logistics",
    country: "UAE",
    exchangeRate: "3.6725",
    payoutMethod: "Bank Transfer",
    payoutKeyLabel: "IBAN",
    payoutKey: "AE07 **** **** 2194",
    network: "Solana",
    address: snitchpayTreasuryWallet,
    status: "Succeeded",
  },
  {
    id: "PO_4A86BE011F92",
    time: "9:46 PM",
    dateTime: "May 5, 2026, 9:46 PM",
    senderToken: "Palm USD",
    senderAmount: "300.00",
    receiverCurrency: "EUR",
    receiverAmount: "256.56",
    receiver: "Emma Dubois",
    company: "Seine Atelier",
    country: "France",
    exchangeRate: "0.8552",
    payoutMethod: "SEPA Credit",
    payoutKeyLabel: "IBAN",
    payoutKey: "FR76 **** **** 4388",
    network: "Solana",
    address: snitchpayTreasuryWallet,
    status: "Incomplete",
  },
  {
    id: "PO_6F3AD5B98210",
    time: "9:46 PM",
    dateTime: "May 5, 2026, 9:46 PM",
    senderToken: "Tether",
    senderAmount: "42.00",
    receiverCurrency: "JPY",
    receiverAmount: "6,625",
    receiver: "Noah Sato",
    company: "Kanda Parts",
    country: "Japan",
    exchangeRate: "157.7400",
    payoutMethod: "Zengin Transfer",
    payoutKeyLabel: "Account",
    payoutKey: "0005 **** 3720",
    network: "Solana",
    address: snitchpayTreasuryWallet,
    status: "Succeeded",
  },
  {
    id: "PO_B8D24E37CA55",
    time: "9:46 PM",
    dateTime: "May 5, 2026, 9:46 PM",
    senderToken: "USDC",
    senderAmount: "1,050.00",
    receiverCurrency: "BRL",
    receiverAmount: "5,153.09",
    receiver: "Rafael Costa",
    company: "Verde Foods",
    country: "Brazil",
    exchangeRate: "4.9077",
    payoutMethod: "PIX Instant",
    payoutKeyLabel: "PIX Key",
    payoutKey: "702.654.***-16",
    network: "Solana",
    address: snitchpayTreasuryWallet,
    status: "Failed",
  },
  {
    id: "PO_E51C892DF604",
    time: "9:42 PM",
    dateTime: "May 4, 2026, 9:42 PM",
    senderToken: "Tether",
    senderAmount: "125.30",
    receiverCurrency: "MXN",
    receiverAmount: "2,183.23",
    receiver: "Valentina Ruiz",
    company: "Baja Components",
    country: "Mexico",
    exchangeRate: "17.4240",
    payoutMethod: "SPEI",
    payoutKeyLabel: "CLABE",
    payoutKey: "646180****0902",
    network: "Solana",
    address: snitchpayTreasuryWallet,
    status: "Succeeded",
  },
];

const transactions: Transaction[] = [
  {
    id: "TX_137BEFAA",
    amountUsd: "1.00",
    stablecoin: "USDC",
    dateTime: "May 10, 2026, 1:32 AM",
    description: "INV-349924 · Concert from Blair Woldorf",
    customerName: "Blair Woldorf",
    invoiceId: "INV-349924",
    invoiceTitle: "Concert",
    memo: "Event Fees",
    dueDate: "2026-05-30",
    status: "Succeeded",
    confidential: true,
  },
  {
    id: "TX_1038F9A2",
    amountUsd: "1,240.00",
    stablecoin: "USDC",
    dateTime: "May 10, 2026, 11:17 PM",
    description: "Invoice INV-2048 from Luma Comercio",
    status: "Succeeded",
  },
  {
    id: "TX_7B51DA90",
    amountUsd: "72.40",
    stablecoin: "Tether",
    dateTime: "May 9, 2026, 10:21 PM",
    description: "Checkout payment for Rio Plata Imports",
    status: "Succeeded",
  },
  {
    id: "TX_91C2F04E",
    amountUsd: "980.00",
    stablecoin: "USDC",
    dateTime: "May 8, 2026, 10:09 PM",
    description: "Subscription payment for Maple North Goods",
    status: "Failed",
  },
  {
    id: "TX_A8D2217C",
    amountUsd: "415.75",
    stablecoin: "USDC",
    dateTime: "May 8, 2026, 10:09 PM",
    description: "API checkout session for Norte Retail",
    status: "Incomplete",
  },
  {
    id: "TX_29FE8C61",
    amountUsd: "760.00",
    stablecoin: "Palm USD",
    dateTime: "May 7, 2026, 9:52 PM",
    description: "Hosted checkout payment from Albion Studio",
    status: "Incomplete",
  },
  {
    id: "TX_D40B33A5",
    amountUsd: "250.00",
    stablecoin: "USDC",
    dateTime: "May 7, 2026, 9:52 PM",
    description: "Invoice INV-2051 from Porto Medical",
    status: "Succeeded",
  },
  {
    id: "TX_C6A94310",
    amountUsd: "188.50",
    stablecoin: "Tether",
    dateTime: "May 6, 2026, 9:48 PM",
    description: "Payment link checkout for Andes Supply",
    status: "Incomplete",
  },
  {
    id: "TX_5E1F902B",
    amountUsd: "540.00",
    stablecoin: "Tether",
    dateTime: "May 6, 2026, 9:48 PM",
    description: "Checkout payment from Dune Logistics",
    status: "Succeeded",
  },
  {
    id: "TX_6B7E1120",
    amountUsd: "300.00",
    stablecoin: "USDG",
    dateTime: "May 5, 2026, 9:46 PM",
    description: "Invoice INV-2052 from Seine Atelier",
    status: "Incomplete",
  },
  {
    id: "TX_F17A0B2D",
    amountUsd: "42.00",
    stablecoin: "USDG",
    dateTime: "May 5, 2026, 9:46 PM",
    description: "Low-value checkout test from Kanda Parts",
    status: "Succeeded",
  },
  {
    id: "TX_84D20C7A",
    amountUsd: "2,480.00",
    stablecoin: "USDC",
    dateTime: "May 5, 2026, 8:15 PM",
    description: "Enterprise checkout from Aurora Components",
    status: "Succeeded",
  },
  {
    id: "TX_3E49B6F0",
    amountUsd: "129.99",
    stablecoin: "Tether",
    dateTime: "May 4, 2026, 7:52 PM",
    description: "Payment link checkout for Pacific Textiles",
    status: "Incomplete",
  },
  {
    id: "TX_A61D2E95",
    amountUsd: "875.25",
    stablecoin: "USDC",
    dateTime: "May 3, 2026, 6:44 PM",
    description: "Invoice INV-2053 from Verde Freight",
    status: "Succeeded",
  },
  {
    id: "TX_D0F8C132",
    amountUsd: "64.80",
    stablecoin: "Palm USD",
    dateTime: "May 3, 2026, 5:26 PM",
    description: "Hosted checkout payment from Osaka Parts",
    status: "Refunded",
  },
  {
    id: "TX_7A5C90BD",
    amountUsd: "1,125.00",
    stablecoin: "USDC",
    dateTime: "May 2, 2026, 4:58 PM",
    description: "Checkout payment from Meridian Health",
    status: "Succeeded",
  },
  {
    id: "TX_C92F40AB",
    amountUsd: "349.40",
    stablecoin: "Tether",
    dateTime: "May 2, 2026, 3:39 PM",
    description: "API checkout session for Terra Foods",
    status: "Incomplete",
  },
  {
    id: "TX_B5E701AF",
    amountUsd: "2,050.00",
    stablecoin: "USDC",
    dateTime: "May 2, 2026, 2:11 PM",
    description: "Invoice INV-2054 from Atlas Robotics",
    status: "Succeeded",
  },
  {
    id: "TX_4F8D6E13",
    amountUsd: "510.10",
    stablecoin: "Palm USD",
    dateTime: "May 1, 2026, 1:25 PM",
    description: "Checkout payment for Northstar Design",
    status: "Incomplete",
  },
  {
    id: "TX_E2A93C54",
    amountUsd: "98.00",
    stablecoin: "Tether",
    dateTime: "May 1, 2026, 12:42 PM",
    description: "Payment link checkout from Blue Harbor",
    status: "Succeeded",
  },
  {
    id: "TX_19C0B78E",
    amountUsd: "690.75",
    stablecoin: "USDC",
    dateTime: "May 1, 2026, 11:08 AM",
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
}: {
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <button
      type="button"
      aria-label={label}
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

function TokenMark({ token }: { token: Payment["senderToken"] }) {
  if (token === "Tether") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="size-5 shrink-0"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="11" fill="#50AF95" />
        <path
          d="M6.4 6.5h11.2v2.2h-4.4v2.1c2.5.1 4.4.5 4.4 1.1s-1.9 1-4.4 1.1v5h-2.4v-5c-2.5-.1-4.4-.5-4.4-1.1s1.9-1 4.4-1.1V8.7H6.4V6.5Zm5.6 5.4c1.9 0 3.4-.2 3.4-.4s-1.5-.4-3.4-.4-3.4.2-3.4.4 1.5.4 3.4.4Z"
          fill="white"
        />
      </svg>
    );
  }

  if (token === "USDG") {
    return (
      <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#243a0a" />
        <path
          d="M12 3.1a8.9 8.9 0 1 0 8.8 10.2H12.6v-1.8h8.2A8.9 8.9 0 0 0 12 3.1Zm3 6.9c-1.4-3.7-6.5-1.8-8.3 3-1.6 4.1.8 6.1 3.7 4.1 1.3-.9 2.7-2.2 4-3.6l-2.6-1V10H15Z"
          fill="#cff266"
          fillRule="evenodd"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (token === "Palm USD") {
    return (
      <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#166534" />
        <path
          d="M12.1 8.1c-.4-2.2-1.5-3.7-3.3-4.6 1.9.2 3.2 1.2 4 3 .4-1.7 1.5-2.9 3.5-3.5-1.5 1.2-2.3 2.7-2.5 4.7 1.5-1.8 3.4-2.6 5.8-2.4-2.2.7-3.8 1.9-4.8 3.6 1.9-.9 3.7-.8 5.5.2-2.2 0-4 .6-5.4 1.8.7-.1 1.6.1 2.5.7-1.7-.1-3.1.1-4.1.8l-.5 6.2h1.2c.4 0 .7.3.7.7v.4H9.5v-.4c0-.4.3-.7.7-.7h1.1l.4-6.2c-1-.8-2.5-1.1-4.4-1 1-.7 1.9-.9 2.7-.8-1.5-1.1-3.4-1.7-5.7-1.7 1.9-1 3.8-1 5.7-.1-1.1-1.6-2.8-2.8-5-3.5 2.4-.2 4.4.7 5.9 2.7-.2-2-1-3.5-2.5-4.7 1.9.6 3.1 1.9 3.7 4Z"
          fill="white"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="11" fill="#2775CA" />
      <path
        d="M8.3 6.9a6.8 6.8 0 0 0 0 10.2M15.7 6.9a6.8 6.8 0 0 1 0 10.2"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="1.45"
      />
      <path
        d="M12 6.2v11.6M14.4 9.4c-.3-.8-1.1-1.3-2.3-1.3-1.3 0-2.2.6-2.2 1.6 0 2.4 4.6 1 4.6 3.7 0 1.1-1 1.8-2.5 1.8-1.3 0-2.2-.5-2.6-1.5"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function StablecoinMark({ coin }: { coin: StableCoin }) {
  return <TokenMark token={coin} />;
}

function NetworkBadge({ network }: { network: NetworkName }) {
  return (
    <span className="truncate text-[0.82rem] font-normal text-foreground">
      {network}
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
    "Amount USD",
    "Stablecoin",
    "Date and Time",
    "Description",
    "Customer Name",
    "Status",
    "Invoice",
    "Invoice Link",
    "Confidential",
  ];
  const csvRows = rows.map((transaction) =>
    [
      transaction.id,
      transaction.amountUsd,
      transaction.stablecoin,
      transaction.dateTime,
      transaction.description,
      customerNameFromTransaction(transaction),
      transaction.status,
      invoiceIdFromTransaction(transaction),
      invoicePathFromTransaction(transaction, "Snitchpay.co"),
      transaction.confidential ? "Yes" : "No",
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

function parseAmount(value: string) {
  return Number(value.replace(/,/g, ""));
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function dateKey(dateTime: string) {
  const date = new Date(dateTime);

  return `May ${date.getDate()}`;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function shortWalletAddress(value: string) {
  const trimmed = value.trim();

  if (trimmed.length <= 12) {
    return trimmed;
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function normalizePayoutSourceWallet(payment: Payment) {
  return {
    ...payment,
    address: snitchpayTreasuryWallet,
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
  const invoiceId = invoiceIdFromTransaction(transaction);
  const params = new URLSearchParams({
    customerName: customerNameFromTransaction(transaction),
    title: invoiceTitleFromTransaction(transaction),
    memo: transaction.memo || transaction.description,
    amount: transaction.amountUsd,
    stablecoin: transaction.stablecoin,
    dueDate: transaction.dueDate || "May 30, 2026",
    createdAt: transaction.dateTime,
    status: transaction.status,
    confidential: transaction.confidential ? "true" : "false",
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

function CreatePaymentModal({
  accountName,
  onClose,
  onCreatePayment,
}: {
  accountName: string;
  onClose: () => void;
  onCreatePayment: (payment: CreatedPaymentInput) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-payment-title"
    >
      <form
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-[720px] flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
        onSubmit={async (event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const customerName = String(formData.get("customerName") ?? "").trim();
          const invoiceTitle = String(formData.get("invoiceTitle") ?? "").trim();
          const invoiceAmount = String(formData.get("invoiceAmount") ?? "").trim();
          const stablecoin = String(formData.get("stablecoin") ?? "USDC") as StableCoin;
          const dueDate = String(formData.get("dueDate") ?? "").trim();
          const memo = String(formData.get("memo") ?? "").trim();
          const network = String(formData.get("network") ?? "Solana");
          const paymentTerms = String(formData.get("paymentTerms") ?? "Due on receipt");
          const treasuryAccount = String(formData.get("treasuryAccount") ?? accountName);
          const encryptFinancialData = formData.has("encryptFinancialData");
          const confidential = formData.has("confidentialPayments");

          setIsSubmitting(true);
          setSubmitError("");

          try {
            const response = await fetch("/api/confidential-invoices", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                customerName: customerName || "Unnamed customer",
                invoiceTitle: invoiceTitle || "Untitled invoice",
                dueDate,
                memo,
                currency: stablecoin,
                network,
                invoiceAmount,
                paymentTerms,
                treasuryAccount,
                encryptFinancialData,
                enableConfidentialPayments: confidential,
              }),
            });

            if (!response.ok) {
              throw new Error("Unable to create confidential invoice");
            }

            const invoice = (await response.json()) as {
              invoiceId: string;
              uiState: {
                financialVisibility: "plain" | "protected";
                paymentVisibility: "standard" | "confidential";
              };
            };

            onCreatePayment({
              invoiceId: invoice.invoiceId,
              customerName: customerName || "Unnamed customer",
              invoiceTitle: invoiceTitle || "Untitled invoice",
              memo,
              dueDate,
              amountUsd: invoiceAmount,
              stablecoin,
              paymentTerms,
              treasuryAccount,
              confidential,
              encryptFinancialData,
              financialVisibility: invoice.uiState.financialVisibility,
              paymentVisibility: invoice.uiState.paymentVisibility,
            });
            onClose();
          } catch {
            setSubmitError("Could not create this payment. Please try again.");
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <header className="flex shrink-0 items-start justify-between gap-5 border-b border-border px-6 py-5">
          <div className="flex min-w-0 items-start gap-4">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-background">
              <ReceiptText className="size-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="create-payment-title"
                className="text-xl font-medium tracking-[-0.03em]"
              >
                Create Payment
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a stablecoin invoice for {accountName}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close create payment dialog"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
          <div className="grid gap-6">
            <label className="grid gap-2 text-sm font-medium">
              Customer Name
              <input
                name="customerName"
                type="text"
                autoComplete="organization"
                placeholder="Luma Comercio"
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </label>

            <section className="grid gap-4">
              <h3 className="text-sm font-semibold text-[#1f2a3d]">
                Invoice Details
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Invoice Title
                  <input
                    name="invoiceTitle"
                    type="text"
                    placeholder="May platform invoice"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Due Date
                  <input
                    name="dueDate"
                    type="date"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Currency (Stablecoin)
                  <select
                    name="stablecoin"
                    defaultValue="USDC"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option>USDC</option>
                    <option>Tether</option>
                    <option>USDG</option>
                    <option>Palm USD</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Network (Solana)
                  <select
                    name="network"
                    defaultValue="Solana"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option>Solana</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium">
                Description / Memo
                <textarea
                  name="memo"
                  rows={3}
                  placeholder="Add a memo that appears on the invoice."
                  className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </label>
            </section>

            <section className="grid gap-4">
              <h3 className="text-sm font-semibold text-[#1f2a3d]">
                Financial Details
              </h3>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2 text-sm font-medium">
                  Invoice Amount
                  <input
                    name="invoiceAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="0.00"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Payment Terms
                  <select
                    name="paymentTerms"
                    defaultValue="Due on receipt"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option>Due on receipt</option>
                    <option>Net 7</option>
                    <option>Net 15</option>
                    <option>Net 30</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Treasury Account
                  <select
                    name="treasuryAccount"
                    defaultValue={accountName}
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option>{accountName}</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="grid gap-3">
              <h3 className="text-sm font-semibold text-[#1f2a3d]">
                Privacy Configuration
              </h3>

              <label className="flex gap-3">
                <Checkbox
                  name="encryptFinancialData"
                  defaultChecked
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    Encrypt Financial Data
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                    Financial data is protected using{" "}
                    <a
                      href="https://umbraprivacy.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      Umbra
                    </a>
                    {" "}mainnet payment infrastructure. Demo data only.
                  </span>
                </span>
              </label>

              <label className="flex gap-3">
                <Checkbox
                  name="confidentialPayments"
                  defaultChecked
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    Enable Confidential Payments
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                    Confidential on-chain payments powered by{" "}
                    <a
                      href="https://umbraprivacy.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      Umbra
                    </a>
                    .
                  </span>
                </span>
              </label>
            </section>
          </div>
          {submitError ? (
            <p className="mt-5 text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-border bg-background px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg px-5"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-10 rounded-lg px-5"
          >
            {isSubmitting ? "Creating..." : "Create payment"}
          </Button>
        </footer>
      </form>
    </div>
  );
}

function CreatePayoutModal({
  accountName,
  onClose,
  onCreatePayout,
}: {
  accountName: string;
  onClose: () => void;
  onCreatePayout: (payout: CreatedPayoutInput) => string | null;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-payout-title"
    >
      <form
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-[720px] flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const receiverName = String(formData.get("receiverName") ?? "").trim();
          const receiverWallet = String(formData.get("receiverWallet") ?? "").trim();
          const payoutAmount = String(formData.get("payoutAmount") ?? "").trim();
          const destinationAsset = String(
            formData.get("destinationAsset") ?? "USDC",
          ) as StableCoin;
          const network = String(formData.get("network") ?? "Solana") as NetworkName;
          const approvalPolicy = String(
            formData.get("approvalPolicy") ?? "2 approvals",
          );
          const treasuryAccount = String(
            formData.get("treasuryAccount") ?? accountName,
          );
          const memo = String(formData.get("memo") ?? "").trim();
          const screenReceiverWallet = formData.has("screenReceiverWallet");
          const confidentialPayout = formData.has("confidentialPayout");
          const numericAmount = Number(payoutAmount.replace(/,/g, ""));

          setSubmitError("");

          if (!receiverWallet) {
            setSubmitError("Add the receiver wallet address before creating payout.");
            return;
          }

          if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
            setSubmitError("Enter a payout amount greater than 0.");
            return;
          }

          setIsSubmitting(true);
          const createdId = onCreatePayout({
            receiverName: receiverName || "Unnamed receiver",
            receiverWallet,
            destinationAsset,
            network,
            payoutAmount,
            approvalPolicy,
            treasuryAccount,
            memo,
            screenReceiverWallet,
            confidentialPayout,
          });

          setIsSubmitting(false);

          if (!createdId) {
            setSubmitError("Could not create this payout. Please try again.");
            return;
          }

          onClose();
        }}
      >
        <header className="flex shrink-0 items-start justify-between gap-5 border-b border-border px-6 py-5">
          <div className="flex min-w-0 items-start gap-4">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-background">
              <PayoutNavIcon
                className="size-5 text-muted-foreground"
              />
            </span>
            <div className="min-w-0">
              <h2
                id="create-payout-title"
                className="text-xl font-medium tracking-[-0.03em]"
              >
                Create Payout
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Send stablecoins from {accountName} to a receiver wallet.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close create payout dialog"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
          <div className="grid gap-6">
            <section className="grid gap-4">
              <h3 className="text-sm font-semibold text-[#1f2a3d]">
                Receiver Details
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Receiver Name
                  <input
                    name="receiverName"
                    type="text"
                    autoComplete="name"
                    placeholder="Sophia Mendes"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Receiver Wallet
                  <input
                    name="receiverWallet"
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="Solana wallet address"
                    className="h-11 rounded-lg border border-border bg-background px-3 font-mono text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </label>
              </div>
            </section>

            <section className="grid gap-4">
              <h3 className="text-sm font-semibold text-[#1f2a3d]">
                Payout Details
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Destination Asset
                  <select
                    name="destinationAsset"
                    defaultValue="USDC"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option>USDC</option>
                    <option>Tether</option>
                    <option>USDG</option>
                    <option>Palm USD</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Network (Solana)
                  <select
                    name="network"
                    defaultValue="Solana"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option>Solana</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Payout Amount
                  <input
                    name="payoutAmount"
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="0.00"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Approval Policy
                  <select
                    name="approvalPolicy"
                    defaultValue="2 approvals"
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option>1 approval</option>
                    <option>2 approvals</option>
                    <option>Finance admin approval</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium">
                Treasury Account
                <select
                  name="treasuryAccount"
                  defaultValue={accountName}
                  className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option>{accountName}</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium">
                Description / Memo
                <textarea
                  name="memo"
                  rows={3}
                  placeholder="Optional note for internal payout review."
                  className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </label>
            </section>

            <section className="grid gap-3">
              <h3 className="text-sm font-semibold text-[#1f2a3d]">
                Compliance Configuration
              </h3>

              <label className="flex gap-3">
                <Checkbox
                  name="screenReceiverWallet"
                  defaultChecked
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    Screen Receiver Wallet
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                    Check the wallet and require the selected approval policy
                    before release.
                  </span>
                </span>
              </label>

              <label className="flex gap-3">
                <Checkbox
                  name="confidentialPayout"
                  defaultChecked
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    Use Confidential Payout
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                    Route the payout through{" "}
                    <a
                      href="https://umbraprivacy.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      Umbra
                    </a>
                    {" "}privacy infrastructure on Solana devnet.
                  </span>
                </span>
              </label>
            </section>
          </div>
          {submitError ? (
            <p className="mt-5 text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-border bg-background px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg px-5"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-10 rounded-lg px-5"
          >
            {isSubmitting ? "Creating..." : "Create payout"}
          </Button>
        </footer>
      </form>
    </div>
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

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
          const emailToSend = customerEmail.trim();

          setIsSubmitting(true);
          setSubmitError("");

          try {
            const response = await fetch("/api/send-receipt", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
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
                Email a payment link for {transaction.id}.
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
            Snitchpay.co will send a short invoice email with a secure link to
            complete this stablecoin payment.
          </p>
          {submitError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-border bg-background px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg px-5"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-10 rounded-lg px-5"
          >
            {isSubmitting ? "Sending..." : "Send"}
          </Button>
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
  const [open, setOpen] = useState(false);

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
        <button
          type="button"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[1rem] bg-[#171717] px-3 text-xs font-medium text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <LogOut className="size-4" strokeWidth={2.1} aria-hidden="true" />
          Logout
        </button>
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
    initialInstances[0];
  const accountLabel =
    selectedAccount.id === "inst_final_snitch"
      ? "Shared stablecoin account"
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
                      ? "Shared stablecoin account"
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
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [activeInstance, setActiveInstance] = useState<CompanyInstance | null>(
    null,
  );
  const [instanceType, setInstanceType] = useState("Production");
  const [instanceName, setInstanceName] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const openCreateInstance = () => {
    setModalMode("create");
    setActiveInstance(null);
    setInstanceType("Production");
    setInstanceName("");
    setOpenMenuId(null);
  };

  const openEditInstance = (instance: CompanyInstance) => {
    setSelectedAccountId(instance.id);
    setModalMode("edit");
    setActiveInstance(instance);
    setInstanceType(
      instance.status === "Development" ? "Development" : "Production",
    );
    setInstanceName(instance.name);
    setOpenMenuId(null);
  };

  const closeInstanceModal = () => {
    setModalMode(null);
    setActiveInstance(null);
  };

  const saveInstance = () => {
    const trimmedName = instanceName.trim();

    if (!trimmedName) {
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
                  instanceType === "Production" ? "success" : "neutral",
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
        statusTone: instanceType === "Production" ? "success" : "neutral",
        activity: "No payout yet",
        createdAt: "Created May 10",
      };

      setInstances([...instances, newInstance]);
      setSelectedAccountId(newInstance.id);
    }

    closeInstanceModal();
  };

  const removeInstance = (instanceId: string) => {
    if (instanceId === "inst_final_snitch") {
      setOpenMenuId(null);
      return;
    }

    const remainingInstances = instances.filter((item) => item.id !== instanceId);

    setInstances(remainingInstances);
    if (selectedAccountId === instanceId) {
      setSelectedAccountId(remainingInstances[0]?.id ?? "inst_final_snitch");
    }
    setOpenMenuId(null);
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
                Welcome, <span className="font-semibold text-foreground">Ayush.</span>{" "}
                Which company account should Snitch move today?
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
                Create separate company accounts for stablecoin checkout,
                compliance, receivers, and payout operations.
              </p>
            </header>

            <section className="mt-7 grid justify-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,280px))]">
              <button
                type="button"
                onClick={openCreateInstance}
                className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-[#d1d5dc] bg-background text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="inline-flex items-center gap-2.5 text-sm font-medium">
                  <Plus className="size-4" strokeWidth={2.2} aria-hidden="true" />
                  Create Account
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
                            label={instance.status}
                            tone={instance.statusTone}
                          />
                        </span>
                      </span>
                    </span>

                    <span className="flex min-h-11 items-center justify-between gap-3 border-t border-border bg-muted/35 px-4 pr-12">
                      <span className="truncate text-xs font-medium text-muted-foreground">
                        {instance.activity}
                      </span>
                      <span className="shrink-0 text-[0.68rem] text-muted-foreground">
                        {instance.createdAt}
                      </span>
                    </span>
                  </button>

                  {instance.id !== "inst_final_snitch" ? (
                  <div className="absolute bottom-1.5 right-3">
                    <button
                      type="button"
                      aria-label={`Open ${instance.name} actions`}
                      aria-expanded={openMenuId === instance.id}
                      onClick={() =>
                        setOpenMenuId((current) =>
                          current === instance.id ? null : instance.id,
                        )
                      }
                      className="inline-flex min-h-8 items-center justify-center px-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                    </button>

                    {openMenuId === instance.id ? (
                      <div className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-32 rounded-lg border border-border bg-background p-1 shadow-md">
                        <button
                          type="button"
                          onClick={() => removeInstance(instance.id)}
                          className="flex min-h-9 w-full items-center rounded-md px-3 text-left text-xs text-destructive transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                  ) : null}
                </article>
              ))}
            </section>
          </div>
        </section>
      </div>

      {modalMode ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="instance-dialog-title"
        >
          <div className="w-full max-w-[520px] overflow-hidden rounded-xl bg-background shadow-2xl">
            <header className="flex items-start justify-between gap-5 border-b border-border px-6 py-5">
              <div className="flex min-w-0 items-start gap-4">
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                  <span className="grid gap-1">
                    <span className="block h-1.5 w-5 rounded-full bg-muted-foreground" />
                    <span className="block h-1.5 w-5 rounded-full bg-muted-foreground" />
                  </span>
                </span>
                <div className="min-w-0">
                  <h2
                    id="instance-dialog-title"
                    className="text-xl font-medium tracking-[-0.03em]"
                  >
                    {modalMode === "create" ? "New account" : "Edit account"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create a separate environment to receive payments and manage
                    payouts.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeInstanceModal}
                aria-label="Close account dialog"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </header>

            <div className="grid gap-5 px-6 py-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Account type*
                  <select
                    value={instanceType}
                    onChange={(event) => setInstanceType(event.target.value)}
                    className="h-12 rounded-lg border border-border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option>Production</option>
                    <option>Development</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Account name*
                  <input
                    value={instanceName}
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
                  Accounts help you keep dev, staging, and production separated.
                  Each account has its own receivers, payouts, compliance state,
                  and settings.
                </p>
              </div>
            </div>

            <footer className="flex justify-end gap-2 px-6 pb-6">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-lg px-5"
                onClick={closeInstanceModal}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 rounded-lg px-5"
                onClick={saveInstance}
                disabled={!instanceName.trim()}
              >
                {modalMode === "create" ? "Create" : "Save"}
              </Button>
            </footer>
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
  onCreatePayout: (payout: CreatedPayoutInput) => string | null;
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
                <IconButton label="Export payouts" icon={Download} />
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
                  <button
                    key={payment.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(payment.id);
                      setDetailsOpen(true);
                    }}
                    className={`grid min-h-[3rem] w-full min-w-0 grid-cols-1 gap-2 rounded-md px-0 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[100px_94px_150px_150px_114px_210px] md:items-center md:gap-x-3 ${
                      selectedPayment?.id === payment.id ? "bg-muted/50" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                      <TokenMark token={payment.senderToken} />
                      <span className="shrink-0 font-mono text-[0.82rem] text-muted-foreground tabular-nums">
                        {payment.senderAmount}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <NetworkBadge network={payment.network} />
                    </div>
                    <div className="min-w-0 truncate font-mono text-[0.82rem] font-medium tabular-nums">
                      {payment.receiverCurrency} {payment.receiverAmount}
                    </div>
                    <div className="min-w-0 truncate text-[0.82rem] font-medium text-muted-foreground">
                      {payment.receiver}
                    </div>
                    <div>
                      <StatusBadge
                        label={payment.status}
                        tone={statusTone[payment.status]}
                      />
                    </div>
                    <div className="min-w-0 truncate text-[0.82rem] font-medium text-muted-foreground">
                      {payment.dateTime}
                    </div>
                  </button>
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
            accountName={activeAccountName}
            onClose={() => setIsCreatePayoutOpen(false)}
            onCreatePayout={(payout) => {
              const createdId = onCreatePayout(payout);

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

function WalletsView({
  activeNav,
  setActiveNav,
  instances,
  selectedAccountId,
  setSelectedAccountId,
  accountPayments,
  accountTransactions,
}: {
  activeNav: NavItem;
  setActiveNav: (item: NavItem) => void;
  instances: CompanyInstance[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  accountPayments: Payment[];
  accountTransactions: Transaction[];
}) {
  const dayLabels = Array.from({ length: 10 }, (_, index) => `May ${index + 1}`);
  const receivedByDay = dayLabels.map((label) =>
    accountTransactions
      .filter((transaction) => dateKey(transaction.dateTime) === label)
      .reduce((sum, transaction) => sum + parseAmount(transaction.amountUsd), 0),
  );
  const payoutByDay = dayLabels.map((label) =>
    accountPayments
      .filter((payment) => dateKey(payment.dateTime) === label)
      .reduce((sum, payment) => sum + parseAmount(payment.senderAmount), 0),
  );
  const totalReceived = accountTransactions.reduce(
    (sum, transaction) => sum + parseAmount(transaction.amountUsd),
    0,
  );
  const totalPayouts = accountPayments.reduce(
    (sum, payment) => sum + parseAmount(payment.senderAmount),
    0,
  );
  const pendingPayouts = accountPayments.filter(
    (payment) => payment.status === "Incomplete",
  ).length;
  const balance = totalReceived - totalPayouts;
  const maxVolume = Math.max(...receivedByDay, ...payoutByDay, 1);
  const availableShare = Math.max(
    0,
    Math.min(100, Math.round((balance / Math.max(totalReceived, 1)) * 100)),
  );
  const netMovementByDay = dayLabels.map((_, index) =>
    Math.max(0, receivedByDay[index] - payoutByDay[index]),
  );
  const maxNetMovement = Math.max(...netMovementByDay, 1);
  const timelinePath = netMovementByDay
    .map((value, index) => {
      const x = (index / Math.max(netMovementByDay.length - 1, 1)) * 900;
      const y = 124 - (value / maxNetMovement) * 96;

      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const timelineAreaPath = `${timelinePath} L 900 124 L 0 124 Z`;
  const stablecoinMix = (["USDC", "Tether", "USDG", "Palm USD"] as StableCoin[]).map(
    (coin) => ({
      coin,
      count: accountTransactions.filter((transaction) => transaction.stablecoin === coin)
        .length,
    }),
  );
  const recentActivity = [
    ...accountTransactions.slice(0, 4).map((transaction) => ({
      id: transaction.id,
      label: transaction.description,
      amount: `${formatUsd(parseAmount(transaction.amountUsd))} ${transaction.stablecoin}`,
      meta: "Received payment",
      date: transaction.dateTime,
    })),
    ...accountPayments.slice(0, 3).map((payment) => ({
      id: payment.id,
      label: payment.receiver,
      amount: `${payment.senderAmount} ${payment.senderToken}`,
      meta: "Payout",
      date: payment.dateTime,
    })),
  ].sort(
    (first, second) =>
      new Date(second.date).getTime() - new Date(first.date).getTime(),
  );

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

        <section className="flex h-screen min-w-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 xl:px-6">
            <div className="mx-auto max-w-[1240px]">
              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
                <div className="min-w-0">
                  <h1 className="text-[1.8rem] font-semibold leading-none tracking-[-0.04em] text-[#1f2a3d]">
                    Wallets
                  </h1>
                  <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
                    Monitor the shared Solana stablecoin account, available balances, and
                    payout runway for Snitchpay.co.
                  </p>
                </div>
                <div
                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-muted p-1"
                  aria-label="Wallet analytics range"
                >
                  {["24h", "7d", "30d", "90d"].map((range) => (
                    <button
                      key={range}
                      type="button"
                      className={`h-7 rounded-full px-4 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        range === "30d"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </header>

              <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-background">
                <div className="grid lg:grid-cols-[minmax(0,1fr)_330px]">
                  <div className="min-w-0 p-4 lg:border-r lg:border-border">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          Available balance
                        </p>
                        <p className="mt-4 text-[1.95rem] font-semibold leading-none tracking-[-0.04em] text-[#20242c]">
                          {formatUsd(balance)}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Across USDC, Tether, USDG, and Palm USD.
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                        Solana
                      </span>
                    </div>

                    <div className="mt-5">
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-[var(--brand-purple)]"
                          style={{ width: `${availableShare}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>{formatUsd(totalReceived)} received</span>
                        <span>{availableShare}% available</span>
                      </div>
                    </div>

                    <div className="mt-5 flex h-[88px] items-end justify-between gap-3">
                      {dayLabels.map((label, index) => {
                        const height = Math.max(
                          8,
                          (receivedByDay[index] / maxVolume) * 80,
                        );

                        return (
                          <div
                            key={label}
                            className="flex h-full min-w-0 flex-1 items-end justify-center"
                            title={`${label} received ${formatUsd(receivedByDay[index])}`}
                          >
                            <div className="flex h-20 w-full max-w-9 items-end overflow-hidden rounded-full bg-muted">
                              <span
                                className="block w-full rounded-full bg-[var(--brand-purple)]"
                                style={{ height: `${height}px` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <aside className="grid gap-3 p-4">
                    <div className="rounded-2xl bg-muted p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Received
                      </p>
                      <p className="mt-3 text-[1.55rem] font-semibold leading-none tracking-[-0.04em] text-[#20242c]">
                        {formatUsd(totalReceived)}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {accountTransactions.length} payments from checkout.
                      </p>
                    </div>

                    <div className="rounded-2xl bg-muted p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Payouts created
                      </p>
                      <p className="mt-3 text-[1.55rem] font-semibold leading-none tracking-[-0.04em] text-[#20242c]">
                        {accountPayments.length}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {pendingPayouts} waiting for completion.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Stablecoin mix
                      </p>
                      <div className="mt-3 grid gap-2">
                        {stablecoinMix.map(({ coin, count }) => (
                          <div key={coin} className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2 text-sm">
                              <StablecoinMark coin={coin} />
                              <span className="truncate">{coin}</span>
                            </span>
                            <span className="text-sm text-muted-foreground">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </aside>
                </div>

                <div className="border-t border-border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[#1f2a3d]">
                        Settlement timeline
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Net stablecoin movement across the selected range.
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      30d
                    </span>
                  </div>

                  <div className="relative mt-5 h-24">
                    <svg
                      className="h-full w-full overflow-visible"
                      viewBox="0 0 900 140"
                      role="img"
                      aria-label="Net stablecoin settlement movement over time"
                      preserveAspectRatio="none"
                    >
                      <path
                        d={timelineAreaPath}
                        fill="var(--brand-orange)"
                        opacity="0.08"
                      />
                      <path
                        d={timelinePath}
                        fill="none"
                        stroke="var(--brand-orange)"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="4"
                      />
                      <line
                        x1="0"
                        x2="900"
                        y1="124"
                        y2="124"
                        stroke="var(--brand-orange)"
                        strokeLinecap="round"
                        strokeWidth="4"
                      />
                      <circle
                        cx="900"
                        cy="124"
                        r="8"
                        fill="white"
                        stroke="var(--brand-orange)"
                        strokeWidth="4"
                      />
                    </svg>
                  </div>
                </div>
              </section>

              <section className="py-5">
                <div className="flex min-h-11 items-center justify-between border-b border-border">
                  <p className="text-sm font-semibold text-[#1f2a3d]">Recent activity</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 rounded-lg px-3 text-xs"
                    onClick={() => setActiveNav("Transactions")}
                  >
                    Open table
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {recentActivity.slice(0, 8).map((item) => (
                    <div
                      key={item.id}
                      className="grid min-h-14 grid-cols-[minmax(0,1fr)_170px_180px] items-center gap-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.meta}</p>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{item.date}</p>
                      <p className="truncate text-right font-mono text-sm">{item.amount}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
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
  onMarkPaymentSucceeded: (invoiceId: string) => void;
}) {
  const [activeTransactionFilter, setActiveTransactionFilter] =
    useState<TransactionFilter>("All");
  const [activeTransactionTab, setActiveTransactionTab] =
    useState<TransactionActivityTab>("Payments");
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
  const confidentialCount = displayTransactions.filter(
    (transaction) => transaction.confidential,
  ).length;
  const tabs: TransactionActivityTab[] = [
    "Payments",
    "Confidential Payments",
    "All activity",
  ];
  const transactionFilters: Array<{
    label: TransactionFilter;
    count: number;
  }> = [
    { label: "All", count: displayTransactions.length },
    { label: "Succeeded", count: succeededCount },
    { label: "Refunded", count: refundedCount },
    { label: "Disputed", count: disputedCount },
    { label: "Confidential", count: confidentialCount },
  ];
  const tabTransactions =
    activeTransactionTab === "Confidential Payments"
      ? displayTransactions.filter((transaction) => transaction.confidential)
      : activeTransactionTab === "Payments"
        ? displayTransactions.filter((transaction) => !transaction.confidential)
        : displayTransactions;
  const visibleTransactions =
    activeTransactionFilter === "Confidential"
      ? displayTransactions.filter((transaction) => transaction.confidential)
      : activeTransactionFilter === "All"
        ? tabTransactions
        : tabTransactions.filter(
            (transaction) => transaction.status === activeTransactionFilter,
          );
  useEffect(() => {
    const invoiceIds = accountTransactions
      .filter((transaction) => transaction.status !== "Succeeded")
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
            payments?: Array<{
              invoiceId?: string;
              status?: TransactionStatus;
            }>;
          }
        | null;

      result?.payments?.forEach((payment) => {
        if (payment.invoiceId && payment.status === "Succeeded") {
          onMarkPaymentSucceeded(payment.invoiceId);
        }
      });
    }

    void syncConfirmedPayments();
    const intervalId = window.setInterval(syncConfirmedPayments, 6000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [accountTransactions, onMarkPaymentSucceeded]);
  const copyInvoiceLink = async (transaction: Transaction) => {
    const invoicePath = invoicePathFromTransaction(transaction, activeAccountName);
    const invoiceUrl =
      typeof window === "undefined"
        ? invoicePath
        : `${window.location.origin}${invoicePath}`;

    try {
      await navigator.clipboard.writeText(invoiceUrl);
      setReceiptStatus({
        tone: "success",
        message: `${invoiceIdFromTransaction(transaction)} link copied.`,
      });
    } catch {
      setReceiptStatus({
        tone: "error",
        message: "Could not copy this invoice link.",
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

                <nav
                  aria-label="Transaction activity"
                  className="flex min-w-0 items-center gap-6"
                >
                  {tabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        setActiveTransactionTab(tab);
                        setActiveTransactionFilter("All");
                      }}
                      className={`relative min-h-10 whitespace-nowrap text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        tab === activeTransactionTab
                          ? "text-primary"
                          : "text-[#1f2a3d] hover:text-foreground"
                      }`}
                    >
                      {tab}
                      {tab === activeTransactionTab ? (
                        <span
                          className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-primary"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  ))}
                </nav>
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
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-[#1f2a3d]">
                        ${transaction.amountUsd}
                      </span>
                      <span className="shrink-0 text-sm text-[#1f2a3d]">
                        USD
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                      <StablecoinMark coin={transaction.stablecoin} />
                      <span className="truncate text-[0.82rem] text-[#4a5260]">
                        {transaction.stablecoin}
                      </span>
                    </div>
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
                        <p className="truncate text-[0.82rem] text-[#4a5260]">
                          {transaction.dateTime}
                        </p>
                    </div>
                    <div className="min-w-0">
                      <div className="inline-flex max-w-full items-center gap-1.5">
                        <a
                          href={invoicePathFromTransaction(
                            transaction,
                            activeAccountName,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 truncate text-[0.82rem] font-medium text-[#1f2a3d] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {invoiceIdFromTransaction(transaction)}
                        </a>
                        <button
                          type="button"
                          aria-label={`Copy link for ${invoiceIdFromTransaction(
                            transaction,
                          )}`}
                          title="Copy invoice link"
                          onClick={() => void copyInvoiceLink(transaction)}
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <Copy className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <div className="inline-flex rounded-lg border border-border bg-background shadow-sm">
                        <TransactionActionButton
                          label="Refund payment"
                          icon={RotateCcw}
                          className="rounded-l-lg rounded-r-none border-r border-border"
                        />
                        <TransactionActionButton
                          label="Send invoice"
                          icon={ReceiptText}
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
          accountName={activeAccountName}
          onCreatePayment={(payment) => {
            onCreatePayment(payment);
            if (payment.confidential) {
              setActiveTransactionTab("Confidential Payments");
              setActiveTransactionFilter("All");
            }
          }}
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

function PaymentDetails({
  payment,
  onClose,
}: {
  payment: Payment;
  onClose: () => void;
}) {
  const senderAmount = Number(payment.senderAmount.replace(/,/g, ""));
  const fee = senderAmount * 0.008;
  const receiverGets = senderAmount - fee;
  const receiverWallet =
    payment.payoutKeyLabel === "Receiver Wallet"
      ? shortWalletAddress(payment.payoutKey)
      : `SoL${payment.id.slice(3, 9)}...${payment.id.slice(-4)}`;

  const tracking = [
    {
      title: "Lock payout from shared stablecoin account",
      meta: "Solana Tx: 5Ky8...pQ2m",
      time: "8 hours ago",
      description: null,
    },
    {
      title: "Run receiver wallet and approval checks",
      meta: "Wallet screened     Policy: 2 approvals     ID: #A875SF97",
      time: "7 hours ago",
      description: null,
    },
    {
      title: "Send stablecoin to receiver wallet",
      meta: null,
      time: "6 hours ago",
      description:
        "The stablecoin transfer has been signed from the shared account and is confirming final delivery on Solana.",
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
          <IconButton label="Print payout" icon={Printer} />
          <IconButton label="Copy payout" icon={ReceiptText} />
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
              Payout Details
            </p>
          </div>

          <div className="mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Date &amp; Time
                </p>
                <p className="mt-1 text-xs font-normal">
                  {payment.dateTime}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Network
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs font-normal">
                  <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                  {payment.network}
                </p>
              </div>
            </div>

            <div className="my-4 h-px bg-border" />

            <section>
              <p className="text-xs font-medium text-muted-foreground">
                Source Wallet
              </p>
              <div className="mt-2 flex min-h-9 items-center justify-between gap-3 rounded-md bg-muted px-3">
                <span className="truncate font-mono text-xs font-normal">
                  {shortWalletAddress(payment.address)}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-normal transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  View Explorer
                </button>
              </div>
            </section>

            <div className="my-4 h-px bg-border" />

            <section>
              <p className="text-xs font-medium text-muted-foreground">
                Receiver Information
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <p className="text-[0.68rem] font-normal text-muted-foreground">
                    Legal Name
                  </p>
                  <p className="mt-1 text-xs font-normal">{payment.receiver}</p>
                </div>
                <div>
                  <p className="text-[0.68rem] font-normal text-muted-foreground">
                    Receiver Wallet
                  </p>
                  <p className="mt-1 truncate font-mono text-xs font-normal">
                    {receiverWallet}
                  </p>
                </div>
                <div>
                  <p className="text-[0.68rem] font-normal text-muted-foreground">
                    Destination Asset
                  </p>
                  <p className="mt-1 text-xs font-normal">{payment.senderToken}</p>
                </div>
                <div>
                  <p className="text-[0.68rem] font-normal text-muted-foreground">
                    Account Type
                  </p>
                  <p className="mt-1 text-xs font-normal">Solana wallet</p>
                </div>
              </div>
            </section>

            <div className="my-4 border-t border-dashed border-border" />

            <section className="grid gap-3">
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-4">
                <p className="text-xs font-normal text-muted-foreground">
                  Sending Amount
                </p>
                <p className="font-mono text-xs font-normal tabular-nums">
                  {payment.senderAmount} {payment.senderToken}
                </p>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-4">
                <p className="text-xs font-normal text-muted-foreground">
                  Network Fee (0.8%)
                </p>
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  -{fee.toFixed(2)} {payment.senderToken}
                </p>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-4">
                <p className="text-xs font-normal text-muted-foreground">
                  Receiver Gets
                </p>
                <p className="font-mono text-xs font-normal tabular-nums">
                  {receiverGets.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  {payment.senderToken}
                </p>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-4">
                <p className="text-xs font-normal text-muted-foreground">
                  Settlement
                </p>
                <p className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
                  Stablecoin transfer on Solana
                </p>
              </div>
            </section>
          </div>
        </section>

        <section className="mt-10">
          <p className="text-sm font-normal">Payout Tracking</p>
          <div className="mt-5 space-y-7">
            {tracking.map((item, index) => (
              <article key={item.title} className="relative pl-6">
                <span
                  className="absolute left-0 top-1.5 size-2.5 rounded-full bg-[var(--brand-orange)]"
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
                  <p className="mt-2 inline-flex rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
                    {item.meta}
                  </p>
                ) : null}
                {item.description ? (
                  <p className="mt-2 max-w-[320px] text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">{item.time}</p>
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
                      placeholder="Production checkout key"
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

export default function HomePage() {
  const [activeNav, setActiveNav] = useState<NavItem>("Dashboard");
  const [instances, setInstances] =
    useState<CompanyInstance[]>(initialInstances);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>(initialApiKeys);
  const [transactionRows, setTransactionRows] =
    useState<Transaction[]>(transactions);
  const [paymentRowsByAccount, setPaymentRowsByAccount] = useState<
    Record<string, Payment[]>
  >({
    inst_final_snitch: payments,
  });
  const [selectedAccountId, setSelectedAccountId] =
    useState("inst_final_snitch");

  const visibleInstances = useMemo(
    () =>
      instances
        .filter((instance) => !legacyDemoAccountIds.has(instance.id))
        .map((instance) =>
          instance.id === "inst_final_snitch"
            ? { ...instance, name: "Snitchpay.co", initials: "SC" }
            : instance,
        ),
    [instances],
  );
  const activeAccountId = visibleInstances.some(
    (instance) => instance.id === selectedAccountId,
  )
    ? selectedAccountId
    : "inst_final_snitch";
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
    () =>
      (paymentRowsByAccount[activeAccountId] ?? []).map(
        normalizePayoutSourceWallet,
      ),
    [activeAccountId, paymentRowsByAccount],
  );
  const accountTransactions =
    activeAccountId === "inst_final_snitch" ? transactionRows : [];

  const createPayment = (payment: CreatedPaymentInput) => {
    if (activeAccountId !== "inst_final_snitch") {
      return;
    }

    const numericAmount = Number(payment.amountUsd.replace(/,/g, ""));
    const normalizedAmount = Number.isFinite(numericAmount)
      ? numericAmount.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "0.00";
    const createdAt = new Date();
    const transactionId = `TX_${createdAt.getTime().toString(16).toUpperCase()}`;

    setTransactionRows((currentRows) => [
      {
        id: transactionId,
        amountUsd: normalizedAmount,
        stablecoin: payment.stablecoin,
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
        confidential: payment.confidential,
      },
      ...currentRows,
    ]);
  };

  const createPayout = (payout: CreatedPayoutInput) => {
    const activeAccount =
      visibleInstances.find((instance) => instance.id === activeAccountId) ??
      visibleInstances[0];
    const numericAmount = Number(payout.payoutAmount.replace(/,/g, ""));

    if (!activeAccount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return null;
    }

    const createdAt = new Date();
    const payoutId = `PO_${createdAt.getTime().toString(16).toUpperCase()}`;
    const normalizedAmount = numericAmount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const assetLabel =
      payout.destinationAsset === "Tether"
        ? "USDT"
        : payout.destinationAsset === "Palm USD"
          ? "Palm USD"
          : payout.destinationAsset;

    setPaymentRowsByAccount((currentRows) => {
      const rows = currentRows[activeAccount.id] ?? [];

      return {
        ...currentRows,
        [activeAccount.id]: [
          {
            id: payoutId,
            time: createdAt.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            }),
            dateTime: formatDateTime(createdAt),
            senderToken: payout.destinationAsset,
            senderAmount: normalizedAmount,
            receiverCurrency: assetLabel,
            receiverAmount: normalizedAmount,
            receiver: payout.receiverName,
            company: payout.receiverName,
            country: "Solana",
            exchangeRate: "1.0000",
            payoutMethod: payout.confidentialPayout
              ? "Umbra confidential transfer"
              : "Solana transfer",
            payoutKeyLabel: "Receiver Wallet",
            payoutKey: payout.receiverWallet,
            network: payout.network,
            address: snitchpayTreasuryWallet,
            status: "Incomplete",
          },
          ...rows,
        ],
      };
    });

    return payoutId;
  };

  const removeTransaction = (id: string) => {
    if (activeAccountId !== "inst_final_snitch") {
      return;
    }

    setTransactionRows((currentRows) =>
      currentRows.filter((transaction) => transaction.id !== id),
    );
  };

  const markPaymentSucceeded = (invoiceId: string) => {
    if (activeAccountId !== "inst_final_snitch") {
      return;
    }

    setTransactionRows((currentRows) =>
      currentRows.map((transaction) =>
        invoiceIdFromTransaction(transaction) === invoiceId
          ? { ...transaction, status: "Succeeded" }
          : transaction,
      ),
    );
  };

  if (activeNav === "Dashboard") {
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
