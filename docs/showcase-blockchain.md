# Playground blockchain records

Snitchpay.co's Playground keeps 23 transaction rows and 11 payout rows. Its 12 successful transactions and 6 successful payouts use distinct public native ETH transfers from Ethereum Sepolia and Base Sepolia. The other rows remain illustrative workflow examples. Customer names, invoice references, and the assignment of a transfer to a payment or payout are presentation labels; they do not identify the owners of the public wallets or imply those transfers were processed by Snitch.

The successful rows are verified historical snapshots, not a live wallet feed. Their amounts, sender and recipient addresses, hashes, block numbers, and UTC timestamps come from blockchain RPC responses. Values are stored both as integer wei and exact ETH strings. Gas is separate from transferred value; payout details link to the receipt for its actual fee. Both pages provide explorer links, and CSV exports include blockchain references and provenance.

Snapshots live in `src/data/showcase-ethereum.json` and `src/data/showcase-base.json`. `src/lib/showcase-blockchain.ts` binds them to existing showcase row IDs and rejects missing or wrong-network assignments. Real company records do not use these snapshots.

Pending and failed Playground payouts use checksummed address-format fixtures from `src/lib/showcase-payout-wallets.ts`. These are presentation data, not verified or company-owned wallets; no keys are generated. Successful payout details always take sender and recipient directly from the verified transfer. Both addresses display in full with checksum casing and copy controls. A real company without a treasury address never falls back to a Playground address.

## USD treasury presentation

The Snitchpay.co wallet overview uses explicitly selected showcase USD figures from `src/data/showcase-treasury.ts`: a $98.00 current balance and $6,821.00 in payment volume across September 9–11, 2026. Values use integer cents; the 30-day balance history ends at $98.00 and the three-day volume total sums its observations. These fixtures are independent of the historical ETH transfer rows and do not price Sepolia ETH in USD.

Only `ShowcaseTreasuryPanel` supplies these figures. Real company wallets retain their onchain balances. The Snitchpay.co identity card also keeps its live ETH balance, refresh control, network, and address. USD presentation values never enter invoices, payout validation, signing, or export authority.

## Collect and verify

Run from the project root:

```sh
node scripts/collect-showcase-ethereum.mjs
node scripts/collect-showcase-base.mjs
npm test
```

The scripts only read public RPC endpoints. They verify the chain, finalized block, positive native ETH value, empty calldata, matching receipt and block, successful receipt status, and recipient code. Ethereum's public endpoint prunes historical state, so its collector additionally requires a 21,000-gas receipt without logs and checks current recipient code. No wallet signing or transaction submission occurs.

The collection window is September 8–12, 2026. Actual mined timestamps are retained even when fewer dates have finalized. Each snapshot includes its public RPC source and verification timestamp. The tests validate coverage of every successful seed row, uniqueness, network matching, exact wei conversion, and explorer/date consistency. They do not contact public RPC services on every test run.

References: [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/), [Base RPC networks](https://docs.base.org/base-chain/api-reference/rpc-overview).
