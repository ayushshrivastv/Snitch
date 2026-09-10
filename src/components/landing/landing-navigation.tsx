"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { FloatingNav, type FloatingNavItem } from '@/components/ui/floating-navbar';
import type { OpenDialog } from './types';
import './landing-navigation.css';

const navItems: FloatingNavItem[] = [
  { name: 'Solution', link: '#solutions' },
  { name: 'Developers', link: '#developers' },
  { name: 'Resources', link: '#resources' },
];

export function LandingNavigation({ onOpenDialog }: { onOpenDialog: OpenDialog }) {
  const [onLightSection, setOnLightSection] = useState(false);

  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.snitch-landing-nav');
    const surface = header?.querySelector<HTMLElement>('[data-slot="floating-nav-surface"]');
    if (!header || !surface) return;
    const gradientSections = ['home-hero'].map(id => document.getElementById(id));
    let frame = 0;

    const updateSurface = () => {
      frame = 0;
      // Ignore the hide/reveal transform when finding the section behind the header.
      const headerCenter = parseFloat(getComputedStyle(header).top) + surface.offsetHeight / 2;
      const overGradient = gradientSections.some(section => {
        const bounds = section?.getBoundingClientRect();
        return bounds && bounds.top <= headerCenter && bounds.bottom >= headerCenter;
      });
      setOnLightSection(!overGradient);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(updateSurface);
    };
    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    const main = document.querySelector('.dune-clone main');
    if (main) resizeObserver.observe(main);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, []);

  return (
    <FloatingNav
      className={`snitch-landing-nav${onLightSection ? ' snitch-landing-nav-light' : ''}`}
      navItems={navItems}
      brand={
        <Link href="/" aria-label="Snitch home" className="snitch-landing-nav-brand flex items-center gap-2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4">
          <Image src="/snitch-logo.png" alt="" width={32} height={32} priority className="size-8 object-contain" />
          <span className="text-lg font-semibold tracking-tight">Snitch</span>
        </Link>
      }
      actions={
        <button type="button" aria-label="Open global search" onClick={() => onOpenDialog('search')}
          className="snitch-landing-nav-search flex size-10 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2">
          <Search className="size-[18px]" aria-hidden="true" />
        </button>
      }
    />
  );
}
