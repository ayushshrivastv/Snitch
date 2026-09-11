# Implementation stage index

This index lists the implementation stages and their source changes.

## 01. Initialize Snitch repository with Git attributes for consistent file handling

- `.gitattributes`

## 02. Standardize interactive controls through shared buttons checkboxes and grouped action primitives

- `src/components/ui/button-group.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/checkbox.tsx`
- `src/lib/utils.ts`

## 03. Connect native Ethereum payments to Sepolia through validated amounts and addresses

- `services/ethereum.ts`

## 04. Define company accounts and payout records with explicit wallet ownership fields

- `src/lib/company-payout-types.ts`
- `src/lib/company-types.ts`

## 05. Bind export approval messages to company identity expiry and wallet signatures

- `src/lib/wallet-export-approval.ts`
- `tests/wallet-export-approval.test.ts`

## 06. Authenticate server requests against Privy before exposing verified workspace session details

- `src/app/api/auth/me/route.ts`
- `src/lib/privy-server.ts`

## 07. Persist company metadata and wallet associations inside a durable SQLite store

- `src/lib/company-store.ts`
- `src/types/node-sqlite.d.ts`

## 08. Coordinate company creation with verified Privy wallet ownership and consistent errors

- `src/lib/company-service.ts`

## 09. Expose account creation renaming and deletion through authenticated company management routes

- `src/app/api/companies/[companyId]/route.ts`
- `src/app/api/companies/route.ts`

## 10. Associate each treasury address with its company after checking Privy ownership

- `src/app/api/companies/[companyId]/wallet/route.ts`

## 11. Reserve the showcase company without duplicating its connected treasury wallet record

- `src/app/api/companies/playground/route.ts`

## 12. Resolve selected company wallets consistently across personal accounts and showcase access

- `src/lib/company-selection.ts`
- `tests/company-selection.test.ts`

## 13. Store invoices and confirmed payments together while preventing duplicate settlement records

- `src/lib/invoice-store.ts`
- `src/lib/invoices.ts`
- `src/lib/payment-confirmations.ts`

## 14. Capture invoice requests using authenticated company context and recorded receiving wallets

- `src/app/api/companies/[companyId]/invoices/route.ts`
- `src/app/api/invoices/route.ts`

## 15. Verify submitted payments before publishing invoice settlement status to customer checkout

- `src/app/api/payments/confirm/route.ts`
- `src/app/api/payments/status/route.ts`

## 16. Add application tooling, branding, and initial Snitch workspace foundations

- `.env.example`
- `.gitignore`
- `.nvmrc`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN.md`
- `README.md`
- `brand.md`
- `components.json`
- `eslint.config.mjs`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `postcss.config.mjs`
- `public/snitch-logo.png`
- `src/app/favicon.ico`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `tsconfig.json`

## 17. Present hosted invoices with wallet connection payment controls and confirmation feedback

- `src/app/transactions/[account]/[shareId]/[invoiceId]/page.tsx`
- `src/app/transactions/[account]/[shareId]/[invoiceId]/public-invoice-payment.tsx`
- `src/lib/record-date.ts`

## 18. Deliver requested email receipts from recorded invoice details and confirmed payments

- `src/app/api/send-receipt/route.ts`

## 19. Require matching treasury sender recipient network and amount when confirming payouts

- `src/components/auth/company-payment-request.ts`
- `src/lib/company-payment-reader.ts`
- `src/lib/company-payment-verification.ts`
- `tests/company-payments.test.ts`

## 20. Record company payouts durably and reconcile their confirmed blockchain transaction results

- `src/app/api/companies/[companyId]/payouts/confirm/route.ts`
- `src/app/api/companies/[companyId]/payouts/route.ts`
- `src/lib/company-payout-store.ts`

## 21. Retrieve exact treasury balances from Sepolia for the authenticated company account

- `src/app/api/companies/[companyId]/balance/route.ts`

## 22. Recover pending payout submissions after interruptions without losing company transaction context

- `src/lib/pending-company-payouts.ts`
- `tests/pending-company-payouts.test.ts`

## 23. Bound company wallet requests with cancellation handling and actionable connection failures

- `src/components/auth/company-wallet-request.ts`
- `tests/company-wallet-request.test.ts`

## 24. Sequence CFO signature verification before opening the selected Privy wallet export

- `src/components/auth/company-wallet-export-request.ts`
- `tests/company-wallet-export-request.test.ts`

## 25. Enforce single use export challenges through authenticated CFO verification on server

- `src/app/api/companies/[companyId]/wallet/export-approval/route.ts`

## 26. Summarize company wallet activity using exact incoming outgoing and pending totals

- `src/lib/wallet-activity.ts`
- `tests/wallet-activity.test.ts`

## 27. Calculate wallet chart series without rounding away native Ethereum amount precision

- `src/lib/wallet-chart-data.ts`
- `tests/wallet-chart-data.test.ts`

## 28. Anchor showcase records to verified Ethereum and Base transfers with standardized dates

- `src/data/showcase-base.json`
- `src/data/showcase-ethereum.json`
- `src/lib/showcase-blockchain.ts`

## 29. Map showcased payout counterparties to valid addresses from the underlying transfers

- `src/lib/showcase-payout-wallets.ts`

## 30. Collect reproducible public transfer snapshots and document their network verification provenance

- `docs/showcase-blockchain.md`
- `scripts/collect-showcase-base.mjs`
- `scripts/collect-showcase-ethereum.mjs`

## 31. Distinguish payment networks and ecosystem providers with consistent official brand assets

- `public/brands/README.md`
- `public/brands/blockchain.svg`
- `public/brands/coinbase.svg`
- `public/brands/privy.svg`
- `public/brands/the-graph.svg`
- `public/brands/visa.svg`
- `public/payment-methods/README.md`
- `public/payment-methods/base.svg`
- `public/payment-methods/ethereum.svg`

## 32. Frame authentication screens with shared branding accessible feedback and recovery actions

- `src/components/auth/auth-screen.tsx`
- `src/components/auth/auth.css`

## 33. Configure Privy email authentication while keeping company wallet creation separate from login

- `src/app/(auth)/layout.tsx`
- `src/app/(auth)/login/page.tsx`
- `src/components/auth/login-view.tsx`
- `src/components/auth/privy-provider.tsx`

## 34. Carry verified user identity and session operations through a shared workspace context

- `src/components/auth/workspace-session.tsx`

## 35. Manage company treasury provisioning signing and exports through one authenticated provider

- `src/components/auth/company-wallet-provider.tsx`

## 36. Normalize display names and save authenticated profile details for workspace personalization

- `src/app/api/profile/route.ts`
- `src/lib/workspace-profile.ts`

## 37. Protect profile loading against stalled responses cancelled sessions and stale results

- `src/components/auth/workspace-profile-request.ts`
- `tests/profile-request.test.ts`

## 38. Request missing user names through a focused accessible profile completion dialog

- `src/components/auth/profile-name-dialog.css`
- `src/components/auth/profile-name-dialog.tsx`

## 39. Personalize workspace access after verified identity and required profile details resolve

- `src/components/auth/profile-workspace.tsx`

## 40. Contain session verification timeouts with cancellation safe retries and clear recovery

- `src/components/auth/workspace-verification.ts`
- `tests/workspace-verification.test.ts`

## 41. Unify payment creation surfaces around compact forms and selected company context

- `src/components/payments/creation-dialog.tsx`

## 42. Prepare payment requests without asking users to select their company again

- `src/components/payments/create-payment-dialog.tsx`

## 43. Guide payout preparation through recipient validation amount entry and company wallet signing

- `src/components/payments/create-payout-dialog.tsx`

## 44. Display official purple Privy branding at proportional sizes across treasury interfaces

- `public/brands/privy-color.svg`
- `public/brands/privy-wordmark.svg`
- `src/components/wallets/privy-brand.tsx`

## 45. Visualize wallet payment volume and network distribution with responsive interactive charts

- `src/components/wallets/wallet-analytics.tsx`

## 46. Separate export intent from CFO verification using a cancellable Privy handoff dialog

- `src/components/wallets/wallet-export-dialog.tsx`

## 47. Organize wallet balances activity and export settings into a contained tabbed workspace

- `src/components/wallets/wallet-page.tsx`

## 48. Bridge selected company wallets to live treasury balances and financial navigation

- `src/components/auth/company-treasury-panel.tsx`

## 49. Keep navigation accessible while revealing floating controls as visitors scroll upward

- `src/components/ui/floating-navbar.tsx`

## 50. Shape the marketing surface with editorial typography and layered treasury messaging

- `public/fonts/01d59dc8e5-797e433ab948586e-s.p.1v5bejj26fx9h.woff2`
- `public/fonts/17dc8c077f-53b9e256198e5412-s.2gwoz23eiro2t.woff2`
- `public/fonts/1d8c8ecdd8-6306c77e7c8268e4-s.34r5yzckw0h2s.woff2`
- `public/fonts/600cd6890c-fef07dbb0973bf53-s.00az9qtie3ho1.woff2`
- `public/fonts/7cf78681bf-NeueHaasGroteskTextMono_55Roman-s.p.13krira9-ocwr.woff2`
- `public/fonts/80654c7a9b-7178b3e590c64307-s.0i3h3th1vs4m7.woff2`
- `public/fonts/81dec56ed0-bbc41e54d2fcbd21-s.30bdpjkrtcces.woff2`
- `public/fonts/8be28b37e8-7d817b4c03b0c5f1-s.2jyz_zw3a8jit.woff2`
- `public/fonts/9325368d48-8a480f0b521d4e75-s.3j-a226dh71aj.woff2`
- `public/fonts/a5d12a91eb-caa3a2e1cccd8315-s.p.0zr6hhvz-h9nw.woff2`
- `public/fonts/b3f9694d00-4fa387ec64143e14-s.3f4zuumv8svu0.woff2`
- `public/fonts/b8d1902972-TiemposHeadline_Light-s.p.1pywxxtc2eq7i.woff2`
- `public/fonts/c50396d69f-NeueHaasGroteskDisplay_55Roman-s.p.2pzw5qcynt64v.woff2`
- `public/fonts/cab1d69a37-NeueHaasGroteskText_55Roman-s.p.3mol-5etzisco.woff2`
- `public/fonts/f5d30a3238-5ce348bf30bf5439-s.27spqqad3wyeo.woff2`
- `src/components/landing/landing.css`
- `src/components/landing/reference-theme.css`
- `src/components/landing/snitch-editorial.css`
- `src/components/landing/snitch-hero-markup.ts`

## 51. Animate landing gradients and rotating headlines while respecting reduced motion preferences

- `src/components/landing/animated-sections.tsx`
- `src/components/landing/gradient-animation.ts`

## 52. Arrange ecosystem brands beneath the hero in a balanced responsive strip

- `src/components/landing/snitch-brand-strip.css`
- `src/components/landing/snitch-brand-strip.tsx`

## 53. Show the actual Snitch workspace inside a linked responsive product preview

- `public/images/snitch-workspace.png`
- `src/components/landing/snitch-platform-sections.tsx`

## 54. Explain treasury payments payroll and vendor workflows through distinct interactive illustrations

- `src/components/landing/snitch-workflows.css`
- `src/components/landing/snitch-workflows.tsx`

## 55. Clarify company wallet responsibilities through an interactive team access permission model

- `src/components/landing/snitch-team-section.css`
- `src/components/landing/snitch-team-section.tsx`

## 56. Demonstrate authenticated invoice creation with readable code and direct copy controls

- `src/components/landing/snitch-developer-section.css`
- `src/components/landing/snitch-developer-section.tsx`

## 57. Surface relevant product sections through keyboard accessible search and destination links

- `src/components/landing/snitch-search.css`
- `src/components/landing/snitch-search.tsx`

## 58. Close the landing narrative with fading typography and practical company navigation

- `src/components/landing/snitch-footer.css`
- `src/components/landing/snitch-footer.tsx`

## 59. Adapt floating navigation contrast to the hero gradient and lighter sections

- `src/components/landing/landing-navigation.css`
- `src/components/landing/landing-navigation.tsx`
- `src/components/landing/types.ts`

## 60. Assemble company dashboards transactions payouts and marketing into the Snitch product

- `src/app/home-client.tsx`
- `src/app/page.tsx`
- `src/components/landing/landing-page.tsx`

## 61. Open the authenticated workspace after server verification and profile completion checks

- `src/app/(auth)/workspace/page.tsx`
- `src/components/auth/workspace-access.tsx`

## 62. Exercise authentication invoices profiles and Ethereum validation with isolated account fixtures

- `tests/auth.test.ts`
- `tests/ethereum.test.ts`
- `tests/helpers/company-wallet.ts`
- `tests/helpers/privy-auth.ts`
- `tests/invoices.test.ts`
- `tests/profile.test.ts`

## 63. Challenge company isolation payout reconciliation export authority and showcase transfer integrity

- `tests/cfo-wallet-export.test.ts`
- `tests/companies.test.ts`
- `tests/company-payouts.test.ts`
- `tests/showcase-blockchain.test.ts`
- `tests/showcase-payout-wallets.test.ts`

## 64. Launch Privy authentication directly from landing without an intermediate login page

- `src/components/auth/landing-login-button.tsx`
- `src/components/landing/landing-navigation.tsx`

## 65. Document email authentication profile recovery and the boundaries of public workspace access

- `docs/privy-auth.md`

## 66. Describe company wallet ownership durable storage and CFO controlled export behavior

- `docs/company-wallets.md`

## 67. Detect tracked credentials and local runtime artifacts before repository publication checks

- `package.json`
- `scripts/check-repository.mjs`

## 68. Automate installation repository checks tests linting and production builds on GitHub

- `.github/workflows/ci.yml`

## 69. Outline current product capabilities and local setup

- `README.md`
- `docs/development-history.md`

## 70. Equip contributors with review expectations and a complete implementation stage index

- `.github/pull_request_template.md`
- `CONTRIBUTING.md`
- `docs/development-commits.md`

