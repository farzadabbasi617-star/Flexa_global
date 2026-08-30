"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const CARD_SELECTOR = ".gaming-card, .glass-panel, .fx-card";
const MAX_TILT = 6;
const GLARE_CLASS = "gfx-glare";

/**
 * Site-wide 3D tilt + glare enhancer.
 *
 * Instead of manually wrapping every card component across ~60 pages
 * (including the whole admin console), this attaches a lightweight
 * pointer-tilt effect directly to every element already using the site's
 * existing card classes (`.gaming-card`, `.glass-panel`, `.fx-card`) —
 * which are used in 50+ places already (leaderboard, profile, wallet,
 * teams, store, admin panels, etc). A MutationObserver keeps re-binding
 * as React renders/removes cards (tabs, filters, SPA navigation).
 *
 * Cards already using the dedicated <TiltCard> component are skipped
 * (they manage their own perspective/tilt via Framer Motion) to avoid
 * double transforms.
 */
export default function GlobalCardFX() {
  const pathname = usePathname();

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    // Fine/hover-capable pointer (mouse/trackpad) only. Touch devices never
    // fire pointermove the way this effect needs, so skip binding entirely
    // there instead of silently attaching no-op listeners + extra DOM nodes
    // (glare overlay, inline styles) to every card for nothing.
    const hasFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!hasFinePointer) return;

    const bound = new WeakSet<Element>();

    function isManaged(el: Element) {
      return Boolean(el.closest('[data-fx-managed="true"]'));
    }

    function ensureGlare(el: HTMLElement) {
      let glare = el.querySelector<HTMLElement>(`:scope > .${GLARE_CLASS}`);
      if (!glare) {
        glare = document.createElement("div");
        glare.className = GLARE_CLASS;
        glare.setAttribute("aria-hidden", "true");
        Object.assign(glare.style, {
          position: "absolute",
          inset: "0",
          opacity: "0",
          pointerEvents: "none",
          borderRadius: "inherit",
          mixBlendMode: "overlay",
          transition: "opacity .25s ease",
          zIndex: "5",
        } as CSSStyleDeclaration);
        const computed = window.getComputedStyle(el);
        if (computed.position === "static") el.style.position = "relative";
        el.appendChild(glare);
      }
      return glare;
    }

    function bind(el: HTMLElement) {
      if (bound.has(el) || isManaged(el)) return;
      bound.add(el);

      el.style.transformStyle = "preserve-3d";
      el.style.willChange = "transform";
      el.style.transition = "transform .35s cubic-bezier(.22,1,.36,1)";

      const glare = ensureGlare(el);

      // rAF-throttle pointermove: reading getBoundingClientRect() and then
      // writing transform/background on every raw pointermove event (which
      // can fire 60-120+ times/sec) causes layout thrashing. Coalescing to
      // at most one measure+write per animation frame keeps this smooth
      // even with many cards mounted (e.g. the admin console, leaderboard).
      let rafId = 0;
      let pendingEvent: PointerEvent | null = null;

      function flush() {
        rafId = 0;
        const e = pendingEvent;
        pendingEvent = null;
        if (!e) return;
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        const rx = (0.5 - py) * MAX_TILT;
        const ry = (px - 0.5) * MAX_TILT;
        el.style.transition = "transform .08s linear";
        el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(4px)`;
        glare.style.opacity = "1";
        glare.style.background = `radial-gradient(circle at ${px * 100}% ${py * 100}%, rgba(255,255,255,.18), transparent 55%)`;
      }

      function handleMove(e: PointerEvent) {
        if (e.pointerType === "touch") return;
        pendingEvent = e;
        if (!rafId) rafId = requestAnimationFrame(flush);
      }

      function handleLeave() {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
          pendingEvent = null;
        }
        el.style.transition = "transform .35s cubic-bezier(.22,1,.36,1)";
        el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)";
        glare.style.opacity = "0";
      }

      el.addEventListener("pointermove", handleMove);
      el.addEventListener("pointerleave", handleLeave);
    }

    function scan(root: ParentNode = document) {
      root.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach(bind);
    }

    scan();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          const element = node as HTMLElement;
          if (element.matches?.(CARD_SELECTOR)) bind(element);
          scan(element);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
    // Re-scan whenever the route changes too (covers SPA nav edge cases).
  }, [pathname]);

  return null;
}
