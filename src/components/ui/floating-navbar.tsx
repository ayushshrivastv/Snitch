"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FloatingNavItem = {
  name: string;
  link: string;
  icon?: ReactNode;
};

type FloatingNavProps = {
  navItems: FloatingNavItem[];
  className?: string;
  brand?: ReactNode;
  actions?: ReactNode;
  loginControl?: ReactNode;
  loginHref?: string;
};

export const floatingNavLoginClass = "relative rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-[background-color,box-shadow,transform] duration-100 ease-out hover:bg-neutral-800 hover:shadow-lg hover:shadow-neutral-900/20 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-100";

export function FloatingNav({ navItems, className, brand, actions, loginControl, loginHref = "/login" }: FloatingNavProps) {
  const { scrollY } = useScroll();
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const shown = visible || menuOpen || keyboardFocus;

  useMotionValueEvent(scrollY, "change", (current) => {
    const previous = scrollY.getPrevious() ?? current;
    if (current < 80) setVisible(true);
    else if (Math.abs(current - previous) > 2) setVisible(current < previous);
  });

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [menuOpen]);

  return (
    <motion.header
      ref={rootRef}
      initial={false}
      animate={{ y: shown ? 0 : -120, opacity: shown ? 1 : 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
      inert={!shown}
      aria-hidden={!shown}
      onFocusCapture={(event) => { if (event.target.matches(":focus-visible")) setKeyboardFocus(true); }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboardFocus(false);
      }}
      className={cn("fixed inset-x-0 top-4 z-50 mx-auto w-[calc(100%-2rem)] font-sans sm:top-10 md:w-max md:max-w-[calc(100%-2rem)]", className)}
    >
      <nav data-slot="floating-nav-surface" aria-label="Main navigation" className="flex items-center gap-2 rounded-full border border-white/50 bg-white/85 p-2 shadow-lg shadow-black/10 backdrop-blur-md dark:border-white/10 dark:bg-black/70">
        {brand && <div className="mr-auto flex shrink-0 items-center pl-2 md:mr-3">{brand}</div>}
        <div className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <a data-slot="floating-nav-link" key={item.name} href={item.link} className="relative flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-800 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white">
              {item.name}
            </a>
          ))}
        </div>
        <div data-slot="floating-nav-divider" aria-hidden="true" className="mx-1 hidden h-5 w-px bg-neutral-200 dark:bg-white/10 md:block" />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {actions}
          {loginControl ?? <a data-slot="floating-nav-login" href={loginHref} className={floatingNavLoginClass}>
            Login
          </a>}
          <button data-slot="floating-nav-toggle" ref={menuButtonRef} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-controls={menuId} aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)} className="flex size-10 items-center justify-center rounded-full text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-800 dark:text-neutral-200 dark:hover:bg-white/10 md:hidden">
            {menuOpen ? <X className="size-[18px]" aria-hidden="true" /> : <Menu className="size-[18px]" aria-hidden="true" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {menuOpen && (
          <motion.nav data-slot="floating-nav-mobile" id={menuId} aria-label="Mobile navigation" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }} className="mt-2 grid gap-1 rounded-3xl border border-white/50 bg-white/95 p-3 shadow-lg shadow-black/10 backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/95 md:hidden">
            {navItems.map((item) => (
              <a data-slot="floating-nav-link" key={item.name} href={item.link} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-neutral-800 dark:text-neutral-200 dark:hover:bg-white/10">
                {item.icon && <span aria-hidden="true">{item.icon}</span>}{item.name}
              </a>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
