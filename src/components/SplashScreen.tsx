"use client";

import { useEffect, useState } from "react";

export default function SplashScreen() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("flexa_splash_seen") === "1"; } catch {}
    if (seen) return;

    // preload لوگو قبل از نمایش
    const img = new Image();
    img.src = "/icons/flexa-logo-square.png";
    img.onload = () => {
      setShow(true);
      try { sessionStorage.setItem("flexa_splash_seen", "1"); } catch {}
      const fadeT = setTimeout(() => setLeaving(true), 1900);
      const doneT = setTimeout(() => setShow(false), 2600);
      return () => { clearTimeout(fadeT); clearTimeout(doneT); };
    };
    // اگه لوگو لود نشد ۳۰۰ms بعد نشون بده
    img.onerror = () => {
      setShow(true);
      try { sessionStorage.setItem("flexa_splash_seen", "1"); } catch {}
      const fadeT = setTimeout(() => setLeaving(true), 1900);
      const doneT = setTimeout(() => setShow(false), 2600);
      return () => { clearTimeout(fadeT); clearTimeout(doneT); };
    };
  }, []);

  if (!show) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "grid", placeItems: "center",
        background: "radial-gradient(circle at 50% 38%, #15102b 0%, #0a0a12 55%, #050509 100%)",
        opacity: leaving ? 0 : 1,
        transition: "opacity 650ms ease",
        pointerEvents: leaving ? "none" : "auto",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes gmtFloat { 0%{transform:translateY(0) scale(1)} 50%{transform:translateY(-10px) scale(1.015)} 100%{transform:translateY(0) scale(1)} }
        @keyframes gmtGlow { 0%,100%{filter:drop-shadow(0 0 18px rgba(168,85,247,.55)) drop-shadow(0 0 40px rgba(34,211,238,.25))} 50%{filter:drop-shadow(0 0 34px rgba(168,85,247,.85)) drop-shadow(0 0 70px rgba(34,211,238,.5))} }
        @keyframes gmtSpin { to{transform:rotate(360deg)} }
        @keyframes gmtRise { 0%{opacity:0;transform:translateY(14px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes gmtBar { 0%{width:0%} 100%{width:100%} }
      `}</style>

      <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
        {/* حلقه نور چرخان */}
        <div style={{
          position: "absolute", width: 300, height: 300, borderRadius: "50%",
          background: "conic-gradient(from 0deg, rgba(168,85,247,0) 0deg, rgba(168,85,247,.45) 90deg, rgba(34,211,238,.45) 180deg, rgba(168,85,247,0) 300deg)",
          filter: "blur(26px)", animation: "gmtSpin 6s linear infinite",
        }} />
        {/* لوگوی اصلی Flexa */}
        <img
          src="/icons/flexa-logo-square.png"
          alt="Flexa"
          width={188} height={188}
          style={{
            position: "relative", width: 188, height: 188,
            objectFit: "contain", borderRadius: 28,
            animation: "gmtFloat 3.2s ease-in-out infinite, gmtGlow 2.4s ease-in-out infinite",
          }}
        />
      </div>

      <div style={{
        position: "absolute", bottom: "16%",
        textAlign: "center", animation: "gmtRise 700ms ease 200ms both",
      }}>
        <div style={{
          fontWeight: 900, letterSpacing: 4, fontSize: 24,
          background: "linear-gradient(90deg,#c084fc,#e9d5ff,#67e8f9)",
          WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
        }}>GAMENT</div>
        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(216,180,254,.7)" }}>
          آرنای حرفه‌ای گیمینگ
        </div>
        <div style={{
          marginTop: 16, width: 150, height: 4, borderRadius: 999,
          background: "rgba(255,255,255,.08)", overflow: "hidden",
        }}>
          <div style={{
            height: "100%", borderRadius: 999,
            background: "linear-gradient(90deg,#a855f7,#22d3ee)",
            animation: "gmtBar 1.9s ease-out forwards",
          }} />
        </div>
      </div>
    </div>
  );
}
