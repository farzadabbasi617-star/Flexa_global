"use client";

import { PropsWithChildren, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface TiltCardProps {
  className?: string;
  /** Maximum tilt rotation in degrees */
  maxTilt?: number;
  /** Show a moving specular glare highlight */
  glare?: boolean;
  /** Scale applied while hovered */
  scaleOnHover?: number;
  /** Extra Z lift (px) applied to the card while hovered for a "floating" depth feel */
  liftZ?: number;
  style?: React.CSSProperties;
  as?: "div";
}

/**
 * A perspective/3D tilt wrapper — the card rotates toward the pointer like a
 * physical glossy panel, with a soft light glare and depth lift.
 * Falls back to a static card on touch devices (no pointer hover) automatically
 * because tilt only reacts to pointer movement.
 */
export default function TiltCard({
  children,
  className = "",
  maxTilt = 10,
  glare = true,
  scaleOnHover = 1.02,
  liftZ = 18,
  style,
}: PropsWithChildren<TiltCardProps>) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const springConfig = { stiffness: 220, damping: 22, mass: 0.5 };
  const rotateX = useSpring(useTransform(py, [0, 1], [maxTilt, -maxTilt]), springConfig);
  const rotateY = useSpring(useTransform(px, [0, 1], [-maxTilt, maxTilt]), springConfig);
  const translateZ = useSpring(hovered ? liftZ : 0, springConfig);
  const scale = useSpring(hovered ? scaleOnHover : 1, springConfig);
  const glareBackground = useTransform([px, py], (latest) => {
    const [gx, gy] = latest as [number, number];
    return `radial-gradient(circle at ${gx * 100}% ${gy * 100}%, rgba(255,255,255,.28), transparent 46%)`;
  });
  const glareOpacity = useSpring(hovered ? 1 : 0, { stiffness: 200, damping: 26 });

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch") return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  }

  function handleEnter(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch") return;
    setHovered(true);
  }

  function handleLeave() {
    setHovered(false);
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <div style={{ perspective: 1100 }} className="[transform-style:preserve-3d]">
      <motion.div
        ref={ref}
        onPointerMove={handlePointerMove}
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
        data-fx-managed="true"
        style={{
          rotateX,
          rotateY,
          scale,
          z: translateZ,
          transformStyle: "preserve-3d",
          ...style,
        }}
        className={`relative will-change-transform ${className}`}
      >
        {children}
        {glare && (
          <motion.div
            aria-hidden
            style={{ background: glareBackground, opacity: glareOpacity }}
            className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-overlay"
          />
        )}
      </motion.div>
    </div>
  );
}
