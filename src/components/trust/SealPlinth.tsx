"use client";

/**
 * A 3D glass plinth that the e-Namad seal sits on.
 *
 * The seal itself must stay the untouched <img> served by trustseal.enamad.ir
 * (their server checks the Referer to verify the licence, and redrawing a
 * government trust mark would be dishonest). So the depth is built *around* it:
 * a lit, extruded pedestal with a rotating conic halo behind the artwork.
 *
 * That gives the licence card the same visual weight as the drawn ZarinPal
 * mark without touching a single pixel of the seal.
 */

import type { ReactNode } from "react";

export default function SealPlinth({
  children,
  tone = "emerald",
}: {
  children: ReactNode;
  tone?: "emerald" | "amber";
}) {
  const halo =
    tone === "emerald"
      ? "conic-gradient(from_0deg,rgba(16,185,129,.55),rgba(6,182,212,.15),rgba(16,185,129,.55))"
      : "conic-gradient(from_0deg,rgba(250,204,21,.55),rgba(249,115,22,.15),rgba(250,204,21,.55))";

  return (
    <div className="relative grid place-items-center" style={{ perspective: 800 }}>
      {/* Rotating halo behind the plinth. Blurred hard so it reads as light,
          not as a visible spinning ring. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-[132px] w-[132px] animate-[trust-spin_9s_linear_infinite] rounded-full opacity-45 blur-2xl"
        style={{ backgroundImage: halo.replace(/_/g, " ") }}
      />

      {/* Extruded base: three stacked, progressively darker plates. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[13px] h-[104px] w-[124px] rounded-[22px] bg-black/55 blur-[3px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[7px] h-[104px] w-[122px] rounded-[22px] bg-white/[.06]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[3px] h-[104px] w-[124px] rounded-[22px] bg-white/[.09]"
      />

      {/* The lit face the seal rests on. */}
      <div
        className="relative grid place-items-center rounded-[22px] border border-white/25 bg-[linear-gradient(150deg,rgba(255,255,255,.22),rgba(255,255,255,.06)_45%,rgba(255,255,255,.13))] px-3.5 py-3 shadow-[0_18px_40px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.55)] backdrop-blur-sm"
        style={{ transform: "translateZ(30px)" }}
      >
        {/* Glass sheen across the top half. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[22px] bg-gradient-to-b from-white/25 to-transparent"
        />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}
