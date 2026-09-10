"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import "./snitch-search.css";

const destinations = [
  { title: "Platform", description: "See payments, customers, and invoices together.", href: "#platform" },
  { title: "Treasury", description: "Keep company balances and outgoing funds in view.", href: "#workflow-treasury" },
  { title: "Payments", description: "Collect customer payments and track invoices.", href: "#workflow-payments" },
  { title: "Payroll", description: "Organize payments to your team.", href: "#workflow-payroll" },
  { title: "Vendor payouts", description: "Prepare supplier payments and track their status.", href: "#workflow-vendors" },
  { title: "Company wallets", description: "Explore the dedicated treasury wallet and team access.", href: "#team-access" },
  { title: "Roles & permissions", description: "Define who can view, prepare, and approve payments.", href: "#team-access" },
  { title: "Developers", description: "See how integrations fit your business workflows.", href: "#developers" },
  { title: "Resources", description: "Browse platform, developer, and workspace links.", href: "#resources" },
  { title: "Workspace", description: "Open the Snitch demo workspace.", href: "/?demo=1" },
];

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SnitchSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);
  const onCloseRef = useRef(onClose);
  const id = useId();
  const search = query.trim().toLocaleLowerCase();
  const results = destinations.filter(({ title, description }) =>
    `${title} ${description}`.toLocaleLowerCase().includes(search),
  );

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus({ preventScroll: true });

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(element => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      const outside = !dialog.contains(document.activeElement);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeydown, true);
    return () => {
      document.removeEventListener("keydown", handleKeydown, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const openFirstResult = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resultsRef.current?.querySelector<HTMLAnchorElement>("a[href]")?.click();
  };

  return (
    <div className="snitch-search-overlay" onPointerDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1} className="snitch-search">
        <header className="snitch-search__heading">
          <h2 id={`${id}-title`}>Search Snitch</h2>
          <button type="button" onClick={onClose} className="snitch-search__close" aria-label="Close search">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <form role="search" aria-label="Search Snitch sections" className="snitch-search__form" onSubmit={openFirstResult}>
          <label htmlFor={`${id}-input`} className="snitch-search__input-label">Search the platform</label>
          <div className="snitch-search__input-wrap">
            <Search size={19} aria-hidden="true" />
            <input ref={inputRef} id={`${id}-input`} type="search" value={query} onChange={event => setQuery(event.target.value)}
              placeholder="Payments, wallets, developers…" autoComplete="off" spellCheck={false}
              aria-controls={`${id}-results`} aria-describedby={`${id}-hint`} />
          </div>
        </form>
        <div className="snitch-search__results-heading" aria-hidden="true">
          <span>{search ? "Results" : "Explore Snitch"}</span>
          <span>{results.length}</span>
        </div>
        <p className="snitch-search__status" role="status" aria-live="polite">
          {results.length} {results.length === 1 ? "result" : "results"}{search ? ` for ${query.trim()}` : " available"}.
        </p>
        <ul ref={resultsRef} id={`${id}-results`} className="snitch-search__results" aria-label="Search results">
          {results.map(result => (
            <li key={result.title}>
              <a href={result.href} onClick={onClose} className="snitch-search__result">
                <span className="snitch-search__result-copy">
                  <span className="snitch-search__result-title">{result.title}</span>
                  <span className="snitch-search__result-description">{result.description}</span>
                </span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </li>
          ))}
          {results.length === 0 && <li className="snitch-search__empty">
            <p>No matching sections.</p>
            <span>Try “payments”, “wallets”, or “developers”.</span>
          </li>}
        </ul>
        <footer id={`${id}-hint`} className="snitch-search__footer">
          <span>Enter opens the first result</span>
          <span><kbd>Esc</kbd> to close</span>
        </footer>
      </div>
    </div>
  );
}
