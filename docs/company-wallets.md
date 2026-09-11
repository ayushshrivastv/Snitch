# Company wallets

The first Privy sign-in does not create a wallet. Creating a company reserves a persistent company record, then the authenticated owner creates a fresh Ethereum embedded wallet with Privy's browser SDK. Snitch's server verifies that wallet against the owner's Privy linked accounts and records its public address and wallet ID. Snitch does not receive a private key, create an authorization key, or register a server signer.

Each company has its own wallet. A wallet can only be linked to one company. Company management, Snitch's balance endpoint, and invoice creation are restricted to the verified owner. Customer invoice links and payment status/confirmation remain public for checkout; onchain addresses and balances are public blockchain data.

## Snitchpay.co Playground treasury

The Snitchpay.co display account can be connected to a real Privy wallet for testing. Its treasury is private to the signed-in owner: each owner has one durable company record with `purpose: "playground"` and a generated UUID. The server fixes its name to `Snitchpay.co`. This is not a global treasury shared by everyone visiting the Playground, and the static showcase identifier `inst_final_snitch` is never accepted as a payable company.

`POST /api/companies/playground` reserves or retrieves that owner's record. It uses the same Privy baseline snapshot, fresh-wallet eligibility checks, one-pending-setup limit, and verified binding endpoint as ordinary company creation. It does not create a wallet server-side, trust a supplied owner/address, reuse a pre-existing personal wallet, or delegate signing to Snitch. A pending ordinary company must finish its setup before a new Playground reservation can begin. Repeated requests, multiple tabs, and restarts return the same owner's Playground record; separate owners receive separate IDs and wallets.

Once bound, invoice creation and balance queries use that real record's UUID and verified address. Snitch allows export only for the assigned CFO after a verified approval signature, as described below. Sepolia test ETH received or sent through this wallet is real onchain testnet activity. Existing showcase transactions remain historical demonstration records; their amounts must not be presented as this wallet's balance or as transfers signed by its owner. Read-only visitors can still browse the showcase without receiving wallet authority.

The wallet belongs to the creator's Privy user at the wallet authorization layer and is assigned to the company in Snitch's records. Team invitations, shared signing, owner transfer, approval thresholds, and corporate recovery are not implemented by this flow. A future team-access system needs explicit membership and signing policies; displaying company roles alone does not grant wallet authority. This implementation stores no private keys, creates no server signer, and makes no legal claim about custody status.

## Persistence

Run with Node.js 22.14 or newer (`node:sqlite` is required). Development uses `.data/snitch.sqlite`; the entire `.data` directory is ignored by Git. The database contains company names, owner/CFO Privy DIDs, public wallet identifiers, wallet-creation baselines, request IDs, invoices, verified payment records, payouts, and export challenges. It contains no wallet signing material.

On first use after this update, the store adds the `purpose` column inside a serialized SQLite migration. Existing rows default to `company`, even if their name is Snitchpay.co; existing ownership and wallet bindings are preserved. A partial unique index enforces one `playground` record per owner independently of browser behavior.

Production must set `SNITCH_DATA_DIR` to an absolute path on a persistent volume and run a single service instance sharing that database. Back up the database and its WAL correctly using SQLite's backup tooling. The service fails closed when the directory is not configured in production or when a known ephemeral serverless environment is detected. A serverless or multi-region deployment requires a managed durable database implementation before use; do not point this setting at temporary storage.

## Interrupted setup

The creation request uses an owner-scoped UUID to prevent duplicate company records. Reusing the same request ID and original name returns the existing company; reusing it with a different name fails. Only one company may await wallet setup for an owner at a time. Its baseline snapshots existing embedded wallets before creation. The client retains the request ID while its create dialog remains mounted. After a refresh, the saved pending company can be reopened through `Finish wallet setup`.

The client serializes setup within the page and, where Web Locks are available, across tabs sharing the origin. These locks do not coordinate separate devices. The server's reservation and binding rules remain the authority.

When exactly one new eligible unbound embedded wallet appears, the server returns `walletCandidateAddress` so the client can finish linking it without creating another wallet. It rejects pre-existing, imported, delegated, external, foreign-owned, already-bound, or explicitly non-user-signable wallets. If concurrent creation across devices produces multiple candidates, automatic linking stops with an ambiguity error. No wallet is selected arbitrarily. Ambiguity requires reviewed reconciliation; there is no automatic wallet replacement or owner-transfer endpoint. Ordinary companies can be renamed or deleted. The fixed Playground name cannot be changed, and Playground records cannot be deleted.

## Deleting a company

The authenticated owner can delete an ordinary company through its account settings. This removes the Snitch company record, its invoices and payment confirmations, payouts, and export challenges in one database transaction. The underlying Privy wallet is not deleted, exported, or transferred; funds and private-key control remain with that Privy wallet. This operation does not reverse blockchain transactions. The server rejects deletion of another user's company and the owner-scoped Snitchpay.co Playground.

## Balances and supported network

Balances come directly from the configured Ethereum RPC after verifying Ethereum Sepolia's chain ID. RPC failures return an unavailable balance, never a simulated number. The supported balance and checkout asset is native test ETH on Sepolia. The Ethereum wallet address may exist across EVM networks, but this integration does not enable mainnet, Base, or stablecoin payment execution.

## CFO export approval

Each company has a server-assigned `cfoUserId`. New companies and Playground reservations assign the creating Privy user as CFO. A one-time SQLite migration assigns existing company controllers as CFO without changing wallets or transaction records. A deliberately cleared CFO is not restored on restart. Connect displays this authoritative role for the signed-in controller; ordinary team dropdowns cannot assign, remove, or demote it. The remaining editable Connect members are still interface state, not signing permissions or persisted invitations.

The CFO opens **Wallets → Export Privy company wallet**, reviews the selected company in the popup, and clicks **Verify**. Opening the popup does not request a signature or open key export. Snitch checks the authenticated Privy identity against the company's stored CFO and wallet controller. It also verifies the selected wallet is still an eligible embedded wallet linked to that Privy user. The server issues a five-minute request containing a random nonce, company, user, wallet, purpose, and expiry. The CFO signs that exact message with the selected company wallet. This is an EIP-191 message signature, not an onchain transaction; it moves no funds and costs no gas.

The server rechecks CFO status and Privy wallet control, verifies the signature, and atomically consumes the nonce. Expired, reused, cross-company, cross-user, and wrong-wallet approvals fail. Only after that confirmation does the normal Snitch client invoke `exportWallet({ address })`. The Snitch popup releases its modal focus before Privy opens, and returns with a retry action if verification fails. Cancellation, verification failure, expiry, logout, and leaving the selected wallet prevent the client from opening export. Public challenge metadata is stored; signatures and keys are not stored. Privy's protected interface handles the key directly.

**Enforcement boundary:** this gates export through Snitch. Privy's export API accepts the wallet address, not a Snitch approval token, and the Privy wallet owner retains independent export/recovery access. Snitch cannot claim provider-level enforcement of its extra signature against a modified client or direct Privy request. Restricting that recovery path would require a different wallet ownership/quorum architecture; this implementation preserves the existing user-owned wallets and adds no Snitch signing key. Export is scoped to this Privy app's authenticated user, not an assumed generic Privy dashboard login. See [Privy's wallet export documentation](https://docs.privy.io/wallets/wallets/export).

## Invoice records and testing scope

`POST /api/invoices` requires a ready company owned by the token identity and reads the receiving address from its verified wallet binding. It ignores client-supplied treasury addresses. Invoice records and verified payment confirmations are persisted in the same SQLite database, preserving the exact decimal amount, recipient, invoice reference, and confirmation after restart. A unique transaction-hash constraint and serialized writes prevent the same transfer from confirming multiple invoices across database connections.

The owner-only `GET /api/companies/:companyId/invoices` endpoint restores that company's invoices and their confirmed payment details for the workspace. Public invoice checkout and payment-status lookup continue to use the durable invoice reference. Invoice links created before this persistence change cannot be recovered if their former in-memory records were already lost in a restart.

## Sending company payouts

`Create payout` resolves the selected display account to its owned company UUID. The Privy SDK is given that company's exact wallet address, the recipient, an integer wei amount, and Ethereum Sepolia's chain ID. Privy's approval interface remains enabled. Closing or rejecting that approval does not create a payout. Snitch does not have a server signing path.

After Privy returns a broadcast hash, the workspace records it as pending and keeps an owner-scoped browser recovery entry containing only public transaction details. It never resends while checking a receipt. The authenticated payout endpoint independently checks the RPC network, transaction sender, recipient, exact amount, native-transfer calldata, receipt, and canonical block before storing the record in SQLite. Successful receipts become `Succeeded`, reverted receipts become `Failed`, and unmined transactions stay `Incomplete`. Unindexed transactions are retried for recording without broadcasting again.

Payout lists restore after reloading. Browser recovery entries are removed only after a durable server record is returned; if browser storage is unavailable, recovery before the first server save depends on keeping the page open. Confirmed invoice and payout links use the corresponding transaction explorer URL. The historical Playground rows remain alongside the owner's new activity and do not determine the connected wallet's onchain balance.

Automated tests use locally signed test tokens with real SDK token verification, stubbed Privy account responses, temporary SQLite databases, and stubbed Ethereum RPC responses. They check owner isolation, duplicate reservations, wallet eligibility, ambiguous recovery, restart persistence, invoice recipient selection, and balance failures. They do not create live Privy wallets, transfer funds, or export actual keys. The account holder must complete the real sign-in, additional-wallet creation, interrupted-setup, and export checks before treating those user flows as accepted.

## API

All endpoints require a Privy access token in `Authorization: Bearer …` and return `Cache-Control: no-store`.

- `GET /api/companies`: `{ companies: CompanyAccount[] }`.
- `POST /api/companies`: `{ name, requestId }`; returns `{ company }` with 201 for reservation or 200 for an idempotent replay.
- `POST /api/companies/playground`: no body required; returns `{ company }` with 201 for the owner's first Playground reservation or 200 for a replay. Name, purpose, owner, and wallet baseline are server-derived.
- `PATCH /api/companies/:companyId`: `{ name }`; returns `{ company }`.
- `DELETE /api/companies/:companyId`: deletes an owned ordinary company and its Snitch records; returns `{ deletedCompanyId }`. It does not delete the underlying Privy wallet.
- `POST /api/companies/:companyId/wallet`: `{ address }`; verifies Privy ownership and binds a fresh wallet; returns `{ company }`.
- `POST /api/companies/:companyId/wallet/export-approval`: no body required; CFO-only, returns `201 { approval: { id, companyId, userId, walletAddress, message, expiresAt } }`.
- `PUT /api/companies/:companyId/wallet/export-approval`: `{ approvalId, signature }`; verifies and consumes the approval, returning `{ approved: true, companyId, walletAddress, approvalId }`.
- `GET /api/companies/:companyId/balance`: `{ balance, currency: "ETH", network: "Ethereum Sepolia", chainId: 11155111 }`.
- `GET /api/companies/:companyId/invoices`: `{ invoices }`, newest first. Each record contains the stored invoice fields, `status: "Incomplete" | "Succeeded"`, and `payment: ConfirmedInvoicePayment | null`.
- `GET /api/companies/:companyId/payouts`: `{ payouts }`, scoped to the authenticated owner.
- `POST /api/companies/:companyId/payouts`: `{ transactionHash, to, amount, receiverName?, memo? }`; verifies and idempotently records the observed transfer, returning `{ payout }`.
- `POST /api/companies/:companyId/payouts/confirm`: `{ transactionHash, to, amount }`; rechecks the receipt and updates or recovers a durable payout record.

`CompanyAccount` exposes public account metadata including `purpose: "company" | "playground"`, `cfoUserId`, and, for a pending record, its wallet baseline and any single recoverable candidate. A ready record includes `wallet.address` and its optional `wallet.privyWalletId`. Errors contain a human-readable `error` and a stable `code`; `COMPANY_SETUP_PENDING` also includes the existing pending company so setup can be resumed. `PLAYGROUND_NAME_FIXED` rejects changes to the Playground name.

Implementation: `src/lib/company-store.ts`, `src/lib/company-service.ts`, `src/app/api/companies/`, `src/components/auth/company-wallet-provider.tsx`, and `src/components/auth/company-treasury-panel.tsx`. Profile setup is documented in [Privy authentication](privy-auth.md).
