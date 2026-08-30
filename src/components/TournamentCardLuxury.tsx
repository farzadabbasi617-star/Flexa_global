"use client";

import React, { memo, useMemo } from "react";
import Link from "next/link";
import { parseTomanToRial, rialToTomanNumber } from "@/lib/money";
import { calculateDynamicTournamentPrizePool } from "@/lib/tournament-finance";
import { isClash1v1QueueTournament } from "@/lib/clash-1v1-config";
import { checkAgeGate, MIN_ADULT_AGE } from "@/lib/age-gate";
import { useAuth } from "@/contexts/AuthContext";
import TiltCard from "@/components/fx/TiltCard";
import { useCountdown } from "@/hooks/useCountdown";

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
  walletBalanceToman?: number | null;
  isLoggedIn?: boolean;
}

const GAME_FALLBACK: Record<string, string> = {
  cod_mobile: "radial-gradient(circle at 75% 28%, rgba(255,140,0,.45), transparent 22%), linear-gradient(135deg,#090a10,#3a220d)",
  fortnite: "radial-gradient(circle at 75% 28%, rgba(188,0,255,.42), transparent 22%), linear-gradient(135deg,#090a10,#28103a)",
  clash_royale: "radial-gradient(circle at 75% 28%, rgba(0,210,255,.38), transparent 22%), linear-gradient(135deg,#080a12,#09283a)",
};

// تابع هوشمند برای تبدیل لینک imgurl.ir به لینک مستقیم تصویر
function getDirectImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // پشتیبانی از لینک viewer.php
  if (url.includes("imgurl.ir/viewer.php")) {
    const match = url.match(/[?&]file=([^&]+)/);
    if (match && match[1]) {
      // حذف کاراکترهای اضافی و ساخت لینک مستقیم
      const fileName = match[1].split("?")[0]; // در صورت وجود پارامتر اضافی
      return `https://cdn.imgurl.ir/uploads/${fileName}`;
    }
  }

  // اگر لینک مستقیم باشد (cdn.imgurl.ir)
  if (url.includes("cdn.imgurl.ir")) {
    return url;
  }

  // در غیر این صورت همان لینک را برمی‌گردانیم
  return url;
}

const TournamentCardLuxury = ({ t, walletBalanceToman = null, isLoggedIn = false }: Props) => {
  const spotsLeft = Math.max(0, t.maxPlayers - (t.registeredCount || 0));
  const { value: countdown, expired } = useCountdown(t.startDate);
  const { user } = useAuth();

  // تبدیل خودکار لینک تصویر
  const bannerUrl = getDirectImageUrl(t.bannerUrl);

  const entryFeeInfo = useMemo(() => {
    const rial = parseTomanToRial(t.entryFee || "");
    const toman = rialToTomanNumber(rial);
    return { rial, toman, isPaid: rial > BigInt(0) };
  }, [t.entryFee]);

  // Age-gate check — only relevant for paid tournaments. The server does
  // its own authoritative check on submit; this is UX only (so under-18
  // users see the button disabled with a clear message instead of
  // discovering the block after clicking through).
  const ageGate = useMemo(() => {
    if (!user || !entryFeeInfo.isPaid) return { ok: true as const };
    return checkAgeGate({ birthDate: user.birthDate, nationalId: user.nationalId });
  }, [user, entryFeeInfo.isPaid]);
  const ageBlocked = isLoggedIn && !t.isRegistered && entryFeeInfo.isPaid && !ageGate.ok;

  const prizeData = useMemo(() => {
    return calculateDynamicTournamentPrizePool({
      entryFee: t.entryFee,
      registeredCount: t.registeredCount,
      maxPlayers: t.maxPlayers,
      staticPrizePool: t.prizePool,
      // 1V1 is a matchmaking queue whose maxPlayers is the queue capacity
      // (1000), not the two seats in an actual match.
      isDuel: isClash1v1QueueTournament(t),
    });
  }, [t]);

  const insufficientWallet = Boolean(
    isLoggedIn && !t.isRegistered && entryFeeInfo.isPaid && walletBalanceToman !== null && walletBalanceToman < entryFeeInfo.toman
  );

  const action = t.isRegistered
    ? { href: `/tournaments/${t.id}/lobby`, label: "ورود به لابی", tone: "from-green-600 to-emerald-600" }
    : ageBlocked
    ? {
        // Under-18 (or missing kyc fields) trying to enter a paid tournament
        // — bounce them to the profile page to complete their age-gate info,
        // or show a hard block if they really are under age.
        href: ageGate.ok || (ageGate as { code?: string }).code === "UNDERAGE" ? "#" : "/profile",
        label:
          !ageGate.ok && (ageGate as { code?: string }).code === "UNDERAGE"
            ? `فقط بالای ${MIN_ADULT_AGE.toLocaleString("fa-IR")} سال`
            : "تکمیل اطلاعات هویتی",
        tone: "from-slate-600 to-slate-700",
      }
    : insufficientWallet
    ? { href: "/wallet", label: "شارژ کیف پول", tone: "from-orange-600 to-red-600" }
    : { href: `/tournaments/${t.id}`, label: entryFeeInfo.isPaid ? "ثبت‌نام پولی" : "ثبت‌نام", tone: "from-purple-600 to-blue-600" };

  const formatTournamentDate = (dateStr: string | null) => {
    if (!dateStr) return "زمان نامشخص";
    const date = new Date(dateStr);
    return date.toLocaleString("fa-IR", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <TiltCard maxTilt={6} liftZ={14} scaleOnHover={1.015} className="rounded-[32px] mb-5">
      <div className="relative overflow-hidden rounded-[32px] bg-[#0f0f13] border border-white/8 shadow-2xl fx-card active:scale-[0.985] transition-transform">
        <div className="relative h-40 w-full">
          <div className="absolute inset-0" style={{ background: GAME_FALLBACK[t.game] || GAME_FALLBACK.clash_royale }} />
          {bannerUrl && <img src={bannerUrl} alt={t.name} className="absolute inset-0 w-full h-full object-cover opacity-60" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f13] via-black/30 to-black/10" />

          <div className="absolute bottom-4 left-5 right-5 text-right" style={{ transform: "translateZ(22px)" }}>
            <h3 className="text-[22px] leading-tight font-black en-font tracking-[-0.02em] text-white drop-shadow">
              {t.name}
            </h3>
          </div>

          <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-xl px-3.5 py-1.5 rounded-2xl border border-white/10" style={{ transform: "translateZ(30px)" }}>
            <span className="text-[10px] font-black text-white/90">
              {t.isRegistered ? "ثبت‌نام شده" : spotsLeft === 0 ? "ظرفیت تکمیل" : `${spotsLeft} نفر باقی‌مانده`}
            </span>
          </div>

          {t.isRegistered && (
            <div className="absolute top-4 left-4 bg-emerald-500/20 backdrop-blur-xl px-3 py-1 rounded-2xl border border-emerald-500/30 text-emerald-400 text-[10px] font-black">
              ✓ عضو هستید
            </div>
          )}
        </div>

        <div className="p-5 pt-4 space-y-4">
          {/* Prize Section */}
          <div className="bg-gradient-to-r from-yellow-500/10 to-transparent border border-yellow-500/20 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <div className="text-[10px] text-yellow-500/70 font-bold mb-0.5">
                {prizeData.isPaid ? "جایزه کل (طبق شرکت‌کنندگان • تقسیم تا نفر دهم)" : "جایزه کل مسابقات"}
              </div>
              <div className="font-black text-yellow-400 text-lg">
                {prizeData.displayPrizePool}
              </div>
              <div className="text-[10px] text-yellow-500/80 mt-0.5 font-medium leading-4">
                {prizeData.subtitle}
              </div>
            </div>
            <span className="text-3xl opacity-80 shrink-0">🏆</span>
          </div>

          {/* Date & Countdown */}
          <div className="grid grid-cols-1 gap-2.5">
            <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl flex items-center justify-between text-sm">
              <span className="text-gray-400">زمان شروع</span>
              <span className="font-bold text-white">{formatTournamentDate(t.startDate)}</span>
            </div>

            {countdown && (
              <div className={`p-3.5 rounded-2xl border flex items-center justify-between text-sm ${expired ? "bg-emerald-500/10 border-emerald-500/20" : "bg-purple-500/10 border-purple-500/20"}`}>
                <span className="text-gray-400">تا شروع</span>
                <span className={`font-black ${expired ? "text-emerald-400" : "text-purple-300"}`}>{countdown}</span>
              </div>
            )}
          </div>

          {insufficientWallet && !ageBlocked && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-2xl p-3 text-xs leading-5">
              موجودی کیف پول کافی نیست.
            </div>
          )}

          {ageBlocked && (
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-2xl p-3 text-xs leading-6">
              {!ageGate.ok && (ageGate as { code?: string }).code === "UNDERAGE"
                ? `شرکت در تورنومنت‌های پولی فقط برای کاربران بالای ${MIN_ADULT_AGE.toLocaleString("fa-IR")} سال مجاز است. می‌توانید در تورنومنت‌های رایگان شرکت کنید.`
                : "برای شرکت در تورنومنت‌های پولی باید تاریخ تولد و کد ملی خود را در پروفایل ثبت کنید."}
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between pt-1">
            <div className="text-right">
              <div className="font-black text-xl num-en tracking-tight">{t.entryFee || "رایگان"}</div>
              {entryFeeInfo.isPaid && <div className="text-[10px] text-gray-500 -mt-0.5">هزینه ورودی</div>}
            </div>

            <Link
              href={action.href}
              className={`px-7 py-3.5 rounded-2xl font-black text-sm flex items-center gap-2 active:scale-[0.985] transition-all bg-gradient-to-r ${action.tone} shadow-lg`}
            >
              {action.label}
              <span className="text-xs">←</span>
            </Link>
          </div>
        </div>
      </div>
    </TiltCard>
  );
};

export default memo(TournamentCardLuxury);
