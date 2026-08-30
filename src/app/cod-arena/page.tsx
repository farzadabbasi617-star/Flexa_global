"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import InviteFriendCard from "@/components/referrals/InviteFriendCard";

interface CodRankRow {
  displayName: string;
  avatarUrl: string | null;
  codUsername: string;
  points: number;
  tier: string;
  verifiedRooms: number;
  totalKills: number;
  wins: number;
}

interface CodRoomListItem {
  id: string;
  title: string;
  description: string | null;
  region: "global" | "garena";
  map: string;
  teamMode: "solo" | "duo" | "squad";
  perspective: string;
  status: string;
  capacity: number;
  registeredCount: number;
  entryFeeRial: string;
  serviceFeeRial: string;
  prizeBudgetRial: string;
  rewardConfig: {
    perKillRial?: string;
    killLadder?: { firstKillRial: string; divisor: number; minKillRial: string } | null;
    placementPayout?: "per_team" | "per_entry";
    placementRules?: Array<{ from: number; to: number; amountRial: string }>;
  };
  minRankPoints: number;
  minCodLevel?: number;
  prizeScaling?: { mode?: "scaled" | "fixed"; fullPayoutAtBps?: number; minimumViableBps?: number } | null;
  bannerImageUrl?: string | null;
  category?: string | null;
  originalEntryFeeRial?: string | null;
  requiresRecording: boolean;
  startsAt: string;
  checkInOpensAt: string | null;
}

const statusLabel: Record<string, string> = {
  draft: "پیش‌نویس",
  registration: "ثبت‌نام باز",
  check_in: "Check-in",
  lobby_open: "Lobby باز",
  in_progress: "در حال اجرا",
  settling: "در حال داوری",
  completed: "تکمیل‌شده",
  cancelled: "لغوشده",
};
const modeLabel = { solo: "Solo", duo: "Duo", squad: "Squad" };

function toman(rial: string | number | null | undefined) {
  try { return (BigInt(String(rial || 0)) / BigInt(10)).toLocaleString("fa-IR"); } catch { return "۰"; }
}

function relativeStart(value: string) {
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "شروع شده";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes.toLocaleString("fa-IR")} دقیقه دیگر`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours.toLocaleString("fa-IR")} ساعت دیگر`;
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(value));
}

function CodRoomCard({ room }: { room: CodRoomListItem }) {
                const full = room.registeredCount >= room.capacity;
  const remaining = Math.max(0, room.capacity - room.registeredCount);
  const scaledPrizes = room.prizeScaling?.mode !== "fixed";
  const fullPayoutAtBps = Number(room.prizeScaling?.fullPayoutAtBps ?? 10_000);
  const fillBps = Math.floor((Math.min(room.registeredCount, room.capacity) * 10_000) / Math.max(1, room.capacity));
  const prizePercent = !scaledPrizes || fillBps >= fullPayoutAtBps
    ? 100
    : Math.round(fillBps / fullPayoutAtBps * 100);
  let discounted = false;
  try { discounted = Boolean(room.originalEntryFeeRial) && BigInt(room.originalEntryFeeRial!) > BigInt(room.entryFeeRial); } catch { discounted = false; }
  const ladder = room.rewardConfig?.killLadder;
  const perKill = BigInt(ladder?.firstKillRial || room.rewardConfig?.perKillRial || "0");
  return (
    <article key={room.id} className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#18130f] via-[#0d0d0d] to-black p-5 sm:p-6 hover:border-orange-400/30 transition">
      <div className="absolute -top-20 -left-20 w-52 h-52 rounded-full bg-orange-500/10 blur-3xl group-hover:bg-orange-500/15 transition" />
      {room.bannerImageUrl && (
        <div className="relative -mx-5 -mt-5 sm:-mx-6 sm:-mt-6 mb-5 h-32 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={room.bannerImageUrl} alt="" width={640} height={272} loading="lazy" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d]/40 to-transparent" />
          <div className="absolute bottom-2 right-4 left-4 flex items-end justify-between gap-3">
            <span className="text-lg font-black drop-shadow-lg">{room.title}</span>
            {remaining > 0 && <span className="shrink-0 rounded-full bg-black/60 px-3 py-1 text-[9px] font-black text-orange-200">{remaining.toLocaleString("fa-IR")} نفر باقی مانده</span>}
          </div>
        </div>
      )}
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <span className="rounded-full bg-orange-500/15 border border-orange-500/20 px-3 py-1 text-[9px] font-black text-orange-300">{room.region.toUpperCase()}</span>
            <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[9px] font-black text-gray-300">{modeLabel[room.teamMode]} • {room.perspective.toUpperCase()}</span>
          </div>
          <span className="text-[9px] font-black text-emerald-300">{statusLabel[room.status] || room.status}</span>
        </div>
        {!room.bannerImageUrl && <h3 className="text-xl font-black mt-5 leading-7">{room.title}</h3>}
        <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-6">{room.description || `${room.map} • کاستوم‌روم امن Flexa`}</p>
        <div className="grid grid-cols-3 gap-2 mt-5 text-center">
          <div className="rounded-2xl bg-black/35 border border-white/5 p-3"><div className="text-[9px] text-gray-500">ورودی</div>{discounted && <div className="text-[9px] text-gray-600 line-through">{toman(room.originalEntryFeeRial)} ت</div>}<div className={`text-xs font-black ${discounted ? "" : "mt-1"}`}>{BigInt(room.entryFeeRial) === BigInt(0) ? "رایگان" : `${toman(room.entryFeeRial)} ت`}</div></div>
          <div className="rounded-2xl bg-black/35 border border-white/5 p-3"><div className="text-[9px] text-gray-500">{ladder ? "اولین Kill" : "هر Kill"}</div><div className="text-xs font-black mt-1 text-orange-300">{perKill === BigInt(0) ? "—" : `${toman(perKill.toString())} ت`}</div></div>
          <div className="rounded-2xl bg-black/35 border border-white/5 p-3"><div className="text-[9px] text-gray-500">ظرفیت</div><div className="text-xs font-black mt-1">{room.registeredCount.toLocaleString("fa-IR")}/{room.capacity.toLocaleString("fa-IR")}</div></div>
        </div>
        <div className="mt-5 h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-gradient-to-l from-yellow-400 to-orange-600" style={{ width: `${Math.min(100, (room.registeredCount / room.capacity) * 100)}%` }} /></div>
        <div className="flex items-center justify-between mt-5">
          <div className="text-[10px] text-gray-400"><span className="text-orange-300 font-black">⏱ {relativeStart(room.startsAt)}</span><br /><span>{room.map}</span>{scaledPrizes && prizePercent < 100 && <span className="mt-1 block text-amber-300 font-black">{room.registeredCount === 0 ? "جایزه مشروط به تکمیل ظرفیت" : `جایزه فعلی ${prizePercent.toLocaleString("fa-IR")}٪ — با تکمیل ظرفیت ۱۰۰٪`}</span>}</div>
          <Link href={`/cod-arena/${room.id}`} className={`rounded-2xl px-5 py-3 text-xs font-black ${full ? "bg-white/5 text-gray-500" : "bg-orange-500 text-black"}`}>{full ? "ظرفیت تکمیل" : "جزئیات و عضویت"}</Link>
        </div>
      </div>
    </article>
  );
}

export default function CodArenaPage() {
  const [rooms, setRooms] = useState<CodRoomListItem[]>([]);
  const [ranks, setRanks] = useState<CodRankRow[]>([]);
  const [region, setRegion] = useState<"all" | "global" | "garena">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = region === "all" ? "" : `?region=${region}`;
      const rankRegion = region === "garena" ? "garena" : "global";
      const [response, rankResponse] = await Promise.all([
        fetch(`/api/cod/rooms${query}`, { cache: "no-store" }),
        fetch(`/api/cod/ranks?region=${rankRegion}&limit=10`, { cache: "no-store" }),
      ]);
      const data = await response.json();
      const rankData = await rankResponse.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "روم‌ها دریافت نشد");
      setRooms(Array.isArray(data.rooms) ? data.rooms : []);
      setRanks(rankResponse.ok && Array.isArray(rankData.ranks) ? rankData.ranks : []);

    } catch (err) {
      setError(err instanceof Error ? err.message : "روم‌ها دریافت نشد");
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => { load(); }, [load]);

  const activeCount = useMemo(() => rooms.filter((room) => !["completed", "cancelled"].includes(room.status)).length, [rooms]);

  // Rooms are grouped into named shelves ("100 players", "budget", "kill race")
  // so a long list stays scannable. Rooms without a category fall into one
  // trailing shelf rather than disappearing.
  const groupedRooms = useMemo(() => {
    const shelves = new Map<string, CodRoomListItem[]>();
    for (const room of rooms) {
      const key = room.category?.trim() || "سایر روم‌ها";
      const bucket = shelves.get(key);
      if (bucket) bucket.push(room);
      else shelves.set(key, [room]);
    }
    return [...shelves.entries()]
      .map(([category, items]) => ({ category, rooms: items }))
      .sort((a, b) => (a.category === "سایر روم‌ها" ? 1 : b.category === "سایر روم‌ها" ? -1 : 0));
  }, [rooms]);

  return (
    <div className="min-h-screen bg-[#060606] text-white overflow-x-hidden">
      <Navbar />
      <main style={{ paddingBottom: "var(--bottom-nav-space)" }}>
        <section className="relative overflow-hidden border-b border-orange-500/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(249,115,22,.28),transparent_38%),radial-gradient(circle_at_10%_40%,rgba(234,179,8,.12),transparent_35%)]" />
          <div className="absolute inset-0 opacity-[.06] bg-[linear-gradient(90deg,#fff_1px,transparent_1px),linear-gradient(#fff_1px,transparent_1px)] bg-[size:34px_34px]" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20" dir="rtl">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-10">
              <div className="max-w-3xl text-right">
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/10 px-4 py-2 text-[10px] font-black text-orange-200 mb-5">
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                  COD ARENA LIVE
                </div>
                <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.12]">
                  Flexa <span className="text-transparent bg-clip-text bg-gradient-to-l from-yellow-300 via-orange-400 to-red-500">COD Arena</span>
                </h1>
                <p className="mt-5 text-sm sm:text-lg leading-8 text-gray-300 max-w-2xl">
                  کاستوم‌روم‌های Call of Duty Mobile برای Global و Garena؛ با Check-in امن، جایزه قابل‌تنظیم Kill و جایگاه، زنجیره مدرک ضدچیت و تسویه شفاف.
                </p>
                <div className="flex flex-wrap gap-3 mt-7">
                  <a href="#rooms" className="rounded-2xl bg-gradient-to-l from-orange-500 to-red-600 px-6 py-3.5 font-black text-sm shadow-[0_12px_35px_rgba(249,115,22,.25)]">مشاهده روم‌ها</a>
                  <Link href="/profile/edit" className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3.5 font-black text-sm">ثبت UID و ریجن</Link>
                </div>
              </div>
              <div className="relative w-56 h-56 sm:w-72 sm:h-72 shrink-0">
                <div className="absolute inset-0 rounded-full bg-orange-500/20 blur-3xl" />
                <div className="relative h-full rounded-[3rem] border border-orange-400/20 bg-black/45 backdrop-blur-xl grid place-items-center shadow-2xl rotate-3">
                  <img src="/icons/icon-cod_mobile.png" alt="Call of Duty Mobile" className="w-36 h-36 sm:w-44 sm:h-44 object-contain drop-shadow-[0_0_30px_rgba(249,115,22,.35)]" />
                  <div className="absolute bottom-5 left-5 right-5 flex justify-between text-[9px] font-black text-gray-400">
                    <span>{activeCount.toLocaleString("fa-IR")} ROOM</span><span>GLOBAL • GARENA</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="rooms" className="max-w-6xl mx-auto px-4 sm:px-6 py-10" dir="rtl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-7">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black">روم‌های عملیاتی</h2>
              <p className="text-xs text-gray-500 mt-2">ظرفیت، فرمول جایزه و زمان ورود قبل از ثبت‌نام کاملاً مشخص است.</p>
            </div>
            <div className="flex rounded-2xl bg-[#111] border border-white/10 p-1">
              {(["all", "global", "garena"] as const).map((item) => (
                <button key={item} onClick={() => setRegion(item)} className={`px-4 py-2 rounded-xl text-xs font-black transition ${region === item ? "bg-orange-500 text-black" : "text-gray-400"}`}>
                  {item === "all" ? "همه" : item.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 mb-6">{error}</div>}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{[1,2,3,4].map((x) => <div key={x} className="h-72 rounded-[2rem] bg-white/5 animate-pulse" />)}</div>
          ) : rooms.length === 0 ? (
            <div className="rounded-[2.5rem] border border-orange-500/15 bg-gradient-to-br from-orange-950/20 to-black p-10 sm:p-14 text-center">
              <div className="text-6xl mb-5">🎯</div>
              <h3 className="text-2xl font-black">اولین روم COD Arena در حال آماده‌سازی است</h3>
              <p className="text-sm text-gray-400 leading-7 mt-3 max-w-xl mx-auto">به‌زودی روم‌های جدید کالاف با Check-in امن، بررسی لابی و تسویه جایزه فعال می‌شوند.</p>
            </div>
          ) : (
            <div className="space-y-10">
              {groupedRooms.map((shelf) => (
                <div key={shelf.category}>
                  {groupedRooms.length > 1 && (
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <h3 className="text-lg sm:text-xl font-black">{shelf.category}</h3>
                      <span className="text-[10px] font-black text-gray-500">{shelf.rooms.length.toLocaleString("fa-IR")} روم</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {shelf.rooms.map((room) => <CodRoomCard key={room.id} room={room} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-10" dir="rtl">
          <div className="flex items-end justify-between gap-4 mb-5"><div><h2 className="text-2xl font-black">لیدربرد COD Arena</h2><p className="text-xs text-gray-500 mt-2">فقط نتیجه تأییدشده امتیاز می‌سازد.</p></div><span className="text-[10px] font-black text-orange-300">{region === "garena" ? "GARENA" : "GLOBAL"}</span></div>
          {ranks.length === 0 ? <div className="rounded-3xl border border-white/5 bg-white/[.02] p-8 text-center text-sm text-gray-500">اولین روم‌های تأییدشده، لیدربرد واقعی را می‌سازند.</div> : <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{ranks.map((rank,index)=><div key={`${rank.codUsername}-${index}`} className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[.025] px-4 py-3"><div className="flex items-center gap-3 min-w-0"><span className={`w-8 h-8 rounded-xl grid place-items-center font-black text-xs ${index<3?"bg-orange-500 text-black":"bg-white/5 text-gray-400"}`}>{(index+1).toLocaleString("fa-IR")}</span><img src={rank.avatarUrl||"/icons/profile_icon.png"} alt="" className="w-10 h-10 rounded-xl object-cover"/><div className="min-w-0"><div className="font-black text-sm truncate">{rank.displayName}</div><div className="text-[9px] text-gray-500 truncate" dir="ltr">{rank.codUsername}</div></div></div><div className="text-left shrink-0"><div className="font-black text-orange-300">{rank.points.toLocaleString("fa-IR")} RP</div><div className="text-[9px] text-gray-600">{rank.totalKills.toLocaleString("fa-IR")} Kill • {rank.tier}</div></div></div>)}</div>}
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-8" dir="rtl">
          <InviteFriendCard />
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-12" dir="rtl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              ["🛡️", "زنجیره مدرک", "Scoreboard، رکورد بازیکن و رکورد Lobby با هش ضدتکرار ثبت می‌شوند."],
              ["⚙️", "جایزه قابل تنظیم", "Kill، جایگاه و حضور برای هر روم فرمول مستقل و سقف بودجه مصوب دارند."],
              ["📈", "رنک واقعی COD", "فقط نتیجه تأییدشده امتیاز می‌سازد و دسترسی به روم‌های حرفه‌ای را باز می‌کند."],
            ].map(([icon, title, text]) => <div key={title} className="rounded-3xl border border-white/5 bg-white/[.025] p-5"><div className="text-3xl">{icon}</div><h3 className="font-black mt-4">{title}</h3><p className="text-xs text-gray-500 leading-6 mt-2">{text}</p></div>)}
          </div>
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
