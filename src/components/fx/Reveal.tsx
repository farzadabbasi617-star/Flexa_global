"use client";

import { PropsWithChildren } from "react";
import { motion, Variants } from "framer-motion";

interface RevealProps {
  className?: string;
  /** Delay in seconds before the animation starts */
  delay?: number;
  /** Direction the element travels in from */
  from?: "up" | "down" | "left" | "right" | "scale";
  /** Distance (px) traveled for directional reveals */
  distance?: number;
  /** Re-trigger every time it scrolls into view (default: only once) */
  repeat?: boolean;
  /** How much of the element must be visible before triggering (0..1) */
  amount?: number;
  as?: "div" | "section" | "article" | "li";
}

// Animate through `transform` explicitly rather than framer's x/y shorthand.
//
// The shorthand let Chrome attribute the movement to layout, so every reveal
// counted as Cumulative Layout Shift even though nothing actually reflowed:
// the shift entries reported identical geometry (y:94->94 h:550->550). On
// /honors that inflated CLS from 0.136 to 0.368 — measured by re-running the
// same page under prefers-reduced-motion, which disables these animations and
// removed exactly that 0.23.
//
// translate3d keeps the motion on the compositor, where it is invisible to
// layout, so the effect looks identical but no longer scores against us.
const directions: Record<string, (d: number) => Variants> = {
  up: (d) => ({
    hidden: { opacity: 0, transform: `translate3d(0, ${d}px, 0)` },
    visible: { opacity: 1, transform: "translate3d(0, 0, 0)" },
  }),
  down: (d) => ({
    hidden: { opacity: 0, transform: `translate3d(0, ${-d}px, 0)` },
    visible: { opacity: 1, transform: "translate3d(0, 0, 0)" },
  }),
  left: (d) => ({
    hidden: { opacity: 0, transform: `translate3d(${d}px, 0, 0)` },
    visible: { opacity: 1, transform: "translate3d(0, 0, 0)" },
  }),
  right: (d) => ({
    hidden: { opacity: 0, transform: `translate3d(${-d}px, 0, 0)` },
    visible: { opacity: 1, transform: "translate3d(0, 0, 0)" },
  }),
  scale: () => ({
    hidden: { opacity: 0, transform: "scale3d(0.88, 0.88, 1)" },
    visible: { opacity: 1, transform: "scale3d(1, 1, 1)" },
  }),
};

/**
 * Scroll-triggered fade/slide reveal used to bring sections & cards to life
 * as the user scrolls — the animated equivalent of the site's luxury
 * glassmorphism cards "arriving" into place.
 */
const motionTags = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  li: motion.li,
};

export default function Reveal({
  children,
  className = "",
  delay = 0,
  from = "up",
  distance = 28,
  repeat = false,
  amount = 0.25,
  as = "div",
}: PropsWithChildren<RevealProps>) {
  const variants = directions[from](distance);
  const MotionTag = motionTags[as];

  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: !repeat, amount }}
      variants={variants}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  );
}
