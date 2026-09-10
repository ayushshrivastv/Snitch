"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Code2, Copy, FileCode2 } from "lucide-react";
import "./snitch-developer-section.css";

const invoiceExample = {
  label: "Create invoice",
  method: "POST",
  endpoint: "/api/invoices",
  filename: "create-invoice.ts",
  code: [
    'import { getAccessToken } from "@privy-io/react-auth";',
    "",
    'const response = await fetch("/api/invoices", {',
    '  method: "POST",',
    '  headers: { "Content-Type": "application/json",',
    '    Authorization: `Bearer ${await getAccessToken()}` },',
    "  body: JSON.stringify({",
    '    companyId: "YOUR_COMPANY_ID",',
    '    invoiceAmount: "0.01",',
    '    currency: "ETH",',
    '    network: "Ethereum Sepolia",',
    "  }),",
    "});",
    "",
    "const { invoiceId } = await response.json();",
  ],
} as const;

function HighlightedLine({ line }: { line: string }) {
  return line.split(/("(?:[^"\\]|\\.)*"|`[^`]*`|\b(?:const|await|true|false|null)\b)/g).map((part, index) => {
    const token = part.startsWith('"') || part.startsWith("`") ? "string" : /^(const|await|true|false|null)$/.test(part) ? "keyword" : "plain";
    return <span key={index} className={`snitch-developer__token-${token}`}>{part}</span>;
  });
}

export function DeveloperSection() {
  const id = useId();
  const [copyMessage, setCopyMessage] = useState("");
  const copyRequest = useRef(0);

  const copyExample = async () => {
    const request = ++copyRequest.current;
    try {
      await navigator.clipboard.writeText(invoiceExample.code.join("\n"));
      if (request === copyRequest.current) setCopyMessage("Code copied");
    } catch {
      if (request === copyRequest.current) setCopyMessage("Select the code to copy it");
    }
  };

  return (
    <section id="developers" className="snitch-developer" aria-labelledby={`${id}-heading`}>
      <div className="snitch-developer__inner">
        <div className="snitch-developer__heading">
          <span className="snitch-developer__eyebrow"><Code2 size={13} aria-hidden="true" />For developers</span>
          <h2 id={`${id}-heading`}>Your workflow.<br />One payment reference.</h2>
          <p>Create an invoice with the company wallet context already attached. The returned reference connects the request to its payment record.</p>
          <Link className="snitch-developer__link" href="/?demo=1" prefetch={false}>Explore the workspace <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>

        <div className="snitch-developer__editor" aria-label="Create invoice API example">
          <div className="snitch-developer__editor-bar">
            <span><FileCode2 size={14} aria-hidden="true" />{invoiceExample.filename}</span>
            <button type="button" className="snitch-developer__copy-button" aria-label="Copy create invoice example" onClick={() => void copyExample()}>{copyMessage === "Code copied" ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}<span>{copyMessage === "Code copied" ? "Copied" : "Copy"}</span></button>
          </div>
          <div className="snitch-developer__endpoint"><span>{invoiceExample.method}</span><code>{invoiceExample.endpoint}</code><span>Request</span></div>
          <pre className="snitch-developer__code"><code>{invoiceExample.code.map((line, lineIndex) => <span className="snitch-developer__line" key={lineIndex}><span className="snitch-developer__line-number" aria-hidden="true">{lineIndex + 1}</span><span><HighlightedLine line={line} /></span>{"\n"}</span>)}</code></pre>
          <span className="snitch-developer__sr-only" role="status">{copyMessage}</span>
        </div>
      </div>
    </section>
  );
}
