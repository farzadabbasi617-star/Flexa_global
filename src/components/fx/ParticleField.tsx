"use client";

import { useEffect, useRef } from "react";

interface ParticleFieldProps {
  className?: string;
  /** Number of floating particles */
  count?: number;
  /** Base color palette (CSS color strings) */
  colors?: string[];
  /** Opacity ceiling for particles */
  maxOpacity?: number;
}

// Stable module-level default so we don't allocate (and therefore don't
// invalidate the effect's dependency array) a brand new array literal on
// every render when the caller doesn't pass a custom `colors` prop.
const DEFAULT_COLORS = ["#a855f7", "#22d3ee", "#facc15"];

/**
 * Lightweight canvas starfield / particle drift used as an ambient 3D-ish
 * backdrop across the site (hero sections, auth pages, empty states).
 * Pure canvas + rAF — no external deps, GPU-friendly, respects
 * prefers-reduced-motion, and pauses when off-screen or when the tab is
 * backgrounded.
 */
export default function ParticleField({
  className = "",
  count = 46,
  colors = DEFAULT_COLORS,
  maxOpacity = 0.75,
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let visible = true;
    let lastTime = 0;

    interface Particle {
      x: number;
      y: number;
      z: number; // depth 0..1 (bigger = closer)
      r: number;
      vx: number;
      vy: number;
      color: string;
      twinkle: number;
    }

    let particles: Particle[] = [];

    function resize() {
      const parent = canvas!.parentElement;
      width = parent ? parent.clientWidth : window.innerWidth;
      height = parent ? parent.clientHeight : window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function init() {
      particles = Array.from({ length: count }).map(() => {
        const z = Math.random();
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          z,
          r: 0.6 + z * 2.2,
          vx: (Math.random() - 0.5) * (0.08 + z * 0.18),
          vy: -(0.05 + z * 0.16),
          color: colors[Math.floor(Math.random() * colors.length)],
          twinkle: Math.random() * Math.PI * 2,
        };
      });
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);
      for (const p of particles) {
        const flicker = 0.55 + Math.sin(p.twinkle) * 0.45;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = p.color;
        ctx!.globalAlpha = Math.min(maxOpacity, 0.15 + p.z * 0.6) * flicker;
        ctx!.shadowColor = p.color;
        ctx!.shadowBlur = 6 + p.z * 10;
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    function step(time: number) {
      if (!visible || document.hidden) {
        lastTime = time;
        raf = requestAnimationFrame(step);
        return;
      }

      // Normalize motion to elapsed time (not just frame count) so particle
      // speed stays consistent across 60Hz/120Hz+ displays instead of
      // silently doubling redraw/movement cost on high refresh-rate screens.
      const delta = lastTime ? Math.min(time - lastTime, 100) : 16.67;
      lastTime = time;
      const factor = delta / 16.67;

      for (const p of particles) {
        p.x += p.vx * factor;
        p.y += p.vy * factor;
        p.twinkle += 0.02 * factor;
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
      }

      draw();
      raf = requestAnimationFrame(step);
    }

    resize();
    init();

    if (reduceMotion) {
      // Respect the user's OS-level preference: render a single static
      // frame and never schedule further animation frames (previously this
      // branch called step() once, but step() unconditionally re-scheduled
      // itself via requestAnimationFrame, so reduced-motion users still got
      // the full animation running forever in the background).
      draw();
    } else {
      raf = requestAnimationFrame(step);
    }

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    function handleVisibilityChange() {
      // requestAnimationFrame already pauses in most backgrounded tabs, but
      // explicitly short-circuiting the work inside step() avoids a burst
      // of catch-up work (large `delta`) when the tab regains focus.
      if (!document.hidden) lastTime = 0;
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleResize = () => {
      resize();
      init();
      if (reduceMotion) draw();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("resize", handleResize);
    };
  }, [count, colors, maxOpacity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
    />
  );
}
