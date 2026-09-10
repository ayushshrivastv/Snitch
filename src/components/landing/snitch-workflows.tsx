"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckCheck, FileText, Layers3, Users, Wallet } from "lucide-react";
import "./snitch-workflows.css";

const workflowHashes = ["#workflow-treasury", "#workflow-payments", "#workflow-payroll", "#workflow-vendors"];
const workflows = [
  { name: "Treasury", heading: null, description: null, stages: [["The company funds", "One dedicated treasury wallet for the company."], ["The allocations", "Separate purposes within the same treasury."], ["The team access", "Owners, finance, and operations share the workflow."]] },
  { name: "Payments", heading: "An invoice becomes a payment record.", description: "Keep the receiving wallet and invoice reference attached to the payment, so your team can trace the receipt back to its request.", stages: [["The request", "Start with the amount and receiving details."], ["The company treasury", "Receive into the wallet that belongs to the company."], ["The record", "Keep the receipt attached to the original invoice."]] },
  { name: "Payroll", heading: "A team list becomes a reviewed pay run.", description: "Review receivers, individual amounts, and the company funding wallet together before a pay run becomes a payout record.", stages: [["The receivers", "Keep each team member’s amount and wallet together."], ["The pay run", "Review the total against the company treasury."], ["The review", "Give preparation and review a clear handoff."]] },
  { name: "Vendor payouts", heading: "Every payable keeps its context.", description: "Follow supplier invoices from draft through review to the payout record, with the original reference attached at each handoff.", stages: [["The invoice queue", "See the supplier, reference, and amount due."], ["The review", "Review one payable with its funding context."], ["The payout record", "Retain the supplier reference with the payment."]] },
] as const;

function Artifact({ children, variant = "" }: { children: ReactNode; variant?: string }) {
  return <div className={`snitch-workflows__artifact ${variant ? `snitch-workflows__artifact--${variant}` : ""}`}>{children}</div>;
}

function Amount({ value, label }: { value: string; label?: string }) {
  return <div className="snitch-workflows__amount">{label && <span className="snitch-workflows__amount-label">{label}</span>}<strong>{value}<small>USD</small></strong></div>;
}

function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "purple" | "green" }) {
  return <span className={`snitch-workflows__status snitch-workflows__status--${tone}`}>{children}</span>;
}

function ArtifactHeading({ title, reference, icon: Icon = FileText }: { title: string; reference: string; icon?: typeof FileText }) {
  return <div className="snitch-workflows__artifact-heading"><span><Icon size={14} aria-hidden="true" />{title}</span><small>{reference}</small></div>;
}

function DetailRows({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return <dl className="snitch-workflows__details">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function InvoiceArtifact() {
  return <Artifact variant="invoice"><ArtifactHeading title="Invoice" reference="INV-024" /><Amount value="2,400.00" label="Payment requested" /><DetailRows rows={[["For", "Design services · June"], ["To", "Company treasury"], ["Reference", "INV-024"]]} /><div className="snitch-workflows__artifact-foot"><span>JUN 16</span><Status>Invoice issued</Status></div></Artifact>;
}

function TreasuryHandoff({ payroll = false }: { payroll?: boolean }) {
  return <Artifact variant="handoff"><span className="snitch-workflows__wallet-orbit"><Wallet size={27} strokeWidth={1.3} aria-hidden="true" /></span><p className="snitch-workflows__handoff-label">Company treasury</p><Amount value={payroll ? "8,400.00" : "2,400.00"} label={payroll ? "Pay run total" : "Payment received"} /><Status tone={payroll ? "purple" : "green"}>{payroll ? <Users size={11} aria-hidden="true" /> : <Check size={11} aria-hidden="true" />}{payroll ? "3 receivers · PAY-006" : "Linked to INV-024"}</Status><div className="snitch-workflows__handoff-meta"><div><span>{payroll ? "Receivers" : "Invoice"}</span><strong>{payroll ? "3 approved" : "INV-024"}</strong></div><div><span>Funding wallet</span><strong>Company treasury</strong></div></div></Artifact>;
}

function ReceiptArtifact({ vendor = false }: { vendor?: boolean }) {
  return <Artifact variant="receipt"><div className="snitch-workflows__receipt-heading"><CheckCheck size={19} aria-hidden="true" /><span>{vendor ? "Payout recorded" : "Payment receipt"}</span><small>{vendor ? "REC-025" : "REC-024"}</small></div><Amount value={vendor ? "1,200.00" : "2,400.00"} /><DetailRows rows={[["Invoice", vendor ? "INV-025" : "INV-024"], [vendor ? "Supplier" : "Description", vendor ? "Infrastructure" : "Design services"], ["Recorded", "Jun 16 · 10:28"]]} /><div className="snitch-workflows__receipt-footer"><Check size={12} aria-hidden="true" />Original reference retained</div><div className="snitch-workflows__receipt-perforation" aria-hidden="true" /></Artifact>;
}

function ReceiversArtifact() {
  return <Artifact variant="receivers"><ArtifactHeading title="Team receivers" reference="JUNE" icon={Users} /><div className="snitch-workflows__receiver-list">{[["AM", "Alex M.", "Design", "2,800"], ["JK", "Jordan K.", "Engineering", "3,200"], ["LN", "Lee N.", "Operations", "2,400"]].map(([initials, name, role, amount]) => <div key={initials}><span className="snitch-workflows__avatar">{initials}</span><span><strong>{name}</strong><small>{role}</small></span><span className="snitch-workflows__receiver-amount">{amount}<small>USD</small></span><Check size={12} aria-label="Wallet details attached" /></div>)}</div><div className="snitch-workflows__artifact-foot"><span>Receiver details attached</span><span>3 / 3</span></div></Artifact>;
}

function PayrollReviewArtifact() {
  return <Artifact variant="review"><ArtifactHeading title="Payroll review" reference="PAY-006" /><div className="snitch-workflows__review-title"><h5>June pay run</h5><Status tone="purple">In review</Status></div><DetailRows rows={[["Company wallet", "Treasury"], ["Receivers", "3 team members"], ["Pay run total", "8,400.00 USD"]]} /><div className="snitch-workflows__review-rail"><div><span className="snitch-workflows__review-dot snitch-workflows__review-dot--done"><Check size={10} aria-hidden="true" /></span><span><strong>Prepared</strong><small>Operations</small></span></div><ArrowRight size={16} aria-hidden="true" /><div><span className="snitch-workflows__review-dot" /><span><strong>Review</strong><small>Finance</small></span></div></div></Artifact>;
}

function VendorQueueArtifact() {
  return <Artifact variant="queue"><ArtifactHeading title="Supplier invoices" reference="3 RECORDS" /><div className="snitch-workflows__vendor-list">{[["Design partner", "INV-024", "2,400", "Recorded"], ["Infrastructure", "INV-025", "1,200", "Review"], ["Legal services", "INV-026", "800", "Draft"]].map(([name, reference, amount, status]) => <div key={reference}><span><strong>{name}</strong><small>{reference}</small></span><span className="snitch-workflows__receiver-amount">{amount}<small>USD</small></span><Status tone={status === "Review" ? "purple" : status === "Recorded" ? "green" : "neutral"}>{status}</Status></div>)}</div><div className="snitch-workflows__artifact-foot"><span>Open payables</span><strong>2,000.00 USD</strong></div></Artifact>;
}

function VendorReviewArtifact() {
  return <Artifact variant="payable"><span className="snitch-workflows__document-icon"><FileText size={25} strokeWidth={1.25} aria-hidden="true" /></span><span className="snitch-workflows__small-reference">PAYABLE · INV-025</span><h5>Infrastructure</h5><Amount value="1,200.00" /><Status tone="purple">Awaiting review</Status><div className="snitch-workflows__payable-meta"><div><span>Supplier</span><strong>Infrastructure</strong></div><div><span>Funding wallet</span><strong>Company treasury</strong></div></div></Artifact>;
}

function CompanyFundsArtifact() {
  return <Artifact variant="funds"><ArtifactHeading title="Company treasury" reference="USD" icon={Wallet} /><div className="snitch-workflows__funds-identity"><span className="snitch-workflows__avatar">SC</span><div><strong>Company account</strong><small>Dedicated treasury wallet</small></div></div><Amount value="45,200.00" label="Illustrative balance" /><div className="snitch-workflows__funds-rule" /><div className="snitch-workflows__artifact-foot"><span>Wallet scope</span><strong>Company owned</strong></div></Artifact>;
}

function AllocationArtifact() {
  return <Artifact variant="allocation"><div className="snitch-workflows__allocation-ring" role="img" aria-label="Fund allocations: operating 24,800 USD, payroll 8,400 USD, reserve 12,000 USD"><span><Layers3 size={19} strokeWidth={1.4} aria-hidden="true" /><strong>Fund allocation</strong><small>One treasury</small></span></div><div className="snitch-workflows__allocation-legend">{[["Operating", "24,800"], ["Payroll", "8,400"], ["Reserve", "12,000"]].map(([name, value]) => <div key={name}><span><i aria-hidden="true" />{name}</span><strong>{value}</strong></div>)}</div></Artifact>;
}

function TreasuryAccessArtifact() {
  return <Artifact variant="access"><ArtifactHeading title="Company access" reference="3 ROLES" icon={Users} /><h5>The team behind the treasury.</h5><div className="snitch-workflows__access-list">{[["AS", "Owner", "Company oversight"], ["JK", "Finance", "Payment review"], ["LN", "Operations", "Payment preparation"]].map(([initials, role, scope]) => <div key={role}><span className="snitch-workflows__avatar">{initials}</span><span><strong>{role}</strong><small>{scope}</small></span><span className="snitch-workflows__access-mark"><Check size={11} aria-hidden="true" /></span></div>)}</div></Artifact>;
}

function journeyArtifacts(workflow: number) {
  if (workflow === 0) return [<CompanyFundsArtifact key="funds" />, <AllocationArtifact key="allocations" />, <TreasuryAccessArtifact key="access" />];
  if (workflow === 1) return [<InvoiceArtifact key="invoice" />, <TreasuryHandoff key="handoff" />, <ReceiptArtifact key="receipt" />];
  if (workflow === 2) return [<ReceiversArtifact key="receivers" />, <TreasuryHandoff key="payroll" payroll />, <PayrollReviewArtifact key="review" />];
  return [<VendorQueueArtifact key="queue" />, <VendorReviewArtifact key="review" />, <ReceiptArtifact key="record" vendor />];
}

export function SnitchWorkflows() {
  const id = useId();
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    let frame = 0;
    const selectFromHash = () => {
      const index = workflowHashes.indexOf(window.location.hash);
      if (index < 0) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { setActive(index); section.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); });
    };
    selectFromHash(); window.addEventListener("hashchange", selectFromHash);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", selectFromHash); };
  }, []);
  const selectWorkflow = (index: number) => {
    setActive(index);
    const url = new URL(window.location.href); url.hash = workflowHashes[index];
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % workflows.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + workflows.length - 1) % workflows.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = workflows.length - 1;
    else return;
    event.preventDefault(); selectWorkflow(next); tabs.current[next]?.focus();
  };
  return <section ref={section} id="solutions" className="snitch-workflows" aria-labelledby={`${id}-heading`}>
    {workflowHashes.map(hash => <span key={hash} id={hash.slice(1)} className="snitch-workflows__hash-anchor" aria-hidden="true" />)}
    <div className="snitch-workflows__intro"><span className="snitch-workflows__eyebrow">Financial operations</span><h2 id={`${id}-heading`} className="h3-serif-v2">Your payment operations,<br />from invoice to treasury.</h2></div>
    <div role="tablist" aria-label="Financial workflows" className="snitch-workflows__tabs">{workflows.map((workflow, index) => <button type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={active === index} tabIndex={active === index ? 0 : -1} ref={node => { tabs.current[index] = node; }} key={workflow.name} onClick={() => selectWorkflow(index)} onKeyDown={event => handleKey(event, index)}>{workflow.name}</button>)}</div>
    <div className={`snitch-workflows__panels${active === 0 ? " snitch-workflows__panels--treasury" : ""}`}>{workflows.map((workflow, index) => {
      const artifacts = journeyArtifacts(index);
      return <div key={workflow.name} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} aria-hidden={active !== index} inert={active !== index} className="snitch-workflows__panel" tabIndex={active === index ? 0 : -1}>
        {workflow.heading && <div className="snitch-workflows__editorial-rail"><div><h3>{workflow.heading}</h3><p>{workflow.description}</p></div><Link href="/?demo=1" prefetch={false}>View workspace <ArrowRight size={16} aria-hidden="true" /></Link></div>}
        <div className={`snitch-workflows__panorama snitch-workflows__panorama--${index}`} role="group" aria-label={`${workflow.name} illustrative workspace journey`}><div className="snitch-workflows__journey">{workflow.stages.map(([title, caption], stage) => <article key={title} className={`snitch-workflows__stage snitch-workflows__stage--${stage}`} aria-labelledby={`${id}-stage-${index}-${stage}`}><h4 id={`${id}-stage-${index}-${stage}`}>{title}</h4><div className="snitch-workflows__artifact-slot">{artifacts[stage]}</div><p className="snitch-workflows__stage-caption">{caption}</p></article>)}</div></div>
      </div>;
    })}</div>
  </section>;
}
