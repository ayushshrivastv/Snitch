# Invoice and payout settlement

The supported execution network is Ethereum Sepolia, using native test ETH.
Snitchpay.co uses its existing CFO-controlled Privy wallet; its address and wallet
ID are verified against Privy. Displaying the public address does not grant a
viewer permission to send funds or export keys.

## Incoming invoice payments

Creating an invoice stores its company, exact decimal amount and verified treasury
address in the durable database. Checkout opens Privy's external Ethereum wallet
selector without requesting a customer profile. The wallet is asked to switch to
Sepolia and send the exact amount with the invoice reference in transaction data.

After broadcast, checkout saves the hash locally and immediately submits it to the
server. The public receipt request uses keepalive and outlives the checkout screen.
The server saves an unverified candidate before RPC lookup. Candidates have a
seven-day lifetime, a per-invoice limit and retry backoff. They cannot reserve a
transaction hash for another invoice or claim that a payment is successful.

Once the RPC indexes the transfer, Snitch verifies the chain ID, recipient, exact
wei amount and invoice data before saving a bound pending attempt. A successful
receipt must match the transaction hash, sender, recipient and canonical block.
The recorded confirmation time comes from that block. Success is returned only
after the database commit. A transaction cannot confirm multiple invoices.

Checkout polls status and shows a plain Payment successful screen with a black
View at Explorer link. Reopening a confirmed invoice restores that screen. A
pending payment is only rechecked, never resent by a confirmation retry. Same-origin
Web Locks prevent simultaneous checkout sends in separate tabs. Wallet approval
is always required for a new transfer.

## Outgoing company payouts

Payout signing specifies the selected company's exact Privy wallet address,
recipient, amount in wei and Sepolia chain. The signed-in controller must have
that embedded wallet available. A separate browser-tab send lock prevents
simultaneous approval flows for the same company.

The broadcast hash and recipient metadata are saved as an owner-bound submission,
including when the RPC has not indexed it or is unavailable. The submission is
Incomplete; it is not evidence that money moved. The server independently verifies
sender, recipient, amount, native-transfer data, receipt and canonical block before
promoting it into the payout ledger. Successful and reverted receipts retain their
terminal state when an older pending request finishes later. Retrying preserves
original payout identifiers, date, receiver name and note.

## Sessions and reconciliation

Vercel uses the configured remote libSQL/Turso database; development can use a local
SQLite file. Session storage is not the source of truth. Confirmed records and
indexed pending attempts survive server restarts, sign-out and browser changes.
Unindexed submissions are persisted separately and retried with bounded backoff.

The workspace restores owned invoices and payouts at login and refreshes them every
15 seconds and on focus/reconnection. Transaction-page status checks also reconcile
pending receipts. Checkout polls every four seconds. No background scheduler is
required: if every screen is closed, submitted records are retained and their
receipts are reconciled when checkout or company history is next opened.

A transfer made manually without an invoice reference can fund the wallet, but is
not automatically assigned to an invoice. The payer must complete the checkout
flow for deterministic invoice matching. A browser or network failure before any
hash reaches Snitch cannot be recovered by the backend alone; local public-hash
recovery is retained for that case. Neither keys nor access tokens are persisted
with payment records.

## Validation

Tests cover exact transfer matching, wrong-chain/amount/recipient/reference
rejection, canonical and reverted receipts, storage/RPC outages, cross-session
recovery, duplicate confirmations, indexing delays, unauthorized access, and stale
responses. Checkout orchestration tests assert that confirmation retries never
broadcast another payment. These use isolated databases and mock RPC/wallet
responses; they do not move real funds or export keys.
