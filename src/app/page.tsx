import type { Metadata } from 'next';
import HomeClient from './home-client';

type PageProps = { searchParams: Promise<{ demo?: string }> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { demo } = await searchParams;
  if (demo === '1') {
    return { title: 'Snitch', description: 'ETH checkout and payout operations on Ethereum Sepolia.' };
  }
  return {
    title: 'The operating layer for onchain payments | Snitch',
    description: 'Shared wallets, team permissions, and stablecoin workflows. Bring payments, payroll, vendor payouts, and treasury into one company workspace.',
  };
}

export default function Page() {
  return <HomeClient />;
}
