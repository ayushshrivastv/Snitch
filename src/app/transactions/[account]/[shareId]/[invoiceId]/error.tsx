"use client";

import Link from "next/link";

export default function InvoiceError({ retry }: { retry: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
    <section role="alert" className="w-full max-w-md rounded-2xl border border-border bg-background p-7 text-center">
      <p className="text-sm text-muted-foreground">Snitch</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">We couldn’t load this invoice.</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Please try again to retrieve the invoice and its payment status.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={retry} className="min-h-10 rounded-full bg-foreground px-5 text-sm font-medium text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Try again</button>
        <Link href="/" className="inline-flex min-h-10 items-center rounded-full border border-border px-5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Back to Snitch</Link>
      </div>
    </section>
  </main>;
}
