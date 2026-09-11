export type ShowcasePayoutWallet = Readonly<{ from: string; to: string }>;

// Address-format fixtures for illustrative pending/failed playground payouts only.
// These are not verified blockchain wallets, company-owned addresses, or deposit
// destinations. No private keys were generated and no funds should be sent here.
// Successful payouts use the RPC-verified addresses in showcase-blockchain.ts.
//
// Reproducible offline derivation with ethers:
//   getAddress(`0x${keccak256(toUtf8Bytes(label)).slice(-40)}`)
// Treasury label: "snitch:playground:treasury".
// Recipient label: `snitch:playground:${network}:${payoutId}:recipient`.
// Hashing public labels formats fixture addresses; it does not derive wallet keys.
export const PLAYGROUND_TREASURY_ADDRESS = "0xD43733B4d4Be99438609Ecaeade7526BF80efb7C";

export const showcasePayoutWallets: Readonly<Partial<Record<string, ShowcasePayoutWallet>>> = {
  // Ethereum Sepolia — Incomplete.
  PO_2F5BD907A118: {
    from: PLAYGROUND_TREASURY_ADDRESS,
    to: "0x3F6fA3EF787b44772b8d55B2a07Fde9C336eac51",
  },
  // Ethereum Sepolia — Incomplete.
  PO_D4E8C3FA7019: {
    from: PLAYGROUND_TREASURY_ADDRESS,
    to: "0x9aFf2c0aCE1dA30c08d08C9e37B9F8Ac15c1d267",
  },
  // Base Sepolia — Incomplete.
  PO_9C31F0E74B26: {
    from: PLAYGROUND_TREASURY_ADDRESS,
    to: "0xe14a3856FF60445aa64863Abd92Fc67AfB5D309F",
  },
  // Ethereum Sepolia — Incomplete.
  PO_4A86BE011F92: {
    from: PLAYGROUND_TREASURY_ADDRESS,
    to: "0x45bf654E3E8807b03F2d74cD9Cf200e8a10449a1",
  },
  // Ethereum Sepolia — Failed.
  PO_B8D24E37CA55: {
    from: PLAYGROUND_TREASURY_ADDRESS,
    to: "0x35252020F0004ba820a82F4eBfb10FdB99A4a2a3",
  },
};
