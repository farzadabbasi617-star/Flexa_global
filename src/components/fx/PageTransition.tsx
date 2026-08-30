"use client";

import { PropsWithChildren, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Wraps route content with a soft fade transition between pages so
 * navigating around the app feels animated instead of a hard page cut.
 *
 * Deliberately opacity-only (no transform/translate/rotate): many pages
 * throughout the app rely on `position: fixed` decorative layers (glow
 * orbs, background gradients) that assume they're positioned relative to
 * the viewport. Per the CSS spec, applying ANY transform to an ancestor
 * creates a new containing block for its fixed-position descendants,
 * which broke those layers site-wide (they lost their fixed positioning
 * and pushed the page into horizontal overflow/scroll). Keeping this
 * wrapper transform-free avoids that class of bug entirely.
 */
export default function PageTransition({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Server render (and the first client paint) emits the children as plain
  // markup. Wrapping them in AnimatePresence/motion on that first pass made
  // Next bail out to client-side rendering for this subtree, so the browser
  // received the page inside `<div hidden>` and showed nothing but the footer
  // until hydration — a 0.66 layout shift once the real content appeared.
  //
  // The fade only matters when navigating between routes, which by definition
  // happens after mount, so nothing is lost visually.
  if (!mounted) return <>{children}</>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
