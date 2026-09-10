import Image from 'next/image';
import './snitch-brand-strip.css';

const brands = [
  { name: 'Privy', slug: 'privy', href: 'https://www.privy.io/' },
  { name: 'The Graph', slug: 'the-graph', href: 'https://thegraph.com/' },
  { name: 'Visa', slug: 'visa', href: 'https://www.visa.com/' },
  { name: 'Coinbase', slug: 'coinbase', href: 'https://www.coinbase.com/' },
  { name: 'Blockchain.com', slug: 'blockchain', href: 'https://www.blockchain.com/' },
];

export function SnitchBrandStrip() {
  return (
    <div id="ecosystem" className="snitch-brand-strip" aria-label="Across the onchain ecosystem">
      <ul className="snitch-brand-grid">
        {brands.map(brand => (
          <li key={brand.slug}>
            <a href={brand.href} target="_blank" rel="noreferrer" className={`snitch-brand-cell snitch-brand-cell--${brand.slug}`} aria-label={`Visit ${brand.name}`}>
              <Image src={`/brands/${brand.slug}.svg`} alt={brand.name} width={200} height={100} className="snitch-brand-logo" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
