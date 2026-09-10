"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUp } from "lucide-react";
import "./snitch-footer.css";

const footerGroups = [
  {
    id: "footer-product",
    title: "Product",
    links: [
      ["Overview", "#platform"],
      ["Company wallets", "#team-access"],
      ["Developer tools", "#developers"],
    ],
  },
  {
    id: "footer-solutions",
    title: "Solutions",
    links: [
      ["Treasury", "#workflow-treasury"],
      ["Payments", "#workflow-payments"],
      ["Payroll", "#workflow-payroll"],
      ["Vendor payouts", "#workflow-vendors"],
    ],
  },
  {
    id: "resources",
    title: "Resources",
    links: [
      ["Workspace", "/?demo=1"],
      ["API overview", "#developers"],
      ["Ecosystem", "#ecosystem"],
    ],
  },
] as const;

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function WorkspaceLink({ className, children }: { className: string; children: React.ReactNode }) {
  return <Link className={className} href="/?demo=1" prefetch={false}>{children}</Link>;
}

export function SnitchFooter() {
  return <footer className="snitch-company-footer" aria-label="Snitch company footer">
    <div className="snitch-company-footer__atmosphere" aria-hidden="true" />
    <div className="snitch-company-footer__wordmark" aria-hidden="true">Snitch</div>
    <div className="snitch-company-footer__inner">
      <div className="snitch-company-footer__main">
        <div className="snitch-company-footer__identity">
          <button className="snitch-company-footer__brand" type="button" onClick={scrollToTop} aria-label="Snitch, back to top"><Image src="/snitch-logo.png" alt="" width={40} height={40} /><span>Snitch</span></button>
          <p>Company treasury and payments,<br />managed by your team.</p>
          <WorkspaceLink className="snitch-company-footer__workspace">Open workspace <span><ArrowRight size={17} aria-hidden="true" /></span></WorkspaceLink>
        </div>

        <nav className="snitch-company-footer__navigation" aria-label="Footer navigation">
          {footerGroups.map(group => <div key={group.title} id={group.id} className="snitch-company-footer__group">
            <h3>{group.title}</h3>
            <ul>{group.links.map(([text, href]) => <li key={text}><a href={href}>{text}</a></li>)}
            </ul>
          </div>)}
        </nav>
      </div>

      <div className="snitch-company-footer__bottom"><p>© {new Date().getFullYear()} Snitch. All rights reserved.</p><button type="button" onClick={scrollToTop}>Back to top <span><ArrowUp size={15} aria-hidden="true" /></span></button></div>
    </div>
  </footer>;
}
