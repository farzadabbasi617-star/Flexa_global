"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { botDeepLink } from "@/lib/telegram-bot-username";
import RoomFaqAccordion from "@/components/cod/RoomFaqAccordion";
import { codMatchSettingChips } from "@/lib/cod-match-settings-display";
import { codPlacementLabel as placementLabel } from "@/lib/cod-placement-label";

interface RoomEntry {
  id?: string;
  displayName: string;
  codUsername: string;
  status: string;
  checkedIn: boolean;
  rankPoints: number;
  rankTier: string;
  kills?: number | null;
  placement?: number | null;
  rewardRial?: string;
  resultStatus?: string;
}
interface RoomDetail {
  id: string;
  title: string;
  description: string | null;
  region: "global" | "garena";
  map: string;
  teamMode: "solo" | "duo" | "squad";
  perspective: string;
  status: string;
  capacity: number;
  entryFeeRial: string;
  serviceFeeRial: string;
  prizeBudgetRial: string;
  referralRateBps: number;
  prizeProjection?: {
    mode: "scaled" | "fixed";
    scalePercent: number;
    fillPercent: number;
    registeredCount: number;
    capacity: number;
    isFullPayout: boolean;
    meetsMinimum: boolean;
    showHeadlineAmounts: boolean;
    minimumPlayers: number;
    perKillCurrentRial: string;
    perKillFullRial: string;
    killLadderCurrent: { firstKillRial: string; divisor: number; minKillRial: string } | null;
    rows: Array<{ from: number; to: number; fullAmountRial: string; currentAmountRial: string; perPlayerRial: string }>;
    totalCurrentRial: string;
    totalFullRial: string;
  } | null;
  rewardConfig: { perKillRial?: string; participationRial?: string; maxKillsPerEntry?: number; maxTotalKills?: number; placementPayout?: "per_team"|"per_entry"; killLadder?: { firstKillRial: string; divisor: number; minKillRial: string } | null; placementRules?: Array<{ from: number; to: number; amountRial: string }> };
  minRankPoints: number;
  minCodLevel?: number;
  bannerImageUrl?: string | null;
  category?: string | null;
  matchSettings?: Record<string, unknown> | null;
  faq?: Array<{ question: string; answer: string }> | null;
  rules: string | null;
  rulesVersion: string;
  requiresRecording: boolean;
  roomCode: string | null;
  roomPassword: string | null;
  officialJoinUrl: string | null;
  checkInOpensAt: string | null;
  checkInClosesAt: string | null;
  credentialsRevealAt: string | null;
  startsAt: string;
  endsAt: string | null;
  credentialsVisible: boolean;
  credentialsHiddenReason?: string | null;
  credentialsHiddenMessage?: string | null;
  checkInAvailable: boolean;
  registeredCount: number;
  latestLobbyCheck: null | {
    status: string;
    matchedCount: number;
    unauthorizedCount: number;
    missingCheckedInCount: number;
    confidence: number;
    unauthorizedUsernames?: string[];
    missingCheckedInUsernames?: string[];
    createdAt: string;
  };
  myEntry: RoomEntry | null;
  staffRole: string | null;
  evidenceCount: number;
  entries: RoomEntry[];
}

function toman(value: string | null | undefined) {
  try { return (BigInt(value || "0") / BigInt(10)).toLocaleString("fa-IR"); } catch { return "۰"; }
}
function faDate(value: string | null) {
  if (!value) return "اعلام نشده";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(value));
}
function rankLabel(value: string) {
  return ({ rookie: "تازه‌وارد", bronze: "Bronze", silver: "Silver", gold: "Gold", pro: "Pro", ultra: "Ultra", legend: "Legend" } as Record<string,string>)[value] || value;
}
function telegramStartUrl(payload: string) {
  return botDeepLink(payload, process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME);
}

export default function CodRoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [evidence, setEvidence] = useState({ kind: "scoreboard", fileUrl: "" });
  const [report, setReport] = useState({ category: "cheat", accusedCodUsername: "", evidenceUrl: "", description: "" });
  const [wallet, setWallet] = useState<{ usableRial: string; usableToman: number } | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [tab, setTab] = useState<"about" | "room">("about");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/cod/rooms/${id}`, { cache: "no-store", credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "روم پیدا نشد");
      setRoom(data.room);
      setLive(Boolean(data.live));

    } catch (err) {
      setError(err instanceof Error ? err.message : "روم پیدا نشد");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    async function loadWallet() {
      if (!user || !room || !live) { setWallet(null); return; }
      let paid = false;
      try { paid = BigInt(room.entryFeeRial || "0") > BigInt(0); } catch { paid = false; }
      if (!paid) { setWallet(null); return; }
      setWalletLoading(true);
      try {
        const response = await fetch("/api/wallet/balance", { cache: "no-store", credentials: "include" });
        const data = await response.json();
        if (!cancelled && response.ok) setWallet({ usableRial: String(data.usableRial || "0"), usableToman: Number(data.usableToman || 0) });
      } catch {
        if (!cancelled) setWallet(null);
      } finally {
        if (!cancelled) setWalletLoading(false);
      }
    }
    loadWallet();
    return () => { cancelled = true; };
  }, [user, room, live]);

  async function action(path: string, body?: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/cod/rooms/${id}/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(body || {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "عملیات انجام نشد");
      setMessage(path === "join" ? "عضویت در روم ثبت شد." : path === "check-in" ? "حضور شما تأیید شد." : "مدرک با موفقیت ثبت شد.");
      if (path === "evidence") setEvidence((current) => ({ ...current, fileUrl: "" }));
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "عملیات انجام نشد"); }
    finally { setBusy(false); }
  }

  async function submitReport() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/cod/rooms/${id}/reports`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({
          category: report.category,
          accusedCodUsername: report.accusedCodUsername || null,
          evidenceUrl: report.evidenceUrl || null,
          description: report.description,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "ثبت گزارش انجام نشد");
      setMessage("گزارش تخلف ثبت شد و در صف بررسی ادمین قرار گرفت.");
      setReport({ category: "cheat", accusedCodUsername: "", evidenceUrl: "", description: "" });
    } catch (err) { setError(err instanceof Error ? err.message : "ثبت گزارش انجام نشد"); }
    finally { setBusy(false); }
  }

  if (loading || authLoading) return <div className="min-h-screen bg-[#060606] text-white grid place-items-center"><div className="text-5xl animate-pulse">🎯</div></div>;
  if (!room) return <div className="min-h-screen bg-[#060606] text-white grid place-items-center px-5"><div className="text-center"><div className="text-6xl mb-4">🔒</div><p>{error || "روم پیدا نشد"}</p><Link href="/cod-arena" className="inline-block mt-5 text-orange-300">بازگشت به COD Arena</Link></div></div>;

  const full = room.registeredCount >= room.capacity;
  const proj = room.prizeProjection || null;
  const settingChips = codMatchSettingChips(room.matchSettings);
  const hasKillReward = (() => {
    try {
      const ladder = room.rewardConfig.killLadder;
      return BigInt(ladder ? ladder.firstKillRial : room.rewardConfig.perKillRial || "0") > BigInt(0);
    } catch { return false; }
  })();
  const hasParticipationReward = (() => {
    try { return BigInt(room.rewardConfig.participationRial || "0") > BigInt(0); } catch { return false; }
  })();
  const faqEntries = Array.isArray(room.faq) ? room.faq : [];
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const canOperate = isAdmin || Boolean(room.staffRole);
  let paidRoom = false;
  try { paidRoom = BigInt(room.entryFeeRial || "0") > BigInt(0); } catch { paidRoom = false; }
  const codProfileBlocked = Boolean(user && live && paidRoom && user.codMobileId && user.codMobileUsername && user.codMobileStatus !== "verified");
  const identityBlocked = Boolean(user && live && paidRoom && (!user.birthDate || !user.nationalId));
  let walletInsufficient = false;
  try { walletInsufficient = Boolean(user && live && paidRoom && wallet && BigInt(wallet.usableRial || "0") < BigInt(room.entryFeeRial || "0")); } catch { walletInsufficient = false; }
  const codProfileStatusText = user?.codMobileStatus === "pending"
    ? "پروفایل کالاف شما در انتظار تأیید ادمین است. بعد از تأیید، پرداخت و عضویت در روم پولی فعال می‌شود."
    : user?.codMobileStatus === "rejected"
      ? "پروفایل کالاف شما رد شده است. UID و نام داخل بازی را اصلاح کن تا دوباره برای ادمین ارسال شود."
      : "برای روم پولی، مالکیت UID کالاف باید توسط ادمین تأیید شود.";

  return (
    <div className="min-h-screen bg-[#060606] text-white">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-7 sm:py-10 pb-24 lg:pb-10" dir="rtl">
        <Link href="/cod-arena" className="text-xs text-gray-500 hover:text-white">← بازگشت به COD Arena</Link>
        <section className="relative overflow-hidden rounded-[2.5rem] border border-orange-500/20 bg-gradient-to-br from-[#24160d] via-[#0d0d0d] to-black p-6 sm:p-9 mt-5">
          {room.bannerImageUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={room.bannerImageUrl} alt="" width={1280} height={543} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
              {/* Text sits directly on the art, so hold a consistent floor of
                  contrast rather than letting a bright banner wash it out. */}
              <div className="pointer-events-none absolute inset-0 bg-[#0d0d0d]/72" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-transparent to-[#0d0d0d]/60" />
            </>
          )}
          <div className="absolute -top-32 -left-24 w-80 h-80 bg-orange-500/15 rounded-full blur-3xl" />
          <div className="relative flex flex-col md:flex-row items-start justify-between gap-7">
            <div className="max-w-2xl">
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="rounded-full bg-orange-500/15 border border-orange-500/20 px-3 py-1 text-[10px] font-black text-orange-300">{room.region.toUpperCase()}</span>
                <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[10px] font-black">{room.teamMode.toUpperCase()} • {room.perspective.toUpperCase()}</span>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[10px] font-black text-emerald-300">{room.status}</span>
                {!live && <span className="rounded-full bg-purple-500/10 border border-purple-500/20 px-3 py-1 text-[10px] font-black text-purple-300">SHADOW BETA</span>}
              </div>
              <h1 className="text-3xl sm:text-5xl font-black leading-tight">{room.title}</h1>
              <p className="text-sm text-gray-400 leading-7 mt-4">{room.description || "کاستوم‌روم امن Call of Duty Mobile در Flexa"}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/35 p-5 min-w-52">
              <div className="text-[10px] text-gray-500">شروع روم</div><div className="font-black mt-1">{faDate(room.startsAt)}</div>
              <div className="mt-4 h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${Math.min(100, room.registeredCount / room.capacity * 100)}%` }} /></div>
              <div className="flex justify-between text-[10px] mt-2 text-gray-400"><span>{room.registeredCount.toLocaleString("fa-IR")} عضو</span><span>{room.capacity.toLocaleString("fa-IR")} ظرفیت</span></div>
            </div>
          </div>
        </section>

        {error && <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
        {message && <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">{message}</div>}

        {/* Two views over one room: "room" is everything you act on, "about" is
            everything you read before deciding to join. */}
        <div role="tablist" aria-label="بخش‌های روم" className="mt-6 flex gap-1 border-b border-white/10">
          {([["room", "روم"], ["about", "توضیحات"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`cod-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`cod-panel-${key}`}
              onClick={() => setTab(key)}
              className={`relative px-6 py-3 text-sm font-black transition-colors ${tab === key ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
            >
              {label}
              <span className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-opacity ${tab === key ? "bg-yellow-400 opacity-100" : "opacity-0"}`} />
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] gap-5 mt-6">
          <div className="space-y-5" role="tabpanel" id="cod-panel-about" aria-labelledby="cod-tab-about" hidden={tab !== "about"}>
            <section className="rounded-[2rem] border border-white/10 bg-white/[.025] p-5 sm:p-6">
              <h2 className="text-lg font-black">💰 فرمول جایزه و اقتصاد روم</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-5 text-center">
                <div className="rounded-2xl bg-black/30 p-3"><div className="text-[9px] text-gray-500">ورودی</div><div className="font-black text-sm mt-1">{BigInt(room.entryFeeRial) === BigInt(0) ? "رایگان" : `${toman(room.entryFeeRial)} ت`}</div></div>
                {hasKillReward && <div className="rounded-2xl bg-black/30 p-3"><div className="text-[9px] text-gray-500">{room.rewardConfig.killLadder ? "اولین Kill" : "هر Kill"}</div><div className="font-black text-sm mt-1 text-orange-300">{toman(proj && !proj.showHeadlineAmounts ? (proj.killLadderCurrent ? proj.killLadderCurrent.firstKillRial : proj.perKillCurrentRial) : (room.rewardConfig.killLadder ? room.rewardConfig.killLadder.firstKillRial : room.rewardConfig.perKillRial))} ت</div></div>}
                {hasParticipationReward && <div className="rounded-2xl bg-black/30 p-3"><div className="text-[9px] text-gray-500">جایزه حضور</div><div className="font-black text-sm mt-1">{toman(room.rewardConfig.participationRial)} ت</div></div>}
                <div className="rounded-2xl bg-black/30 p-3"><div className="text-[9px] text-gray-500">ظرفیت</div><div className="font-black text-sm mt-1">{room.capacity.toLocaleString("fa-IR")} نفر</div></div>
              </div>
              {proj && proj.rows.length > 0 && <div className="mt-5">
                {proj.mode === "scaled" && <div className={`rounded-2xl border p-4 mb-3 ${proj.isFullPayout ? "border-emerald-500/25 bg-emerald-500/10" : "border-amber-500/25 bg-amber-500/10"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <b className="text-xs">{proj.isFullPayout ? "ظرفیت تکمیل است — جایزه کامل پرداخت می‌شود" : "جایزه در صورت تکمیل ظرفیت"}</b>
                    {!proj.showHeadlineAmounts && <span className="shrink-0 rounded-full bg-black/40 px-3 py-1 text-[10px] font-black">{proj.scalePercent.toLocaleString("fa-IR")}٪</span>}
                  </div>
                  <p className="mt-2 text-[10px] leading-5 text-gray-300">
                    {proj.showHeadlineAmounts
                      ? `مبالغ زیر برای ظرفیت کامل (${proj.capacity.toLocaleString("fa-IR")} نفر) است. جایزه‌ی نهایی متناسب با تعداد شرکت‌کننده محاسبه می‌شود و با پر شدن روم به این سقف می‌رسد.`
                      : `مبالغ کامل برای ${proj.capacity.toLocaleString("fa-IR")} نفر اعلام شده‌اند. الان ${proj.registeredCount.toLocaleString("fa-IR")} نفر ثبت‌نام کرده‌اند، پس جایزه‌ی فعلی ${proj.scalePercent.toLocaleString("fa-IR")}٪ مبلغ اعلام‌شده است و با پر شدن روم بالا می‌رود.`}
                  </p>
                  <div className="mt-3 h-1.5 rounded-full bg-black/40 overflow-hidden"><div className="h-full bg-gradient-to-l from-amber-400 to-emerald-400 transition-all" style={{ width: `${Math.min(100, proj.fillPercent)}%` }} /></div>
                  <div className="mt-1.5 flex justify-between text-[9px] text-gray-400"><span>{proj.registeredCount.toLocaleString("fa-IR")} از {proj.capacity.toLocaleString("fa-IR")} نفر</span><span>{proj.fillPercent.toLocaleString("fa-IR")}٪ تکمیل</span></div>
                  {!proj.meetsMinimum && <p className="mt-2 text-[10px] font-black text-amber-200">حداقل {proj.minimumPlayers.toLocaleString("fa-IR")} نفر برای برگزاری روم لازم است؛ در غیر این صورت روم لغو و کل ورودی به کیف پول شما بازگردانده می‌شود.</p>}
                </div>}
                <div className="space-y-2">{proj.rows.map((row) => <div key={`${row.from}-${row.to}`} className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-4 py-3 text-xs">
                  <span>{placementLabel(row.from, row.to, room.teamMode)}</span>
                  <span className="text-left">
                    {!proj.isFullPayout && !proj.showHeadlineAmounts && <span className="text-[10px] text-gray-600 line-through block">{toman(row.fullAmountRial)}</span>}
                    <b>{toman(proj.showHeadlineAmounts ? row.fullAmountRial : row.currentAmountRial)} USDT</b>
                  </span>
                </div>)}</div>
              </div>}
              {room.rewardConfig.killLadder && <div className="mt-5 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                <div className="text-xs font-black text-orange-200">نردبان کاهشی Kill</div>
                <p className="mt-1 text-[10px] leading-5 text-gray-400">هر Kill نسبت به Kill قبلی تقسیم بر {room.rewardConfig.killLadder.divisor.toLocaleString("fa-IR")} می‌شود{BigInt(room.rewardConfig.killLadder.minKillRial || "0") > BigInt(0) ? ` و کمتر از ${toman(room.rewardConfig.killLadder.minKillRial)} USDT نمی‌شود` : ""}.</p>
                <div className="mt-3 flex flex-wrap gap-2">{[0,1,2,3].map((step) => {
                  let value = BigInt(proj?.killLadderCurrent?.firstKillRial ?? room.rewardConfig.killLadder!.firstKillRial);
                  for (let i = 0; i < step; i += 1) value = value / BigInt(room.rewardConfig.killLadder!.divisor);
                  const floorRial = BigInt(proj?.killLadderCurrent?.minKillRial ?? room.rewardConfig.killLadder!.minKillRial ?? "0");
                  if (value < floorRial) value = floorRial;
                  return <span key={step} className="rounded-xl bg-black/35 px-3 py-2 text-[10px]">Kill {(step + 1).toLocaleString("fa-IR")}: <b className="text-orange-300">{toman(value.toString())} ت</b></span>;
                })}</div>
              </div>}
              <p className="text-[10px] text-gray-600 leading-5 mt-4">کمیسیون معرفی فقط درصدی از کارمزد خدمات Flexa است؛ بودجه جایزه بازیکنان دست‌نخورده می‌ماند.</p>
            </section>

            {settingChips.length > 0 && <section className="rounded-[2rem] border border-white/10 bg-white/[.025] p-5 sm:p-6">
              <h2 className="text-lg font-black">⚙️ تنظیمات بازی</h2>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {settingChips.map((chip) => (
                  <div key={chip.key} className={`rounded-2xl border p-3 ${chip.emphasis ? "border-orange-400/25 bg-orange-500/[.07]" : "border-white/10 bg-black/25"}`}>
                    <div className="text-[9px] text-gray-500">{chip.label}</div>
                    <div className={`mt-1 text-xs font-black ${chip.emphasis ? "text-orange-200" : "text-white"}`}>{chip.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[9px]">
                <span className="rounded-full bg-white/5 px-3 py-1">مپ: {room.map}</span>
                <span className="rounded-full bg-white/5 px-3 py-1">{room.perspective.toUpperCase()}</span>
                {room.minCodLevel ? <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-200">حداقل لول اکانت کالاف: {room.minCodLevel.toLocaleString("fa-IR")}</span> : null}
              </div>
            </section>}

            <section className="rounded-[2rem] border border-white/10 bg-white/[.025] p-5 sm:p-6">
              <h2 className="text-lg font-black">🛡️ قوانین و مدرک ضدچیت</h2>
              <div className="mt-4 whitespace-pre-line text-xs text-gray-300 leading-7">{room.rules || "استفاده از چیت، تبانی، جعل نتیجه و ورود با UID غیر از پروفایل ممنوع است. تمام بازیکنان باید از شروع Lobby تا نمایش Scoreboard رکورد قابل بررسی داشته باشند."}</div>
              <div className="mt-4 flex flex-wrap gap-2 text-[9px]"><span className="rounded-full bg-white/5 px-3 py-1">نسخه قوانین: {room.rulesVersion}</span><span className="rounded-full bg-white/5 px-3 py-1">رکورد: {room.requiresRecording ? "الزامی" : "اختیاری"}</span><span className="rounded-full bg-white/5 px-3 py-1">حداقل RP: {room.minRankPoints.toLocaleString("fa-IR")}</span></div>
            </section>

            {faqEntries.length > 0 && <section className="rounded-[2rem] border border-white/10 bg-white/[.025] p-5 sm:p-6">
              <h2 className="text-lg font-black mb-4">❓ سوالات پرتکرار</h2>
              <RoomFaqAccordion entries={faqEntries} />
            </section>}
          </div>

          <div className="space-y-5" role="tabpanel" id="cod-panel-room" aria-labelledby="cod-tab-room" hidden={tab !== "room"}>
            <section className="rounded-[2rem] border border-white/10 bg-white/[.025] p-5 sm:p-6">
              <h2 className="text-lg font-black">🗓️ زمان‌بندی روم</h2>
              <div className="mt-4 space-y-3">
                {([
                  ["باز شدن Check-in", room.checkInOpensAt, "از این ساعت باید حضورت را تأیید کنی"],
                  ["نمایش کد و پسورد روم", room.credentialsRevealAt, "فقط برای کسانی که Check-in کرده‌اند"],
                  ["بسته شدن Check-in", room.checkInClosesAt, "بعد از این ساعت جایگاهت آزاد می‌شود"],
                  ["شروع بازی", room.startsAt, "راس این ساعت داخل بازی باش"],
                ] as const).map(([label, value, hint]) => (
                  <div key={label} className="flex items-start gap-3 rounded-2xl bg-black/25 p-3">
                    <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black">{label}</div>
                      <div className="mt-0.5 text-[10px] text-gray-400">{faDate(value)}</div>
                      <div className="mt-1 text-[10px] text-gray-600">{hint}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[9px]">
                <span className="rounded-full bg-white/5 px-3 py-1">وضعیت: {room.status}</span>
                <span className="rounded-full bg-white/5 px-3 py-1">{room.registeredCount.toLocaleString("fa-IR")} از {room.capacity.toLocaleString("fa-IR")} نفر</span>
                <span className="rounded-full bg-white/5 px-3 py-1">رکورد: {room.requiresRecording ? "الزامی" : "اختیاری"}</span>
              </div>
            </section>

            {!room.myEntry && !canOperate && (
              <section className="rounded-[2rem] border border-white/10 bg-white/[.02] p-5 sm:p-6">
                <h2 className="text-sm font-black">بعد از عضویت اینجا فعال می‌شود</h2>
                <ul className="mt-3 space-y-2 text-[11px] leading-6 text-gray-400">
                  <li>• دکمه Check-in برای تأیید حضور</li>
                  <li>• کد و پسورد روم در زمان اعلام‌شده</li>
                  <li>• ثبت مدرک (Scoreboard و رکورد بازی)</li>
                  <li>• گزارش تخلف در صورت مشاهده چیت یا تبانی</li>
                </ul>
              </section>
            )}

            {canOperate && <section className="rounded-[2rem] border border-cyan-500/20 bg-cyan-950/10 p-5 sm:p-6">
              <h2 className="text-lg font-black">🤖 بررسی هوشمند Lobby</h2>
              <p className="text-[10px] text-gray-500 mt-2 leading-5">Roomer/Spectator قبل از استارت، اسکرین‌شات لیست بازیکنان لابی را در تلگرام می‌فرستد. AI نام‌ها را با کاربران ثبت‌نام/پرداخت‌شده و Check-in شده مقایسه می‌کند تا کد لو رفته یا اکانت اضافی شناسایی شود.</p>
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <a href={telegramStartUrl(`codL_${room.id}`)} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-cyan-500 text-black px-5 py-3 text-xs font-black">ارسال اسکرین‌شات لابی در تلگرام</a>
                {room.latestLobbyCheck && <span className={`rounded-xl px-4 py-3 text-xs font-black ${room.latestLobbyCheck.status === "verified" ? "bg-emerald-500/10 text-emerald-300" : room.latestLobbyCheck.status === "flagged" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300"}`}>آخرین بررسی: {room.latestLobbyCheck.status} • Match {room.latestLobbyCheck.matchedCount} • غیرمجاز {room.latestLobbyCheck.unauthorizedCount}</span>}
              </div>
              {room.latestLobbyCheck?.unauthorizedUsernames?.length ? <div className="mt-3 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-200">غیرمجازها: {room.latestLobbyCheck.unauthorizedUsernames.slice(0, 8).join("، ")}</div> : null}
            </section>}

            {(room.myEntry || canOperate) && <section className="rounded-[2rem] border border-purple-500/20 bg-purple-950/10 p-5 sm:p-6">
              <h2 className="text-lg font-black">📎 ثبت مدرک</h2>
              <p className="text-[10px] text-gray-500 mt-2 leading-5">برای جلوگیری از فشار روی سایت، عکس/ویدیو/فایل مدرک را در تلگرام ارسال کن. Flexa فقط شناسه فایل تلگرام را ذخیره می‌کند. اگر مدرک از قبل لینک HTTPS دارد، می‌توانی لینک را دستی ثبت کنی.</p>
              <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2 mt-4">
                <select value={evidence.kind} onChange={(e) => setEvidence({ ...evidence, kind: e.target.value })} className="rounded-xl bg-black/40 border border-white/10 px-3 py-3 text-xs"><option value="scoreboard">Scoreboard</option><option value="recording">رکورد بازیکن</option>{canOperate && <option value="lobby_recording">رکورد Lobby</option>}<option value="dispute">مدرک اعتراض</option></select>
                <a href={telegramStartUrl(`codE_${room.id}_${evidence.kind}`)} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-purple-600 px-4 py-3 text-center text-xs font-black text-white hover:bg-purple-500">ارسال فایل در تلگرام</a>
                <button onClick={() => action("evidence", evidence)} disabled={busy || !evidence.fileUrl.startsWith("https://")} className="rounded-xl border border-purple-400/30 px-4 py-3 text-xs font-black text-purple-200 disabled:opacity-40">ثبت لینک HTTPS</button>
                <input value={evidence.fileUrl} onChange={(e) => setEvidence({ ...evidence, fileUrl: e.target.value })} dir="ltr" placeholder="اختیاری: لینک HTTPS مدرک را دستی وارد کن" className="sm:col-span-3 rounded-xl bg-black/40 border border-white/10 px-3 py-3 text-xs outline-none focus:border-purple-400" />
              </div>
              {canOperate && <div className="text-[10px] text-purple-300 mt-3">مدارک ثبت‌شده روم: {room.evidenceCount.toLocaleString("fa-IR")}</div>}
            </section>}

            {(room.myEntry || canOperate) && <section className="rounded-[2rem] border border-red-500/20 bg-red-950/10 p-5 sm:p-6">
              <h2 className="text-lg font-black">🚨 گزارش تخلف روم</h2>
              <p className="text-[10px] text-gray-500 mt-2 leading-5">برای چیت، تیم‌آپ، نداشتن رکورد، آیتم ممنوع یا نتیجه اشتباه گزارش ثبت کن. گزارش‌ها در پنل ادمین بررسی و در صورت نیاز اخطار/جریمه/بن اعمال می‌شود.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                <select value={report.category} onChange={(e) => setReport({ ...report, category: e.target.value })} className="rounded-xl bg-black/40 border border-white/10 px-3 py-3 text-xs">
                  <option value="cheat">چیت / هک</option><option value="teaming">تیم‌آپ</option><option value="no_recording">نداشتن رکورد</option><option value="banned_item">آیتم ممنوع</option><option value="toxic_behavior">رفتار/فحاشی</option><option value="wrong_result">نتیجه اشتباه</option><option value="no_show">No-show</option><option value="other">سایر</option>
                </select>
                <input value={report.accusedCodUsername} onChange={(e) => setReport({ ...report, accusedCodUsername: e.target.value })} dir="ltr" placeholder="نام داخل بازی متخلف / اختیاری" className="rounded-xl bg-black/40 border border-white/10 px-3 py-3 text-xs outline-none focus:border-red-400" />
                <a href={telegramStartUrl(`codR_${room.id}_${report.category}`)} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-red-500 px-3 py-3 text-center text-xs font-black text-black hover:bg-red-400">ارسال فایل گزارش در تلگرام</a>
                <input value={report.evidenceUrl} onChange={(e) => setReport({ ...report, evidenceUrl: e.target.value })} dir="ltr" placeholder="اختیاری: لینک HTTPS مدرک" className="rounded-xl bg-black/40 border border-white/10 px-3 py-3 text-xs outline-none focus:border-red-400" />
                <textarea value={report.description} onChange={(e) => setReport({ ...report, description: e.target.value })} rows={4} placeholder="اگر فایل را از تلگرام می‌فرستی، توضیح را در کپشن تلگرام بنویس. اگر اینجا ثبت می‌کنی، توضیح دقیق اتفاق را بنویس..." className="sm:col-span-2 rounded-xl bg-black/40 border border-white/10 px-3 py-3 text-xs outline-none focus:border-red-400" />
              </div>
              <button onClick={submitReport} disabled={busy || report.description.trim().length < 10 || Boolean(report.evidenceUrl && !report.evidenceUrl.startsWith("https://"))} className="mt-4 rounded-xl border border-red-400/30 px-5 py-3 text-xs font-black text-red-200 disabled:opacity-40">ثبت گزارش متنی/لینکی در سایت</button>
            </section>}
          </div>

          <div className="space-y-5">
            {!room.myEntry ? <section id="cod-join-card" className="rounded-[2rem] border border-orange-500/20 bg-orange-950/10 p-5 sm:p-6 sticky top-4 scroll-mt-24">
              <h2 className="text-xl font-black">عضویت در روم</h2>
              {!user ? <><p className="text-xs text-gray-400 leading-6 mt-3">برای ثبت UID، پذیرش قوانین و عضویت باید وارد حساب Flexa شوی.</p><Link href={`/login?next=/cod-arena/${room.id}`} className="block text-center rounded-2xl bg-orange-500 text-black py-3.5 font-black text-sm mt-5">ورود به حساب</Link></> : <>
                {(!user.codMobileId || !user.codMobileUsername) && <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300 mt-4">UID و نام داخل بازی کالاف ناقص است. <Link href="/profile/edit" className="underline font-black">تکمیل پروفایل</Link></div>}
                {user.codMobileRegion !== room.region && <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300 mt-4">ریجن پروفایل شما {user.codMobileRegion?.toUpperCase()} است ولی این روم {room.region.toUpperCase()} است.</div>}
                {codProfileBlocked && <div className={`rounded-xl border p-3 text-xs mt-4 ${user.codMobileStatus === "rejected" ? "bg-red-500/10 border-red-500/20 text-red-300" : "bg-amber-500/10 border-amber-500/20 text-amber-300"}`}>{codProfileStatusText} <Link href="/profile/edit" className="underline font-black">ویرایش پروفایل کالاف</Link></div>}
                {identityBlocked && <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300 mt-4">برای پرداخت و شرکت در روم پولی، تاریخ تولد و کد ملی باید در پروفایل کامل باشد. <Link href="/profile/edit" className="underline font-black">تکمیل اطلاعات هویتی</Link></div>}
                {paidRoom && live && user.codMobileStatus === "verified" && !identityBlocked && <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-300 mt-4">مالکیت UID کالاف شما تأیید شده است و می‌توانید در روم پولی عضو شوید.</div>}
                {paidRoom && live && <div className={`rounded-xl border p-3 text-xs mt-4 ${walletInsufficient ? "bg-red-500/10 border-red-500/20 text-red-300" : "bg-black/25 border-white/10 text-gray-300"}`}><div>موجودی قابل استفاده کیف پول: <b>{walletLoading ? "در حال بررسی..." : `${(wallet?.usableToman || 0).toLocaleString("fa-IR")} USDT`}</b></div>{walletInsufficient && <div className="mt-2">موجودی برای پرداخت ورودی کافی نیست. <Link href="/wallet" className="underline font-black">شارژ کیف پول</Link></div>}</div>}
                <label className="flex gap-3 items-start mt-5 text-xs leading-6 text-gray-300"><input type="checkbox" checked={rulesAccepted} onChange={(e) => setRulesAccepted(e.target.checked)} className="mt-1 accent-orange-500" /><span>قوانین نسخه {room.rulesVersion}، سیاست No-show، ضبط مدرک و داوری Flexa را می‌پذیرم.</span></label>
                <button onClick={() => action("join", { rulesAccepted })} disabled={busy || full || !rulesAccepted || !user.codMobileId || !user.codMobileUsername || user.codMobileRegion !== room.region || codProfileBlocked || identityBlocked || walletLoading || walletInsufficient} className="w-full rounded-2xl bg-gradient-to-l from-orange-500 to-red-600 text-black py-3.5 font-black text-sm mt-5 disabled:opacity-40">{busy ? "در حال ثبت..." : full ? "ظرفیت تکمیل است" : codProfileBlocked ? "در انتظار تأیید UID کالاف" : identityBlocked ? "تکمیل اطلاعات هویتی لازم است" : walletInsufficient ? "موجودی کیف پول کافی نیست" : "پرداخت و عضویت"}</button>
              </>}
            </section> : <section className="rounded-[2rem] border border-emerald-500/20 bg-emerald-950/10 p-5 sm:p-6 sticky top-4">
              <div className="flex items-center justify-between"><h2 className="text-xl font-black">عضویت ثبت شده ✅</h2><span className="text-[9px] rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">{room.myEntry.status}</span></div>
              <div className="mt-4 rounded-2xl bg-black/25 p-4 text-xs"><div className="text-gray-500">نام داخل بازی</div><div className="font-black mt-1" dir="ltr">{room.myEntry.codUsername}</div></div>
              {!room.myEntry.checkedIn && <button onClick={() => action("check-in")} disabled={busy || !room.checkInAvailable} className="w-full rounded-2xl bg-emerald-500 text-black py-3.5 font-black text-sm mt-4 disabled:opacity-40">{room.checkInAvailable ? "✅ Check-in و تأیید حضور" : "Check-in هنوز باز نیست"}</button>}
              {room.myEntry.checkedIn && <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center text-sm font-black text-emerald-300 mt-4">حضور تأیید شده</div>}
              <div className="mt-5 border-t border-white/5 pt-5">
                <h3 className="font-black text-sm">اطلاعات ورود</h3>
                {room.credentialsVisible ? <div className="space-y-3 mt-3"><div className="rounded-xl bg-black/35 p-3"><span className="text-[9px] text-gray-500">Room Code</span><div className="font-mono text-xl font-black mt-1" dir="ltr">{room.roomCode || "اعلام نشده"}</div></div><div className="rounded-xl bg-black/35 p-3"><span className="text-[9px] text-gray-500">Password</span><div className="font-mono text-xl font-black mt-1" dir="ltr">{room.roomPassword || "ندارد"}</div></div>{room.officialJoinUrl && <a href={room.officialJoinUrl} target="_blank" rel="noopener noreferrer" className="block text-center rounded-xl bg-orange-500 text-black py-3 font-black text-xs">بازکردن مستقیم Call of Duty Mobile</a>}</div> : <div className="mt-3">
                  {/* Say precisely why the code is withheld: "pay first" and
                      "check in first" need different actions from the player. */}
                  <p className="text-xs leading-6 text-gray-400">{room.credentialsHiddenMessage || "پس از Check-in، اطلاعات ورود نمایش داده می‌شود."}</p>
                  {room.credentialsHiddenReason === "too_early" && (
                    <p className="mt-2 text-[10px] text-gray-500">زمان نمایش: {faDate(room.credentialsRevealAt)}</p>
                  )}
                  {room.credentialsHiddenReason === "not_paid" && (
                    <Link href="/wallet" className="mt-2 inline-block text-[11px] font-black text-orange-300">بررسی کیف پول ←</Link>
                  )}
                </div>}
              </div>
            </section>}

            {(room.entries.length > 0) && <section className="rounded-[2rem] border border-white/10 bg-white/[.025] p-5">
              <div className="flex items-center justify-between"><h2 className="font-black">بازیکنان روم</h2><span className="text-[10px] text-gray-500">{room.entries.length.toLocaleString("fa-IR")}</span></div>
              <div className="space-y-2 mt-4 max-h-96 overflow-y-auto">{room.entries.map((entry, index) => <div key={`${entry.codUsername}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-3 py-3"><div className="min-w-0"><div className="text-xs font-black truncate">{entry.displayName}</div><div className="text-[9px] text-gray-500 truncate" dir="ltr">{entry.codUsername}</div></div><div className="text-left shrink-0"><div className="text-[9px] text-orange-300">{rankLabel(entry.rankTier)}</div><div className="text-[8px] text-gray-600">{entry.rankPoints.toLocaleString("fa-IR")} RP</div></div></div>)}</div>
            </section>}
          </div>
        </div>
      </main>
      {/* On mobile the join card sits below a long description, so mirror the
          primary action in a docked bar the way the reference apps do. It sits
          above BottomNav and is hidden once the player has already joined. */}
      {!room.myEntry && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#060606]/95 px-4 pt-3 backdrop-blur-sm lg:hidden"
          style={{ paddingBottom: "calc(var(--bottom-nav-space) + 12px)" }}
        >
          <button
            type="button"
            onClick={() => {
              document.getElementById("cod-join-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            disabled={full}
            className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-yellow-400 py-4 text-sm font-black text-black disabled:bg-white/10 disabled:text-gray-500"
          >
            <span aria-hidden="true">‹</span>
            {full ? "ظرفیت تکمیل است" : "شرکت کنید"}
          </button>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
