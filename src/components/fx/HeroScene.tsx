"use client";

import { PropsWithChildren } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import ParticleField from "./ParticleField";

interface HeroSceneProps {
  className?: string;
  heroImage?: string | null;
  heroAlt?: string;
}

/**
 * The animated 3D hero stage for the homepage: pointer-reactive parallax
 * layers (glow orbs, banner image, particle starfield) that tilt gently
 * with the cursor to give the flat hero card real depth.
 */
export default function HeroScene({
  className = "",
  heroImage,
  heroAlt = "",
  children,
}: PropsWithChildren<HeroSceneProps>) {
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 90, damping: 18, mass: 0.6 };

  const rotateX = useSpring(useTransform(py, [0, 1], [4, -4]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-4, 4]), spring);

  const imgX = useSpring(useTransform(px, [0, 1], [-14, 14]), spring);
  const imgY = useSpring(useTransform(py, [0, 1], [-10, 10]), spring);

  const orb1X = useSpring(useTransform(px, [0, 1], [-26, 26]), spring);
  const orb1Y = useSpring(useTransform(py, [0, 1], [-18, 18]), spring);
  const orb2X = useSpring(useTransform(px, [0, 1], [20, -20]), spring);
  const orb2Y = useSpring(useTransform(py, [0, 1], [14, -14]), spring);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch") return;
    const rect = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  }

  function handlePointerLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 1200 }}
      className={`relative overflow-hidden ${className}`}
    >
      <div className="absolute inset-0 hero-art" />

      <ParticleField count={38} className="opacity-70" />

      {heroImage && (
        <motion.img
          src={heroImage}
          alt={heroAlt}
          style={{ x: imgX, y: imgY }}
          className="absolute inset-0 w-full h-full object-cover opacity-55 scale-110"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-[#050508] via-[#050508]/60 to-transparent" />

      <motion.div
        aria-hidden
        style={{ x: orb1X, y: orb1Y }}
        className="absolute -top-20 -left-16 w-72 h-72 rounded-full bg-purple-600/20 blur-3xl"
      />
      <motion.div
        aria-hidden
        style={{ x: orb2X, y: orb2Y }}
        className="absolute top-10 right-8 w-24 h-24 rounded-full bg-cyan-400/10 blur-2xl"
      />

      <div style={{ transform: "translateZ(40px)", transformStyle: "preserve-3d" }} className="relative h-full">
        {children}
      </div>
    </motion.div>
  );
}
