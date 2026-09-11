"use client";

import { useState } from 'react';
import { AnimatedSection } from './animated-sections';
import { LandingNavigation } from './landing-navigation';
import { snitchHeroMarkup, snitchCtaMarkup } from './snitch-hero-markup';
import { SnitchWorkflows } from './snitch-workflows';
import { SnitchSearch } from './snitch-search';
import { SnitchBrandStrip } from './snitch-brand-strip';
import { SnitchFooter } from './snitch-footer';
import { PlatformShowcase } from './snitch-platform-sections';
import { DeveloperSection } from './snitch-developer-section';
import { TeamAccess } from './snitch-team-section';
import './reference-theme.css';
import './landing.css';
import './snitch-editorial.css';

export function SnitchLandingPage() {
  const [searchOpen, setSearchOpen] = useState(false);

  return <>
    <LandingNavigation onOpenDialog={() => setSearchOpen(true)} />
    <div className="dune-clone lightMode snitch-landing">
      <main className="marketing-page">
        <AnimatedSection html={snitchHeroMarkup} kind="hero" />
        <SnitchBrandStrip />
        <PlatformShowcase />
        <SnitchWorkflows />
        <TeamAccess />
        <DeveloperSection />
        <AnimatedSection html={snitchCtaMarkup} kind="cta" />
      </main>
      <SnitchFooter />
      {searchOpen && <SnitchSearch onClose={() => setSearchOpen(false)} />}
    </div>
  </>;
}
