import { NextResponse } from "next/server";

const ENCRYPT_NETWORK = {
  chain: "solana",
  environment: "devnet",
  encryptGrpcEndpoint: "https://pre-alpha-dev-1.encrypt.ika-network.net:443",
  solanaRpc: "https://api.devnet.solana.com",
  programId: "4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8",
} as const;

const SUPPORTED_STABLECOINS = new Set(["USDC", "Tether", "USDG", "Palm USD"]);
const TEST_INVOICE_AMOUNT_USDC = "8.86";

type ConfidentialInvoiceBody = {
  customerName?: unknown;
  invoiceTitle?: unknown;
  dueDate?: unknown;
  memo?: unknown;
  currency?: unknown;
  network?: unknown;
  invoiceAmount?: unknown;
  paymentTerms?: unknown;
  treasuryAccount?: unknown;
  encryptFinancialData?: unknown;
  enableConfidentialPayments?: unknown;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function createInvoiceId() {
  return `INV-${Date.now().toString().slice(-6)}`;
}

export async function POST(request: Request) {
  let body: ConfidentialInvoiceBody;

  try {
    body = (await request.json()) as ConfidentialInvoiceBody;
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON request body." },
      { status: 400 },
    );
  }

  const invoiceId = createInvoiceId();
  const invoiceTitle = text(body.invoiceTitle, "Untitled invoice");
  const dueDate = text(body.dueDate, "2026-05-30");
  const currency = text(body.currency, "USDC");
  const network = text(body.network, "Solana");
  const invoiceAmount = text(body.invoiceAmount, TEST_INVOICE_AMOUNT_USDC);
  const paymentTerms = text(body.paymentTerms, "Due on receipt");
  const treasuryAccount = text(body.treasuryAccount, "Snitchpay.co");
  const customerName = text(body.customerName, "Unnamed customer");
  const memo = text(body.memo);
  const encryptFinancialData = Boolean(body.encryptFinancialData);
  const enableConfidentialPayments = Boolean(body.enableConfidentialPayments);

  if (!SUPPORTED_STABLECOINS.has(currency)) {
    return NextResponse.json(
      { error: "Unsupported stablecoin for Solana checkout." },
      { status: 400 },
    );
  }

  if (network !== "Solana") {
    return NextResponse.json(
      { error: "Only Solana is supported for this prototype." },
      { status: 400 },
    );
  }

  const plainFields = {
    invoice_id: invoiceId,
    invoice_title: invoiceTitle,
    due_date: dueDate,
    currency,
    network,
    status: "pending",
    customer_name: customerName,
    memo,
  };

  const encryptedFields = encryptFinancialData
    ? {
        invoice_amount: {
          value: invoiceAmount,
          type: "decimal_string",
          encrypted_with: "Encrypt",
        },
        treasury_account_reference: {
          value: `treasury_${slug(treasuryAccount)}_primary`,
          type: "internal_reference",
          encrypted_with: "Encrypt",
        },
        payment_terms: {
          value: slug(paymentTerms) || "due_on_receipt",
          type: "enum",
          encrypted_with: "Encrypt",
        },
        internal_settlement_metadata: {
          value: {
            settlement_asset: currency,
            settlement_network: network,
            settlement_wallet_ref: "company_treasury_wallet_01",
            privacy_mode: enableConfidentialPayments
              ? "confidential_payment"
              : "standard_payment",
            created_by: "merchant_admin",
          },
          type: "json_object",
          encrypted_with: "Encrypt",
        },
      }
    : null;

  const uiState = {
    encryptFinancialData,
    enableConfidentialPayments,
    financialVisibility: encryptFinancialData ? "protected" : "plain",
    paymentVisibility: enableConfidentialPayments ? "confidential" : "standard",
  } as const;

  return NextResponse.json({
    invoiceId,
    status: "pending",
    network: ENCRYPT_NETWORK,
    client_dependency: {
      package_manager: "bun",
      install_command: "bun add @encrypt.xyz/pre-alpha-solana-client",
    },
    invoice_plain_fields: plainFields,
    invoice_encrypted_fields: encryptedFields,
    ui_state: {
      encrypt_financial_data: uiState.encryptFinancialData,
      enable_confidential_payments: uiState.enableConfidentialPayments,
      financial_visibility: uiState.financialVisibility,
      payment_visibility: uiState.paymentVisibility,
    },
    umbra_payment_layer: enableConfidentialPayments
      ? {
          purpose: "private_onchain_payment",
          trigger: "customer_clicks_pay_confidentially",
          input: {
            invoice_id: invoiceId,
            asset: currency,
            network,
          },
          output: {
            private_transfer_status: "pending_or_confirmed",
            invoice_status: "paid_after_verification",
          },
        }
      : null,
    important_disclaimer: {
      status: "pre-alpha",
      real_encryption: false,
      note: "Encrypt pre-alpha currently stores demo data as plaintext on-chain. Use devnet/test data only.",
    },
    plainFields,
    invoiceEncryptedFields: encryptedFields,
    encryptIntegration: encryptFinancialData
      ? {
          status: "pre-alpha",
          realEncryption: false,
          clientPackage: "@encrypt.xyz/pre-alpha-solana-client",
          installCommand: "bun add @encrypt.xyz/pre-alpha-solana-client",
          network: ENCRYPT_NETWORK,
          note: "Encrypt pre-alpha currently stores demo data as plaintext on-chain. Use devnet/test data only.",
        }
      : null,
    uiState,
    umbraPaymentLayer: enableConfidentialPayments
      ? {
          purpose: "private_onchain_payment",
          trigger: "customer_clicks_pay_confidentially",
          input: {
            invoice_id: invoiceId,
            asset: currency,
            network,
          },
          output: {
            private_transfer_status: "pending_or_confirmed",
            invoice_status: "paid_after_verification",
          },
        }
      : null,
    importantDisclaimer: {
      status: "pre-alpha",
      realEncryption: false,
      note: "Financial data is protected using Umbra mainnet payment infrastructure. Demo data only.",
    },
  });
}
