import Image from 'next/image';

const workspaceImageHref = '/images/snitch-workspace.png';

export function PlatformShowcase() {
  return (
    <section id="platform" className="snitch-section snitch-platform" aria-labelledby="platform-heading">
      <div className="snitch-section-heading">
        <span className="snitch-eyebrow">The Snitch workspace</span>
        <h2 id="platform-heading" className="h3-serif-v2">Payments, invoices, and wallets.<br className="snitch-desktop-break" /> One company view.</h2>
      </div>
      <figure className="snitch-product-figure">
        <a href={workspaceImageHref} target="_blank" rel="noreferrer" className="snitch-product-frame" aria-label="View the full Snitch workspace image (opens in a new tab)">
          <span className="snitch-product-viewport">
            <Image src={workspaceImageHref} alt="Snitch transaction workspace showing payments, customers, settlement status, and invoice numbers, with shared account navigation." width={2290} height={1502} sizes="(max-width: 743px) calc(100vw - 56px), (max-width: 1127px) calc(100vw - 72px), 1056px" className="snitch-product-image" />
          </span>
        </a>
      </figure>
    </section>
  );
}
