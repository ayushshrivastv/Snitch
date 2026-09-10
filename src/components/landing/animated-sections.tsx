'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import { animateDuneGradient } from './gradient-animation';

const PHRASES = ['onchain payments', 'global payroll', 'vendor payouts', 'shared treasury'];
const PHRASE_CLASS = 'HeroRotatingHeadline-module__wv_VSW__phrase';
const ENTER_CLASS = 'HeroRotatingHeadline-module__wv_VSW__phraseEntering';
const EXIT_CLASS = 'HeroRotatingHeadline-module__wv_VSW__phraseExiting';

function animateHeadline(root: HTMLElement) {
  const headline = root.querySelector('h1');
  const phrase = root.querySelector<HTMLElement>(`.${PHRASE_CLASS}`);
  if (!headline || !phrase) return () => {};
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let interval = 0;
  let phase: 'visible' | 'exiting' | 'entering' = 'visible';
  let visible = true;
  let fallbackTimer = 0;

  function updateWords() {
    if (!headline || !phrase) return;
    const word = PHRASES[index];
    const [mobile, desktop] = Array.from(phrase.children);
    if (mobile) mobile.textContent = word;
    if (desktop) desktop.textContent = word;
    headline.setAttribute('aria-label', `The operating layer for ${word}`);
  }
  function clearPhase() {
    phase = 'visible';
    phrase?.classList.remove(ENTER_CLASS, EXIT_CLASS);
    window.clearTimeout(fallbackTimer);
  }
  function advancePhase() {
    if (!phrase) return;
    window.clearTimeout(fallbackTimer);
    if (phase === 'exiting') {
      index = (index + 1) % PHRASES.length;
      updateWords();
      phase = 'entering';
      phrase.classList.remove(EXIT_CLASS);
      phrase.classList.add(ENTER_CLASS);
      fallbackTimer = window.setTimeout(advancePhase, 460);
    } else if (phase === 'entering') clearPhase();
  }
  function tick() {
    if (!visible || !phrase || phase !== 'visible' || motion.matches) return;
    phase = 'exiting';
    phrase.classList.add(EXIT_CLASS);
    fallbackTimer = window.setTimeout(advancePhase, 360);
  }
  function restart() {
    clearPhase();
    window.clearInterval(interval);
    if (visible && !motion.matches) interval = window.setInterval(tick, 3000);
  }
  clearPhase();
  updateWords();
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    restart();
  });
  observer.observe(root.firstElementChild ?? root);
  phrase.addEventListener('animationend', advancePhase);
  motion.addEventListener('change', restart);
  restart();
  return () => {
    observer.disconnect();
    clearPhase();
    window.clearInterval(interval);
    phrase.removeEventListener('animationend', advancePhase);
    motion.removeEventListener('change', restart);
  };
}

function animateHeroParallax(root: HTMLElement) {
  const section = root.querySelector<HTMLElement>('#home-hero');
  const content = section?.querySelector<HTMLElement>('.will-change-transform');
  const canvas = section?.querySelector('canvas');
  const gradientWrapper = canvas?.parentElement;
  if (!section) return () => {};
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = window.matchMedia('(min-width: 744px)');
  let frame = 0;
  function update() {
    frame = 0;
    if (!section) return;
    const bounds = section.getBoundingClientRect();
    if (content) content.style.transform = desktop.matches && !motion.matches
      ? `translate3d(0, ${Math.max(0, -bounds.top) * 0.16}px, 0)` : '';
    if (gradientWrapper && gradientWrapper !== section) {
      gradientWrapper.style.width = desktop.matches ? '' : '132%';
      gradientWrapper.style.left = desktop.matches ? '' : '50%';
      gradientWrapper.style.right = desktop.matches ? '' : 'auto';
      gradientWrapper.style.transform = desktop.matches ? '' : 'translateX(-50%)';
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  desktop.addEventListener('change', schedule);
  motion.addEventListener('change', schedule);
  update();
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    desktop.removeEventListener('change', schedule);
    motion.removeEventListener('change', schedule);
  };
}

function animateTestimonials(root: HTMLElement) {
  const firstQuote = root.querySelector('h3');
  const slide = firstQuote?.closest<HTMLElement>('.basis-full');
  const track = slide?.parentElement;
  const viewport = track?.parentElement;
  const region = viewport?.parentElement;
  if (!track || !viewport || !region) return () => {};
  const slides = Array.from(track.children) as HTMLElement[];
  const buttons = Array.from(region.querySelectorAll<HTMLButtonElement>('button'));
  if (buttons.length < 2 || slides.length < 2) return () => {};
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = window.matchMedia('(min-width: 1280px)');
  let index = 0;
  let busy = false;
  let transitionTimer = 0;
  let startX: number | null = null;
  let dragX = 0;
  buttons[0].setAttribute('aria-label', 'Previous testimonial');
  buttons[1].setAttribute('aria-label', 'Next testimonial');
  region.setAttribute('aria-roledescription', 'carousel');
  region.setAttribute('aria-label', 'Customer testimonials');
  viewport.style.touchAction = 'pan-y';

  function synchronize() {
    if (!track) return;
    track.style.transition = 'none';
    track.style.transform = `translate3d(${-index * 100}%, 0, 0)`;
    slides.forEach((item, position) => {
      item.style.transform = '';
      item.setAttribute('aria-hidden', String(position !== index));
    });
    busy = false;
    buttons.forEach((button) => {
      button.classList.toggle('size-56', desktop.matches);
      button.classList.toggle('[&>svg]:size-16', desktop.matches);
      button.classList.toggle('size-22', !desktop.matches);
      button.classList.toggle('[&>svg]:size-12', !desktop.matches);
    });
  }
  function go(direction: number) {
    if (!track || busy) return;
    busy = true;
    const destination = index + direction;
    if (destination < 0) slides.at(-1)!.style.transform = `translateX(${-slides.length * 100}%)`;
    if (destination >= slides.length) slides[0].style.transform = `translateX(${slides.length * 100}%)`;
    track.style.transition = motion.matches ? 'none' : 'transform 500ms cubic-bezier(0.22, 1, 0.36, 1)';
    track.style.transform = `translate3d(${-destination * 100}%, 0, 0)`;
    index = (destination + slides.length) % slides.length;
    window.clearTimeout(transitionTimer);
    if (motion.matches) synchronize();
    else transitionTimer = window.setTimeout(synchronize, 520);
  }
  const previous = () => go(-1);
  const next = () => go(1);
  function key(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      go(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }
  function pointerDown(event: PointerEvent) {
    if (busy || event.button !== 0 || !viewport) return;
    startX = event.clientX;
    dragX = 0;
    viewport.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent) {
    if (startX === null || !track) return;
    dragX = event.clientX - startX;
    // Prepare either neighbor so the first and last quotes loop during a swipe.
    if (index === 0 && dragX > 0) slides.at(-1)!.style.transform = `translateX(${-slides.length * 100}%)`;
    if (index === slides.length - 1 && dragX < 0) slides[0].style.transform = `translateX(${slides.length * 100}%)`;
    track.style.transition = 'none';
    track.style.transform = `translate3d(calc(${-index * 100}% + ${dragX}px), 0, 0)`;
  }
  function pointerUp() {
    if (startX === null) return;
    startX = null;
    if (Math.abs(dragX) > 40) go(dragX < 0 ? 1 : -1);
    else synchronize();
    dragX = 0;
  }
  buttons[0].addEventListener('click', previous);
  buttons[1].addEventListener('click', next);
  region.addEventListener('keydown', key);
  viewport.addEventListener('pointerdown', pointerDown);
  viewport.addEventListener('pointermove', pointerMove);
  viewport.addEventListener('pointerup', pointerUp);
  viewport.addEventListener('pointercancel', pointerUp);
  desktop.addEventListener('change', synchronize);
  const resizeObserver = new ResizeObserver(synchronize);
  resizeObserver.observe(viewport);
  synchronize();
  return () => {
    window.clearTimeout(transitionTimer);
    resizeObserver.disconnect();
    buttons[0].removeEventListener('click', previous);
    buttons[1].removeEventListener('click', next);
    region.removeEventListener('keydown', key);
    viewport.removeEventListener('pointerdown', pointerDown);
    viewport.removeEventListener('pointermove', pointerMove);
    viewport.removeEventListener('pointerup', pointerUp);
    viewport.removeEventListener('pointercancel', pointerUp);
    desktop.removeEventListener('change', synchronize);
  };
}

export const AnimatedSection = memo(function AnimatedSection({ html, kind }: { html: string; kind: 'hero' | 'cta' | 'research' }) {
  const ref = useRef<HTMLDivElement>(null);
  // These sections own their canvas and animated descendants after mounting.
  // Keep React's HTML payload stable when surrounding dialogs/cookies rerender.
  const markup = useMemo(() => ({ __html: html }), [html]);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const cleanups: (() => void)[] = [];
    if (kind === 'research') cleanups.push(animateTestimonials(root));
    else {
      const canvas = root.querySelector<HTMLCanvasElement>('canvas');
      if (canvas) cleanups.push(animateDuneGradient(canvas, kind));
      if (kind === 'hero') cleanups.push(animateHeadline(root), animateHeroParallax(root));
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [html, kind]);
  return <div ref={ref} style={{ display: 'contents' }} dangerouslySetInnerHTML={markup} />;
});
