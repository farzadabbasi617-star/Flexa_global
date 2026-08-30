type AnimatedFlexaLogoProps = {
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
};

const sizeClasses = {
  sm: "w-72 h-40 max-w-full",
  md: "w-[360px] h-[196px] max-w-full",
  lg: "w-[430px] h-[242px] max-w-full",
};

export default function AnimatedFlexaLogo({ size = "md", showLabel = false, className = "" }: AnimatedFlexaLogoProps) {
  return (
    <div className={`flexa-logo-wrap ${className}`}>
      <div className="flexa-perspective">
        <div className={`flexa-logo-stage ${sizeClasses[size]}`} aria-label="Flexa animated royal logo">
          <span className="flexa-aura aura-purple" />
          <span className="flexa-aura aura-cyan" />
          <span className="flexa-ring ring-a" />
          <span className="flexa-ring ring-b" />
          <span className="flexa-spark spark-1" />
          <span className="flexa-spark spark-2" />
          <span className="flexa-spark spark-3" />
          <span className="flexa-scan" />
          <img src="/icons/flexa-auth-royal-v2.png?v=20260624-royal" alt="Flexa | Flexa" className="flexa-logo-img" />
        </div>
      </div>

      {showLabel && (
        <div className="mt-3 text-center">
          <div className="text-lg font-black tracking-tight text-white">Flexa | Flexa</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-300/80">Royal Gaming Arena</div>
        </div>
      )}

      <style jsx>{`
        .flexa-logo-wrap {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          isolation: isolate;
          max-width: 100%;
        }

        .flexa-perspective {
          perspective: 900px;
          perspective-origin: 50% 45%;
          max-width: 100%;
        }

        .flexa-logo-stage {
          position: relative;
          border-radius: 30px;
          display: grid;
          place-items: center;
          transform-style: preserve-3d;
          background:
            radial-gradient(circle at 50% 44%, rgba(168, 85, 247, 0.16), transparent 42%),
            radial-gradient(circle at 66% 38%, rgba(34, 211, 238, 0.16), transparent 44%),
            linear-gradient(135deg, rgba(3, 7, 18, 0.96), rgba(18, 8, 30, 0.82));
          box-shadow:
            0 18px 45px rgba(0, 0, 0, 0.58),
            0 0 28px rgba(168, 85, 247, 0.42),
            0 0 56px rgba(34, 211, 238, 0.2),
            inset 0 0 28px rgba(255, 255, 255, 0.05);
          animation: flexa-3d-float 5.2s ease-in-out infinite;
          overflow: hidden;
        }

        .flexa-logo-stage::before {
          content: "";
          position: absolute;
          inset: -24%;
          background: conic-gradient(
            from 0deg,
            transparent,
            rgba(168, 85, 247, 0.68),
            rgba(34, 211, 238, 0.76),
            rgba(250, 204, 21, 0.52),
            transparent 72%
          );
          filter: blur(16px);
          opacity: 0.72;
          animation: flexa-spin 7s linear infinite;
          z-index: -2;
        }

        .flexa-logo-stage::after {
          content: "";
          position: absolute;
          inset: 6%;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: inset 0 0 20px rgba(34, 211, 238, 0.16);
          pointer-events: none;
          z-index: 5;
          transform: translateZ(26px);
        }

        .flexa-logo-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 28px;
          transform: translateZ(42px) scale(1.015);
          filter:
            drop-shadow(0 0 13px rgba(168, 85, 247, 0.92))
            drop-shadow(0 0 22px rgba(34, 211, 238, 0.66))
            drop-shadow(0 0 12px rgba(250, 204, 21, 0.22));
          animation: flexa-logo-breathe 2.9s ease-in-out infinite;
          z-index: 3;
        }

        .flexa-aura {
          position: absolute;
          width: 44%;
          height: 62%;
          border-radius: 999px;
          filter: blur(28px);
          opacity: 0.45;
          z-index: 1;
          pointer-events: none;
          transform: translateZ(20px);
        }

        .aura-purple { left: 17%; top: 23%; background: rgba(217, 70, 239, 0.7); animation: aura-pulse 3.2s ease-in-out infinite; }
        .aura-cyan { right: 17%; top: 23%; background: rgba(34, 211, 238, 0.7); animation: aura-pulse 3.2s ease-in-out 0.8s infinite; }

        .flexa-ring {
          position: absolute;
          border-radius: 30px;
          border: 1px solid transparent;
          pointer-events: none;
          z-index: 4;
          transform: translateZ(62px);
        }

        .ring-a {
          inset: 2%;
          border-top-color: rgba(34, 211, 238, 0.75);
          border-right-color: rgba(168, 85, 247, 0.45);
          animation: ring-shift-a 3.8s ease-in-out infinite;
        }

        .ring-b {
          inset: 8%;
          border-bottom-color: rgba(250, 204, 21, 0.58);
          border-left-color: rgba(236, 72, 153, 0.5);
          animation: ring-shift-b 4.8s ease-in-out infinite;
        }

        .flexa-scan {
          position: absolute;
          left: -42%;
          right: -42%;
          top: -20%;
          height: 34%;
          background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.18), transparent);
          transform: translateZ(70px) rotate(-18deg);
          mix-blend-mode: screen;
          animation: flexa-scan 3.8s ease-in-out infinite;
          z-index: 6;
          pointer-events: none;
        }

        .flexa-spark {
          position: absolute;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #facc15;
          box-shadow: 0 0 13px #facc15, 0 0 24px rgba(34, 211, 238, 0.72);
          z-index: 7;
          opacity: 0;
          transform: translateZ(84px);
        }

        .spark-1 { top: 17%; left: 41%; animation: flexa-spark 2.9s ease-in-out infinite; }
        .spark-2 { top: 15%; right: 39%; animation: flexa-spark 2.9s ease-in-out 0.65s infinite; }
        .spark-3 { top: 31%; left: 52%; animation: flexa-spark 2.9s ease-in-out 1.22s infinite; }

        @keyframes flexa-3d-float {
          0%, 100% { transform: rotateX(0deg) rotateY(-7deg) translateY(0) scale(1); }
          50% { transform: rotateX(4deg) rotateY(7deg) translateY(-8px) scale(1.025); }
        }

        @keyframes flexa-logo-breathe {
          0%, 100% { filter: drop-shadow(0 0 13px rgba(168, 85, 247, 0.86)) drop-shadow(0 0 22px rgba(34, 211, 238, 0.58)) drop-shadow(0 0 12px rgba(250, 204, 21, 0.18)); }
          50% { filter: drop-shadow(0 0 21px rgba(168, 85, 247, 1)) drop-shadow(0 0 34px rgba(34, 211, 238, 0.82)) drop-shadow(0 0 18px rgba(250, 204, 21, 0.32)); }
        }

        @keyframes flexa-spin { to { transform: rotate(360deg); } }

        @keyframes aura-pulse {
          0%, 100% { opacity: 0.28; transform: translateZ(20px) scale(0.92); }
          50% { opacity: 0.58; transform: translateZ(20px) scale(1.08); }
        }

        @keyframes ring-shift-a {
          0%, 100% { transform: translateZ(62px) rotate(0deg) scale(1); opacity: 0.7; }
          50% { transform: translateZ(62px) rotate(2deg) scale(1.03); opacity: 1; }
        }

        @keyframes ring-shift-b {
          0%, 100% { transform: translateZ(62px) rotate(0deg) scale(1); opacity: 0.6; }
          50% { transform: translateZ(62px) rotate(-2deg) scale(0.97); opacity: 0.95; }
        }

        @keyframes flexa-scan {
          0%, 18% { transform: translateZ(70px) translateY(-190%) rotate(-18deg); opacity: 0; }
          35%, 60% { opacity: 1; }
          82%, 100% { transform: translateZ(70px) translateY(420%) rotate(-18deg); opacity: 0; }
        }

        @keyframes flexa-spark {
          0%, 100% { opacity: 0; transform: translateZ(84px) scale(0.2); }
          45% { opacity: 1; transform: translateZ(84px) scale(1); }
          70% { opacity: 0; transform: translateZ(84px) scale(1.9); }
        }
      `}</style>
    </div>
  );
}
