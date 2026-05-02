import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snitch",
  description: "Global stablecoin checkout and compliance for businesses",
  icons: {
    icon: "/snitch-logo.png",
    shortcut: "/snitch-logo.png",
    apple: "/snitch-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
