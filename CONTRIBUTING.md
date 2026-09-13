# Contributing to Snitch

Thank you for helping improve Snitch. The project brings company treasuries, payouts, invoices, and transaction records into one onchain workspace. Contributions should make these workflows clearer, safer, or more reliable while preserving the company’s control of its wallets.

## Before you begin

Read the [README](README.md) for the product overview and current scope. The detailed trust boundaries and operating flows are documented here:

- [Privy authentication](docs/privy-auth.md)
- [Company wallets](docs/company-wallets.md)
- [Payment settlement](docs/payment-settlement.md)
- [Invoice email](docs/invoice-email.md)
- [Database deployment](docs/vercel-database.md)

Snitch currently settles native test ETH on Ethereum Sepolia. Please do not present unfinished mainnet, stablecoin, shared-signing, refund, or dispute features as supported product behaviour.

This repository uses Next.js 16. Its APIs and conventions can differ from earlier versions. Read the relevant guide in `node_modules/next/dist/docs/` before changing routing, caching, server actions, middleware, or request handling. Keep the generated Next.js guidance block in `AGENTS.md` intact.

## Ways to contribute

Useful contributions include:

- Fixing a reproducible bug in authentication, accounts, invoices, payouts, or transaction history.
- Improving payment recovery, confirmation, and database consistency.
- Making the interface clearer, more accessible, or more responsive.
- Adding focused tests for meaningful failure cases and security boundaries.
- Correcting documentation that no longer matches the working product.

Keep each contribution centred on one clear problem. For a large feature or architectural change, open an issue first and explain the user need, the proposed behaviour, and any effect on wallet authority or stored data.

## Set up Snitch locally

Snitch uses Node.js `22.14.0`, recorded in `.nvmrc`.

```bash
git clone https://github.com/ayushshrivastv/Snitch.git
cd Snitch
nvm use
npm ci
cp .env.example .env.local
```

Add your own development credentials to `.env.local`, then start the application:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`. Local development uses `.data/snitch.sqlite`. You need a Privy application configured for email authentication to test protected company flows, and a Sepolia wallet with test ETH to test a real transfer.

Turso is required only when testing shared remote storage. Resend is required only when testing invoice email delivery. Never use production credentials or company funds while developing.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/app` | Next.js routes, layouts, pages, and server endpoints |
| `src/components` | Product interfaces for authentication, payments, wallets, and the landing page |
| `src/lib` | Authentication, company records, invoices, payouts, settlement, and database services |
| `services` | Ethereum RPC helpers |
| `tests` | Node and TypeScript tests for product behaviour and failure cases |
| `scripts` | Repository checks, database migrations, imports, and showcase collection tools |
| `docs` | Security boundaries, payment flows, deployment guidance, and supporting research |

## Development principles

### Keep wallets under company control

Privy owns the protected authentication, signing, and key-export interfaces. Snitch may store the public wallet identifiers and transaction metadata required to operate the workspace, but private keys, recovery phrases, and signing material must never pass through Snitch code, logs, tests, or databases.

### Verify every payment on the server

A wallet prompt, button click, client response, or transaction hash is not proof of payment. A successful invoice or payout must be established by the backend from the configured Ethereum RPC. Check the expected chain, sender, recipient, exact integer wei amount, transaction data, successful receipt, and canonical block.

Do not use floating-point arithmetic for payment values. Do not allow one transaction hash to settle more than one record. Preserve incomplete transactions for later reconciliation, and retry verification with the existing hash instead of broadcasting another transfer.

### Protect account boundaries

Every company, invoice, payout, export challenge, and history request must be scoped to the authenticated Privy identity and selected company. Never trust an account ID, wallet address, role, or payment status supplied by the browser without server-side verification.

Deleting a company, invoice, or payout must update durable storage. Preserve deletion markers where reconciliation could otherwise restore an intentionally removed record. Deleting a Snitch account must never be presented as deleting its Privy wallet or reversing an onchain transfer.

### Design for interruption

Wallet rejection, RPC delay, database failure, a closed tab, or a lost connection can happen at any stage. Keep broadcasting separate from recording, retain a public transaction hash as soon as it exists, and make retries idempotent. An interrupted request must not create duplicate wallets, invoices, payouts, or transfers.

### Keep the interface calm and precise

Use the existing components, typography, spacing, and language before introducing a new pattern. Financial states must describe persisted product state rather than optimistic client state.

Use “onchain”, “Ethereum Sepolia”, “Privy”, and “explorer” consistently. Keep internal implementation details out of customer-facing payment flows unless they help the customer make a decision. New controls must remain usable with a keyboard and across the layouts already supported by the product.

## Database changes

The application uses local SQLite during development and Turso/libSQL in deployed environments. Schema changes belong in `src/lib/database-schema.ts` and must remain safe for existing records.

After a schema change, run:

```bash
npm run db:migrate
```

Add tests for migrations, ownership boundaries, retry behaviour, and deletion behaviour when they are affected. Keep external network calls outside database transactions. Never point development commands or automated tests at the production database. Follow [the database import guide](docs/database-import.md) for an authorised one-time import.

## Test your change

Run the checks that cover your work while developing. Before opening a pull request, run the same checks enforced by CI:

```bash
npm run check:repo
npm run lint
npm test
npm run build
```

You can also run the TypeScript compiler directly while working:

```bash
npx tsc --noEmit
```

`npm run check:repo` scans tracked files for credentials, private key material, local databases, build artefacts, and other files that must stay outside the repository.

Tests should prove behaviour at a meaningful boundary. Wallet and payment changes should cover authorisation, selected-company scoping, exact amounts, user cancellation, network confirmation, duplicate prevention, and recovery after interruption. Automated tests must use isolated databases and mocked services. They must never send funds, request a real signature or login code, send a real email, export a key, or depend on a contributor’s Privy account.

For interface changes, test the relevant flow in the browser and include a screenshot or short recording in the pull request when it helps a reviewer understand the result.

## Write clear commits

Use small commits that describe the behaviour they introduce. Record each commit with its real creation date and a direct title such as:

```text
Keep pending invoices available until expiry
Verify payout receipts before recording success
Improve mobile treasury navigation
```

Avoid combining unrelated design, data, and payment changes in one commit. Do not commit `.env.local`, `.env.turso.local`, files under `.data`, private keys, access tokens, wallet exports, user information, generated build output, or editor files.

## Open a pull request

Open your pull request against `main` and complete the repository template. A useful description explains:

- The problem and the resulting behaviour.
- The user flow or technical boundary that changed.
- The automated checks and manual scenarios you completed.
- Any new environment variables, schema changes, migrations, or known limits.

Keep the branch current with `main` and resolve review comments with focused follow-up commits. CI must pass before the change is ready to merge.

## Handle security and data carefully

Never commit or share credentials, access tokens, private keys, recovery phrases, wallet exports, database files, session state, or logs containing sensitive provider responses. Keep secret values blank in `.env.example`, and never print bearer tokens, signatures, or key material during debugging.

Do not publish exploitable wallet details or sensitive user information in a public issue. Contact the [repository owner](https://github.com/ayushshrivastv) privately before sharing a security reproduction. Replace live identifiers with test values and avoid moving funds while investigating.

Every contribution should leave Snitch easier to understand and safer for a company to operate.
