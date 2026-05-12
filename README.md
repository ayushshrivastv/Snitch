# Snitch

Snitch is a Solana stablecoin payment operations app for businesses that need private checkout, treasury payouts, payment records, and compliance context in one workflow.

The project demonstrates how a merchant can create hosted stablecoin invoices, route sensitive payments through an Umbra-backed confidential payment path, manage payout operations, and keep audit-friendly records without exposing every customer-to-treasury relationship as a plain public transfer.

## What Snitch Does

- Create Solana stablecoin invoices with customer, memo, due date, amount, terms, and treasury metadata.
- Generate hosted checkout pages that customers can open from a payment link.
- Let customers connect a Solana wallet and complete confidential invoice payments.
- Route confidential payment flows through Umbra privacy infrastructure.
- Track payment status, receipts, transaction signatures, and reconciliation context.
- Explain confidential payments through a dedicated Umbra transaction explorer page.
- Create treasury payouts to receiver wallets with memo, approval policy, and compliance checks.
- Support admin-style team access controls for finance, support, analyst, and developer roles.
- Provide a merchant dashboard for payment history, balances, payout operations, and activity review.

## Why It Exists

Public blockchains are transparent by default. That is useful for verification, but it creates a problem for businesses: every payment can reveal customer relationships, treasury wallets, payout patterns, and sensitive financial metadata.

Snitch explores a business-grade payment layer where merchants can still accept and reconcile Solana stablecoin payments while protecting sensitive payment relationships. The product goal is to make crypto payments feel closer to modern financial operations: private where needed, auditable where required, and simple enough for teams to use.

## Confidential Payments With Umbra

Snitch emphasizes confidential on-chain payments using Umbra. In a standard Solana transfer, a block explorer can often show the payer wallet, recipient wallet, amount, and transaction history. In Snitch's confidential checkout flow, the customer signs a payment through Umbra, and the merchant receives a receiver-claimable private payment state instead of a plain customer-to-treasury transfer row.

The app's confidential transaction page explains the flow:

1. The customer signs the payment from their Solana wallet.
2. Umbra creates a private receiver-claimable payment note.
3. A public explorer can see an Umbra program interaction, but not the direct business relationship behind the invoice.
4. Snitch records the proof/signature and marks the invoice as paid for merchant reconciliation.

Reference: [Umbra Privacy on Solana Explained](https://www.datawallet.com/crypto/umbra-privacy-on-solana-explained).

## Demo Scope

This is a demo/prototype application. Some invoice and encryption metadata is represented as demo state, and the app includes explicit test-data disclaimers in the API response layer. Configure real treasury wallets, supported mints, RPC endpoints, recipient registration, and operational controls before using any payment flow beyond a demo environment.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Solana Web3.js
- Solana SPL Token
- Solana wallet adapters for Phantom, Solflare, and wallet-standard wallets
- Umbra SDK and web ZK prover packages
- Resend API route support for receipt/payment-link emails

## Project Structure

```text
src/app/page.tsx
  Main product experience, merchant dashboard, invoice creation, payout creation, and access controls.

src/app/api/confidential-invoices/route.ts
  Creates invoice payloads and privacy/payment metadata for the UI.

src/app/api/payments/confirm/route.ts
  Records confirmed payment signatures and invoice completion state.

src/app/api/payments/status/route.ts
  Returns payment status for dashboard polling.

src/app/api/send-receipt/route.ts
  Builds and sends hosted checkout/payment-link email content.

src/app/transactions/[account]/[shareId]/[invoiceId]/
  Hosted invoice and customer payment experience.

src/app/transactions/[account]/[shareId]/[invoiceId]/explorer/
  Umbra confidential transaction explanation view.

src/lib/payment-confirmations.ts
  In-memory demo payment confirmation store.
```

## Environment Variables

Create `.env.local` from `.env.example` and fill the values needed for your demo:

```bash
cp .env.example .env.local
```

```env
RESEND_API_KEY=
NEXT_PUBLIC_UMBRA_NETWORK=mainnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://solana-rpc.publicnode.com
NEXT_PUBLIC_SOLANA_WS_URL=wss://solana-rpc.publicnode.com
NEXT_PUBLIC_SNITCH_TREASURY_WALLET=
NEXT_PUBLIC_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
NEXT_PUBLIC_USDT_MINT=
NEXT_PUBLIC_USDG_MINT=
NEXT_PUBLIC_PALM_USD_MINT=
```

Do not commit real secrets. Keep production keys and private configuration in your deployment environment.

## Getting Started

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Open the app:

```text
http://localhost:3000
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Demo Narrative

Snitch is built for businesses that want Solana stablecoin payments without exposing every payment relationship publicly. A merchant can create an invoice, enable confidential payments, send a hosted checkout link, and let the customer pay privately through Umbra. After payment, Snitch keeps the merchant-facing records needed for reconciliation, receipts, and audit review while the public chain view avoids a plain customer-wallet-to-merchant-wallet transfer trail.

The broader product vision is private, compliant payment operations for internet-native businesses: stablecoin checkout, treasury controls, confidential payouts, and clear records in one place.
