import type { Metadata } from "next";
import { SnitchAuthProvider } from "@/components/auth/privy-provider";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <SnitchAuthProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}>{children}</SnitchAuthProvider>;
}
