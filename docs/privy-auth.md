# Privy authentication

Snitch opens Privy email sign-in directly from the landing page's Login button. Closing the dialog leaves the visitor on the landing page; successful sign-in opens `/workspace`. `/login` remains available as a direct entry and authentication fallback. The workspace opens from Privy's authenticated client identity immediately, then synchronizes the server-verified profile in the background. Every protected API request still verifies its Privy access token independently. Privy manages session persistence and token refresh. Signing in does not create a wallet.

## Profile and sidebar name

`GET /api/profile` reads the user identified by the verified token. A saved `custom_metadata.display_name` takes precedence over a linked provider's name or username. The current email-only login normally supplies no name; Snitch does not invent one from the email address.

When no name is available, a focused dialog asks the signed-in user to enter one after the profile request resolves. `PUT /api/profile` validates and saves it to that user's Privy custom metadata, preserving existing metadata fields. The name is normalized, limited to 80 characters, and supports international names. The browser cannot choose another profile's user ID or write arbitrary metadata through this route.

The sidebar's bottom user menu and workspace greeting read the same profile name. Initials are derived from it. This persists across browser refreshes and later sign-ins to the same Privy account; it does not depend on local storage. Sign out remains available during profile setup.

## Configuration

Copy the variable names from `.env.example` into `.env.local`:

```dotenv
NEXT_PUBLIC_PRIVY_APP_ID=your-app-id
PRIVY_APP_SECRET=your-app-secret
```

The App ID is a public identifier. The app secret is read only by `src/lib/privy-server.ts` and must never use a `NEXT_PUBLIC_` prefix. `.env.local` is ignored by Git; `.env.example` contains placeholders only. Keep the local file owner-readable only. For a deployed environment, set the values in the host's secret/environment settings rather than source control.

Email authentication must be enabled in Privy's dashboard. The SDK uses email login, a light Snitch theme, and explicitly disables automatic embedded wallet creation on login. The company creation action provisions a wallet separately.

For production, configure exact allowed origins in Privy, use HTTPS, and rotate the testing secret. The company database also requires a persistent host and an absolute `SNITCH_DATA_DIR`; see [Company wallets](company-wallets.md). No production credentials or Privy dashboard settings are changed by the application code.

## Routes and data

- `/`: public landing page. Login opens Privy's dialog in place and routes to the workspace only after authentication or an explicit Login click with an existing session.
- `/?demo=1`: public sample workspace. Snitchpay.co retains the seeded transactions, payouts, and API-key examples. Historical showcase invoice links are nonpayable previews; creating and emailing real invoices requires a signed-in user and a ready company wallet.
- `/workspace`: authenticated workspace. The same Snitchpay.co showcase appears alongside the user's company accounts, while the sidebar keeps the authenticated profile name. `Create Account` creates a company and its own Privy wallet. Snitchpay.co displays the same existing treasury for all visitors. Only its original CFO can recover its durable account record after server-side Privy verification and authorize signing or key export; visitor sessions do not create another Snitchpay.co wallet. Company records and public treasury identifiers persist in SQLite. Displayed team roles do not confer signing authority.
- `GET /api/auth/me`: validates a bearer token and returns the verified Privy user ID. Responses are not cached.
- `GET /api/profile` and `PUT /api/profile`: load and save the verified user's display name. Responses are not cached.
- `/api/companies` and its company-specific wallet, name, deletion, balance, invoice, and payout routes: allow the verified owner to manage their own companies. Wallet export additionally checks the stored CFO identity. See the wallet document for request shapes.
- `POST /api/invoices`: requires a `companyId` owned by the verified user and a completed company wallet. The server derives the recipient address and company name from that saved company, and attaches the verified owner ID to the invoice. Client-supplied recipient addresses cannot redirect the invoice.
- `POST /api/send-receipt`: validates a bearer token and requires a stored invoice owned by that user. Invoice details are taken from the server record.
- Customer invoice links, payment status, and payment confirmation remain public so recipients can complete checkout without joining the merchant workspace.

Company records, invoices, payment confirmations, and recorded payouts survive server restarts in SQLite. Live company payouts request approval through Privy and are verified against the blockchain before their status is stored. Showcase records, editable Connect roles, compliance screens, and API-key examples remain interface data rather than implemented team authorization or compliance services. Live checkout and payout execution currently support native ETH on Ethereum Sepolia, not stablecoin, Base, or mainnet transfers.

API callers must include `Authorization: Bearer <Privy access token>`. There is no demo token or development bypass. Never log tokens or put them in URLs.

## Local connection recovery

The Privy server SDK is loaded as a native Node dependency rather than bundled into the authentication route. Profile requests have a 25-second deadline and synchronize without replacing the workspace with a second authentication screen. A stalled attempt shows a retry notice; cancelled or late responses cannot change a new session's profile. Interrupted company wallet creation resumes the saved company instead of requiring a new account; details are in [Interrupted setup](company-wallets.md#interrupted-setup).

## Manual verification

1. Click Login on `/`; confirm the Snitch-branded Privy email dialog appears without navigating away. Close it and reopen it; also check the direct `/login` fallback.
2. Sign in using your own email and verification code. If the account has no name, enter it in the popup. Confirm the sidebar bottom and greeting use that name.
3. Refresh, then sign out and back in. Confirm the name is retained and the name popup is not repeated. Signing in alone should not create a wallet.
4. Choose `Create Account`. Confirm one company and a separate Privy treasury address appear. Create another company and confirm it receives a different address.
5. Open the company's Wallets view. Confirm it shows the public address and a Sepolia ETH balance; an RPC outage must show unavailable instead of a sample balance. `Export Privy company wallet` must first open Snitch's CFO popup. Only clicking Verify requests the wallet signature; Privy export for the exact address opens after successful server verification. Check cancellation and signature rejection without copying keys into logs, screenshots, or test artifacts.
6. Create an invoice for a ready company. Confirm its checkout recipient is that company's stored treasury address. After a server restart, company accounts, invoices, and confirmed payments should remain.
7. Sign out and sign into a different account. Confirm company management and profile data are isolated. Confirm the public demo remains available.

`npm test` covers token verification, profile validation and ownership, request cancellation, company persistence and wallet binding, invoice and payout verification, and CFO export challenges. Privy user/wallet responses and RPC responses are mocked in these tests; they do not create live wallets, send login codes, export real keys, or prove a completed real-user recovery flow. Real sign-in and wallet creation/export remain manual acceptance checks by the account holder. `npm run build` checks production compilation separately.

Implementation: `src/components/auth/workspace-access.tsx`, `profile-workspace.tsx`, `profile-name-dialog.tsx`, `workspace-session.tsx`, `src/app/api/profile/route.ts`, and `src/lib/workspace-profile.ts`.

References: [Privy custom metadata](https://docs.privy.io/user-management/users/custom-metadata), [automatic wallet creation](https://docs.privy.io/basics/react/advanced/automatic-wallet-creation), and [wallet export](https://docs.privy.io/wallets/wallets/export).
