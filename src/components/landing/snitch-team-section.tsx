"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowRight, Check, Eye, FileText, Minus, ShieldCheck, Wallet } from "lucide-react";
import "./snitch-team-section.css";

const companyRoles = [
  { name: "Owner", initials: "OW", label: "Company oversight", permissions: [true, true, true], description: "Full oversight of the treasury, from reviewing company activity to approving payments." },
  { name: "Finance", initials: "FI", label: "Review & approve", permissions: [true, true, true], description: "Prepare payment requests, review the records, and approve funds to move." },
  { name: "Operations", initials: "OP", label: "Prepare & track", permissions: [true, true, false], description: "Prepare payments and follow their progress. Approval stays with Owner or Finance." },
];
const capabilities = [
  { label: "View activity", icon: Eye },
  { label: "Prepare payments", icon: FileText },
  { label: "Approve payments", icon: ShieldCheck },
];

export function TeamAccess() {
  const [selectedRole, setSelectedRole] = useState(2);
  const id = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectRoleWithKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % companyRoles.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + companyRoles.length - 1) % companyRoles.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = companyRoles.length - 1;
    else return;
    event.preventDefault();
    setSelectedRole(next);
    tabs.current[next]?.focus();
  }

  return (
    <section id="team-access" className="snitch-team-section" aria-labelledby="team-heading">
      <div className="snitch-team-section__inner">
        <header className="snitch-team-section__intro">
          <span className="snitch-eyebrow">Company treasury & team access</span>
          <h2 id="team-heading">Company funds. Defined authority.</h2>
          <p>Designed around a dedicated Privy wallet for each company.<br className="snitch-team-section__break" /> A shared treasury, with a clear role for the people behind it.</p>
        </header>

        <div className="snitch-authority-map" role="group" aria-label="Interactive example of company wallet permissions">
          <div className="snitch-authority-map__canvas">
            <div className="snitch-authority-map__grid" aria-hidden="true" />
            <div className="snitch-authority-map__orbit" aria-hidden="true" />
            <span className="snitch-authority-map__annotation" aria-hidden="true">One company / one treasury</span>
            <span className="snitch-authority-map__example">Illustrative setup</span>
            <svg className="snitch-authority-map__connections" viewBox="0 0 1120 334" preserveAspectRatio="none" aria-hidden="true">
              <path className={selectedRole === 0 ? "is-active" : ""} d="M269 122H375" />
              <path className={selectedRole === 1 ? "is-active" : ""} d="M745 122H851" />
              <path className={selectedRole === 2 ? "is-active" : ""} d="M560 193V224" />
              <circle cx="269" cy="122" r="3" /><circle cx="851" cy="122" r="3" /><circle cx="560" cy="224" r="3" />
            </svg>

            <div className="snitch-authority-map__wallet">
              <div className="snitch-authority-map__identity"><span className="snitch-authority-map__wallet-icon"><Wallet size={23} aria-hidden="true" /></span><div><span>Snitchpay.co</span><strong>Company treasury</strong></div><ShieldCheck size={19} aria-hidden="true" /></div>
              <div className="snitch-authority-map__provider"><span>Dedicated company wallet</span><Image src="/brands/privy.svg" alt="Privy wallet infrastructure" width={66} height={15} /></div>
            </div>

            <div role="tablist" aria-label="Explore team roles" className="snitch-authority-map__roles">
              {companyRoles.map((role, index) => <button key={role.name} type="button" role="tab" aria-label={role.name} id={`${id}-role-${index}`} aria-controls={`${id}-permissions-${index}`} aria-selected={selectedRole === index} tabIndex={selectedRole === index ? 0 : -1} ref={node => { tabs.current[index] = node; }} onClick={() => setSelectedRole(index)} onKeyDown={event => selectRoleWithKey(event, index)} className={`snitch-authority-map__role snitch-authority-map__role--${index}`}>
                <span className="snitch-authority-map__avatar" aria-hidden="true">{role.initials}</span>
                <span className="snitch-authority-map__role-copy"><strong>{role.name}</strong><span>{role.label}</span></span>
                <span className="snitch-authority-map__selected" aria-hidden="true">{selectedRole === index ? <Check size={12} /> : <ArrowRight size={12} />}</span>
              </button>)}
            </div>
          </div>

          <div className="snitch-authority-map__inspector">
            {companyRoles.map((role, index) => <div key={role.name} role="tabpanel" id={`${id}-permissions-${index}`} aria-labelledby={`${id}-role-${index}`} aria-hidden={selectedRole !== index} inert={selectedRole !== index} className="snitch-authority-map__panel" tabIndex={selectedRole === index ? 0 : -1}>
              <div className="snitch-authority-map__role-description"><span>Selected role / {role.name}</span><p>{role.description}</p></div>
              <div className="snitch-authority-map__capabilities">{capabilities.map(({ label, icon: Icon }, capability) => <div key={label} data-allowed={role.permissions[capability]}><Icon size={19} aria-hidden="true" /><span>{label}</span><small>{role.permissions[capability] ? <><Check size={12} aria-hidden="true" />Allowed</> : <><Minus size={12} aria-hidden="true" />Not allowed</>}</small></div>)}</div>
            </div>)}
          </div>
          <div className="snitch-authority-map__foot"><p>Select a role to explore its access.</p><Link href="/?demo=1" prefetch={false} onNavigate={event => { event.preventDefault(); window.location.assign("/?demo=1"); }}>Explore company wallets <ArrowRight size={16} aria-hidden="true" /></Link></div>
        </div>
      </div>
    </section>
  );
}
