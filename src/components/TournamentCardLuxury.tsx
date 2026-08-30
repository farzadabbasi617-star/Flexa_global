"use client";

import React, { memo, useMemo } from "react";
import Link from "next/link";
import TiltCard from "@/components/fx/TiltCard";
import { useCountdown } from "@/hooks/useCountdown";
import { useLanguage } from "@/contexts/LanguageContext";

interface Tournament {
  id: string;
  name: string;
  game: string;
  categoryLabel?: string | null;
  maxPlayers: number;
  registeredCount: number;
  prizePool: string | null;
  winnersCount?: number;
  entryFee: string | null;
  startDate: string | null;
  bannerUrl?: string | null;
  isRegistered?: boolean;
}

interface Props {
  t: Tournament;
  isLoggedIn?: boolean;
}

const GAME_FALLBACK: Record<string, string> = {
  cod_mobile: "radial-gradient(circle at 75% 28%, rgba(255,140,0,.45), transparent 22%), linear-gradient(135deg,#090a10,#3a220d)",
  fortnite: "radial-gradient(circle at 75% 28%, rgba(188,0,255,.42), transparent 22%), linear-gradient(135deg,#090a10,#28103a)",
  clash_royale: "radial-gradient(circle at 75% 28%, rgba(0,210,255,.38), transparent 22%), linear-gradient(135deg,#080a12,#09283a)",
};

const TournamentCardLuxury = ({ t, isLoggedIn = false }: Props) => {
  const { lang, dir } = useLanguage();
  const spotsLeft = Math.max(0, t.maxPlayers - (t.registeredCount || 0));
  const { value: countdown, expired } = useCountdown(t.startDate);

  const entryFeeDisplay = useMemo(() => {
    if (!t.entryFee || t.entryFee.toLowerCase().includes("free") || t.entryFee === "0") {
      return lang === "ar" ? "مجاناً" : "FREE";
    }
    return t.entryFee.includes("$") ? t.entryFee : `$${t.entryFee} USDT`;
  }, [t.entryFee, lang]);

  const prizeDisplay = useMemo(() => {
    if (!t.prizePool) return "$500 USDT";
    return t.prizePool.includes("$") ? t.prizePool : `$${t.prizePool} USDT`;
  }, [t.prizePool]);

  const formatTournamentDate = (dateStr: string | null) => {
    if (!dateStr) return lang === "ar" ? "قريباً" : "Upcoming";
    const date = new Date(dateStr);
    const locale = lang === "ar" ? "ar-SA" : "en-US";
    return date.toLocaleString(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const action = t.isRegistered
    ? {
        href: `/tournaments/${t.id}/lobby`,
        label: lang === "ar" ? "دخول اللوبي" : "Enter Lobby ⚔️",
        tone: "from-emerald-600 to-green-600",
      }
    : spotsLeft === 0
    ? {
        href: `/tournaments/${t.id}`,
        label: lang === "ar" ? "مكتمل" : "Full Capacity",
        tone: "from-gray-700 to-gray-800",
      }
    : {
        href: `/tournaments/${t.id}`,
        label: lang === "ar" ? "انضم الآن" : "Register Now →",
        tone: "from-purple-600 to-blue-600",
      };

  return (
    <TiltCard maxTilt={5} liftZ={12} scaleOnHover={1.015} className="rounded-[32px] mb-5">
      <div className="relative overflow-hidden rounded-[32px] bg-[#0f0f13] border border-white/10 shadow-2xl fx-card transition-all">
        <div className="relative h-44 w-full">
          <div
            className="absolute inset-0"
            style={{ background: GAME_FALLBACK[t.game] || GAME_FALLBACK.clash_royale }}
          />
          {t.bannerUrl && (
            <img
              src={t.bannerUrl}
              alt={t.name}
              className="absolute inset-0 w-full h-full object-cover opacity-60"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f13] via-black/40 to-black/10" />

          <div className="absolute bottom-4 left-5 right-5" style={{ transform: "translateZ(20px)" }}>
            <h3 className="text-xl sm:text-22px leading-tight font-black tracking-tight text-white drop-shadow-md">
              {t.name}
            </h3>
          </div>

          <div
            className="absolute top-4 right-4 bg-black/70 backdrop-blur-xl px-3.5 py-1.5 rounded-2xl border border-white/10"
            style={{ transform: "translateZ(30px)" }}
          >
            <span className="text-[10px] font-black text-white/90">
              {t.isRegistered
                ? (lang === "ar" ? "مسجل" : "Registered")
                : spotsLeft === 0
                ? (lang === "ar" ? "مكتمل" : "Full")
                : `${spotsLeft} ${lang === "ar" ? "مقاعد متبقية" : "spots left"}`}
            </span>
          </div>

          {t.isRegistered && (
            <div className="absolute top-4 left-4 bg-emerald-500/20 backdrop-blur-xl px-3 py-1 rounded-2xl border border-emerald-500/30 text-emerald-400 text-[10px] font-black">
              ✓ {lang === "ar" ? "تم الانضمام" : "Joined"}
            </div>
          )}
        </div>

        <div className="p-5 pt-4 space-y-4">
          {/* Prize Section */}
          <div className="bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-transparent border border-yellow-500/20 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <div className="text-[10px] text-yellow-500/80 font-bold tracking-wider uppercase mb-0.5">
                {lang === "ar" ? "مجموع الجوائز (USDT / TON)" : "Guaranteed Prize Pool"}
              </div>
              <div className="font-black text-yellow-400 text-xl tracking-tight">
                {prizeDisplay}
              </div>
            </div>
            <span className="text-3xl opacity-90 shrink-0">🏆</span>
          </div>

          {/* Date & Countdown */}
          <div className="grid grid-cols-1 gap-2.5">
            <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl flex items-center justify-between text-xs sm:text-sm">
              <span className="text-gray-400">{lang === "ar" ? "وقت البدء:" : "Start Time"}</span>
              <span className="font-bold text-white">{formatTournamentDate(t.startDate)}</span>
            </div>

            {countdown && (
              <div
                className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs sm:text-sm ${
                  expired
                    ? "bg-emerald-500/10 border-emerald-500/20"
                    : "bg-purple-500/10 border-purple-500/20"
                }`}
              >
                <span className="text-gray-400">{lang === "ar" ? "الوقت المتبقي:" : "Starts In"}</span>
                <span
                  className={`font-black ${expired ? "text-emerald-400" : "text-purple-300"}`}
                >
                  {countdown}
                </span>
              </div>
            )}
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
                {lang === "ar" ? "رسوم الدخول" : "Entry Fee"}
              </div>
              <div className="font-black text-lg text-cyan-300">{entryFeeDisplay}</div>
            </div>

            <Link
              href={action.href}
              className={`px-6 py-3 rounded-2xl font-black text-xs sm:text-sm flex items-center gap-2 active:scale-[0.985] transition-all bg-gradient-to-r ${action.tone} text-white shadow-lg`}
            >
              {action.label}
            </Link>
          </div>
        </div>
      </div>
    </TiltCard>
  );
};

export default memo(TournamentCardLuxury);
