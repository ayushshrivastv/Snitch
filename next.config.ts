import type { NextConfig } from "next";

const apiOrigin = process.env.SNITCH_API_ORIGIN?.trim().replace(/\/+$/, "");

if (apiOrigin) {
  const url = new URL(apiOrigin);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("SNITCH_API_ORIGIN must use HTTPS outside local development.");
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["@privy-io/node"],
  async rewrites() {
    return apiOrigin ? {
      // Vercel serves the interface while the Node service owns the durable
      // SQLite-backed API. beforeFiles is required because local API routes exist.
      beforeFiles: [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }],
      afterFiles: [],
      fallback: [],
    } : [];
  },
  webpack(config) {
    // This app does not use Privy's optional Farcaster/Solana connector.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@farcaster/mini-app-solana": false,
    };
    return config;
  },
};

export default nextConfig;
