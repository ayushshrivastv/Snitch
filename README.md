# Snitch

A company workspace for onchain payments, treasury balances, and financial records. Snitch brings invoice requests, customer checkout, and company payouts together around a dedicated Privy wallet.

The current implementation executes **native ETH transfers on Ethereum Sepolia** (`11155111`). The broader stablecoin, payroll, and team workflows on the landing page describe the product direction; stablecoin transfers, mainnet execution, and shared signing are not implemented.

## What works

- Privy email sign-in opens directly from the landing page. A missing profile name is collected once and displayed throughout the workspace.
- Creating a company provisions a separate Privy embedded wallet and saves its verified public address. Signing in alone does not create a wallet.
- Invoices use the selected company's receiving wallet. Hosted checkout accepts a customer wallet transfer, then verifies its network, recipient, amount, and invoice reference before recording payment.
- Company payouts request the selected wallet's signature through Privy. The server verifies the broadcast transfer and persists its status without resending it.
- Wallets show RPC balances, recorded activity, charts, and export settings. Snitch's export flow requires the assigned CFO to verify a single-use signature before opening Privy's protected export interface.
- The public Snitchpay.co showcase retains historical Ethereum Sepolia and Base Sepolia transfers alongside illustrative records. A signed-in user can connect their own separate Snitchpay.co treasury for live Sepolia testing.

## Local setup

Use **Node.js 22.x, version 22.14 or newer**, and npm. The storage layer requires Node's built-in `node:sqlite` module.

```bash
npm ci
cp .env.example .env.local
```

Set the Privy App ID and server secret in `.env.local`, enable email login in the Privy dashboard, and allow your local origin. Then run:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open [127.0.0.1:3000](http://127.0.0.1:3000). The public preview is available at [/?demo=1](http://127.0.0.1:3000/?demo=1) without authentication. Sign in and create a company to use its wallet. Fund that address with Sepolia test ETH before sending payouts; customer checkout also requires a funded Sepolia wallet.

### Environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Public Privy application identifier used by the browser and server. |
| `PRIVY_APP_SECRET` | Server-only Privy credential for token and account verification. |
| `NEXT_PUBLIC_ETHEREUM_RPC_URL` | Browser Sepolia RPC URL; defaults to the public endpoint in `.env.example`. |
| `ETHEREUM_RPC_URL` | Optional server Sepolia RPC override for balances and verification. |
| `SNITCH_DATA_DIR` | Persistent database directory; defaults to `.data` during development. An absolute path is required in production. |
| `SNITCH_API_ORIGIN` | Optional HTTPS origin for a persistent Snitch backend. Set on Vercel to proxy `/api/*` while keeping the Vercel frontend URL. |
| `SNITCH_PUBLIC_ORIGIN` | Public frontend origin used by the backend when it generates hosted checkout links. |
| `RESEND_API_KEY` | Optional email credential. The current sender is Resend's development sender; configure an approved sender before general delivery. |
| `NEXT_PUBLIC_ETHEREUM_TREASURY_ADDRESS` | Legacy invoice-helper fallback. Authenticated invoice creation always uses the stored company wallet. |

Keep `.env.local`, database files, tokens, and private keys out of source control. Variables beginning with `NEXT_PUBLIC_` are browser-visible; never place server credentials there.

## Storage and wallet authority

Companies, wallet bindings, invoices, confirmed payments, payouts, and export challenges persist in `.data/snitch.sqlite`. Profile names are saved in Privy custom metadata. Snitch records public wallet identifiers and payment data; it does not receive private keys or register a server signer.

The company creator controls the embedded wallet through their Privy identity and is assigned CFO in Snitch. CFO verification gates the normal **Snitch export flow**, not Privy's independent owner recovery capabilities. Connect's other editable roles are interface state; they do not grant shared signing authority or create persisted invitations.

Successful showcase rows are verified public-transfer snapshots, not payments made by Snitch customers or the connected user's wallet. Their presentation names and invoice references are illustrative, and they do not determine the connected wallet's balance. See [record provenance](docs/showcase-blockchain.md).

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/app/page.tsx`, `src/app/home-client.tsx` | Public entry, company selection, and workspace screens. |
| `src/components/landing/`, `src/components/ui/` | Landing page sections, styles, and shared UI components. |
| `src/components/auth/` | Privy session, profile setup, company-wallet provisioning, and CFO verification. |
| `src/components/wallets/`, `src/components/payments/` | Treasury views, analytics, export dialog, and payment forms. |
| `src/app/transactions/` | Public hosted invoice checkout. |
| `src/app/api/` | Authenticated company operations and public checkout verification endpoints. |
| `src/lib/` | SQLite stores, ownership checks, invoice rules, and record formatting. |
| `services/ethereum.ts` | Sepolia wallet interaction, exact ETH amounts, and transaction verification. |
| `src/data/`, `scripts/collect-showcase-*.mjs` | Public blockchain snapshots and read-only collection scripts. |
| `tests/` | Authentication, storage, payment, wallet, and recovery tests. |

Built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui components, Privy, and ethers.

## Validation

```bash
npm run check:repo
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Tests use temporary SQLite databases, local test signatures, and stubbed Privy/RPC responses. They do not send login emails, transfer funds, create real wallets, or export private keys. Complete live sign-in and wallet approval checks using your own test account.

For a production-mode local run, set `SNITCH_DATA_DIR` to an absolute directory before starting:

```bash
npm run build
SNITCH_DATA_DIR="$PWD/.data" npm run start
```

The current deployment model is one Node service with persistent SQLite storage. Ephemeral serverless and multi-region storage are unsupported. Use HTTPS, exact Privy allowed origins, a persistent volume, and database backups for a hosted test environment. Compliance controls, API-key issuance, multi-user wallet policies, and stablecoin settlement remain outside the implemented backend.

### Vercel builds

`vercel.json` selects the Next.js framework, installs the locked dependencies including build tooling, and runs `npm run build`. This preserves the project's `next build --webpack` command and its Privy connector alias. Running bare `next build` selects Turbopack and fails against the Webpack configuration. The Node engine range keeps deployments on supported Node 22 releases.

A successful Vercel build can serve the public landing page and showcase, but it does not make the current SQLite backend compatible with Vercel functions. Authenticated company operations, wallet bindings, invoices, payouts, balances, and export approval require the persistent backend. Keep the full application on a Node web service with a persistent disk, or migrate these stores to a managed database before using them on Vercel. Setting `SNITCH_DATA_DIR` to `/tmp` does not provide durable storage.

To keep the Vercel frontend, deploy the same commit to a single Render web service with a persistent disk, then set `SNITCH_API_ORIGIN` on Vercel to that service's HTTPS origin. Set `SNITCH_PUBLIC_ORIGIN` on Render to the Vercel production origin so emailed checkout links return to the public site. The Render service still requires `SNITCH_DATA_DIR` to point to its mounted disk and the same Privy credentials. Do not set `SNITCH_API_ORIGIN` on Render.

## Further documentation

- [Authentication and profile setup](docs/privy-auth.md)
- [Company wallets, payouts, and CFO export verification](docs/company-wallets.md)
- [Showcase blockchain provenance](docs/showcase-blockchain.md)
- [Design conventions](DESIGN.md)
- [Development history](docs/development-history.md)
