import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import "./auth.css";

export function AuthScreen({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <main className="snitch-auth">
    <Link className="snitch-auth__brand" href="/" aria-label="Snitch home"><Image src="/snitch-logo.png" alt="" width={36} height={36} priority /><span>Snitch</span></Link>
    <section className="snitch-auth__card" aria-labelledby="auth-heading">
      <span className="snitch-auth__eyebrow">The Snitch workspace</span>
      <h1 id="auth-heading">{title}</h1>
      <p className="snitch-auth__description">{description}</p>
      {children}
    </section>
    <footer className="snitch-auth__footer"><Link href="/">Back to Snitch</Link><span>Authentication by <Image src="/brands/privy.svg" alt="Privy" width={55} height={15} style={{ width: 55, height: "auto" }} /></span></footer>
  </main>;
}
