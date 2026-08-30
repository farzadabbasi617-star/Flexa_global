"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import AppImage from "@/components/AppImage";
import ParticleField from "@/components/fx/ParticleField";
import Reveal from "@/components/fx/Reveal";
import HonorsIcon, { type HonorsIconName } from "@/components/honors/HonorsIcon";
import styles from "./honors.module.css";

type HonorType = "all" | "winner" | "levelup" | "news";

interface Honor {
  id: string;
  type: "winner" | "levelup" | "news" | string;
  icon: string;
  title: string;
  description: string;
  time: string;
  prize?: string;
  username?: string;
  level?: number;
  highlight?: boolean;
  image?: string;
  imageAlt?: string;
  summary?: string;
  seoKeywords?: string[];
  readTimeMinutes?: number;
  game?: string;
  publishedAt?: string | null;
  likesCount?: number;
  viewsCount?: number;
}

const TYPE_FILTERS: Array<{ id: HonorType; label: string; icon: HonorsIconName }> = [
  { id: "all", label: "همه محتوا", icon: "grid" },
  { id: "winner", label: "قهرمانان", icon: "trophy" },
  { id: "levelup", label: "پیشرفت‌ها", icon: "bolt" },
  { id: "news", label: "اخبار رسمی", icon: "news" },
];

const GAME_FILTERS = [
  { id: "all", label: "همه بازی‌ها", eyebrow: "ALL GAMES", image: null, color: "#a78bfa" },
  { id: "clash_royale", label: "کلش رویال", eyebrow: "CLASH ROYALE", image: "/icons/icon-clash_royale.png", color: "#22d3ee" },
  { id: "cod_mobile", label: "کالاف موبایل", eyebrow: "COD MOBILE", image: "/icons/icon-cod_mobile.png", color: "#fb923c" },
  { id: "fortnite", label: "فورتنایت", eyebrow: "FORTNITE", image: "/icons/icon-fortnite.png", color: "#e879f9" },
];

const TYPE_LABELS: Record<string, string> = {
  winner: "قهرمان",
  runner_up: "نایب‌قهرمان",
  levelup: "پیشرفت بازیکن",
  rankup: "ارتقای رتبه",
  record: "رکورد جدید",
  fairplay: "بازی جوانمردانه",
  team: "افتخار تیمی",
  news: "خبر رسمی",
  event: "رویداد",
};

function gameLabel(game?: string) {
  return GAME_FILTERS.find((item) => item.id === game)?.label || "گیمینگ";
}

function gameImage(game?: string) {
  return GAME_FILTERS.find((item) => item.id === game)?.image;
}

function gameColor(game?: string) {
  return GAME_FILTERS.find((item) => item.id === game)?.color || "#a78bfa";
}

function typeIcon(type: string): HonorsIconName {
  if (["winner", "runner_up", "record"].includes(type)) return "trophy";
  if (["levelup", "rankup"].includes(type)) return "bolt";
  if (type === "team" || type === "fairplay") return "shield";
  return "news";
}

function HonorCard({ honor, index = 0 }: { honor: Honor; index?: number }) {
  const accent = gameColor(honor.game);
  return (
    <Reveal delay={Math.min(index, 6) * 0.055} distance={22}>
      <Link
        href={`/honors/${honor.id}`}
        className={`${styles.cardTexture} group flex h-full min-h-[390px] flex-col overflow-hidden rounded-[28px] border border-white/[.09] bg-[#0e0f15] shadow-[0_18px_45px_rgba(0,0,0,.22)] transition duration-500 hover:-translate-y-1.5 hover:border-white/20 hover:shadow-[0_26px_65px_rgba(0,0,0,.38)]`}
        style={{ "--honor-accent": accent } as React.CSSProperties}
      >
        <div className="relative z-0 h-52 overflow-hidden bg-[#11121a]">
          {honor.image ? (
            <AppImage src={honor.image} alt={honor.imageAlt || honor.title} fill sizes="(max-width: 640px) 100vw, 33vw" className={`${styles.imageZoom} h-full w-full object-cover`} />
          ) : (
            <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_50%_20%,rgba(245,158,11,.2),transparent_35%),linear-gradient(145deg,#231b12,#12101b_55%,#07141b)]">
              <HonorsIcon name={typeIcon(honor.type)} className="h-20 w-20 text-amber-200/45" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e0f15] via-black/15 to-black/10" />
          <div className="absolute right-3 top-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 text-[9px] font-black text-white backdrop-blur-xl">
              <HonorsIcon name={typeIcon(honor.type)} className="h-3 w-3" />
              {TYPE_LABELS[honor.type] || "افتخار"}
            </span>
            {honor.game && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 text-[9px] font-black backdrop-blur-xl">
                {gameImage(honor.game) && (
                  <AppImage src={gameImage(honor.game)!} alt="" width={14} height={14} className="h-3.5 w-3.5 object-contain" />
                )}
                {gameLabel(honor.game)}
              </span>
            )}
          </div>
          <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg border border-white/[.08] bg-black/45 px-2.5 py-1.5 text-[9px] font-bold text-white/65 backdrop-blur-xl">
            <HonorsIcon name="clock" className="h-3 w-3" />
            {honor.readTimeMinutes ? `${honor.readTimeMinutes.toLocaleString("fa-IR")} دقیقه مطالعه · ` : ""}{honor.time}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4.5 sm:p-5">
          <h2 className="line-clamp-2 text-base font-black leading-7 text-gray-50 transition group-hover:text-amber-100 sm:text-lg">{honor.title}</h2>
          <p className="mt-2 line-clamp-3 text-[11px] leading-6 text-gray-500 sm:text-xs">{honor.summary || honor.description}</p>
          {honor.seoKeywords?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {honor.seoKeywords.slice(0, 2).map((keyword) => <span key={keyword} className="rounded-md border border-white/[.06] bg-white/[.035] px-2 py-1 text-[8px] font-bold text-gray-500">{keyword}</span>)}
            </div>
          ) : null}
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[.065] pt-4">
            <div className="flex items-center gap-3 text-[9px] font-bold text-gray-600">
              {honor.type === "news" ? (
                <>
                  <span className="inline-flex items-center gap-1"><HonorsIcon name="eye" className="h-3.5 w-3.5" /> {(honor.viewsCount || 0).toLocaleString("fa-IR")}</span>
                  <span className="inline-flex items-center gap-1"><HonorsIcon name="heart" className="h-3.5 w-3.5" /> {(honor.likesCount || 0).toLocaleString("fa-IR")}</span>
                </>
              ) : (
                <span className="truncate">{honor.username ? `@${honor.username}` : honor.prize || "ثبت‌شده در Flexa"}</span>
              )}
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-black text-amber-300">مشاهده کامل <HonorsIcon name="arrow" className="h-3.5 w-3.5 transition group-hover:-translate-x-1" /></span>
          </div>
        </div>
      </Link>
    </Reveal>
  );
}

export default function HonorsPage() {
  const [activeFilter, setActiveFilter] = useState<HonorType>("all");
  const [activeGame, setActiveGame] = useState("all");
  const [query, setQuery] = useState("");
  const [honors, setHonors] = useState<Honor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [featuredIndex, setFeaturedIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/honors", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("honors-load-failed");
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setHonors(Array.isArray(data) ? data : []);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const filteredHonors = useMemo(() => honors.filter((honor) => {
    const byType = activeFilter === "all" || honor.type === activeFilter;
    const byGame = activeGame === "all" || honor.game === activeGame;
    const normalizedQuery = query.trim().toLowerCase();
    const byQuery = !normalizedQuery || `${honor.title} ${honor.description} ${honor.username || ""}`.toLowerCase().includes(normalizedQuery);
    return byType && byGame && byQuery;
  }), [honors, activeFilter, activeGame, query]);

  const featured = useMemo(() => {
    const highlighted = honors.filter((honor) => honor.highlight);
    return (highlighted.length ? highlighted : honors.filter((honor) => honor.type === "news")).slice(0, 5);
  }, [honors]);
  const activeFeatured = featured.length ? featured[featuredIndex % featured.length] : null;

  useEffect(() => {
    if (featured.length <= 1 || activeFilter !== "all" || activeGame !== "all" || query.trim()) return;
    const timer = window.setInterval(() => setFeaturedIndex((index) => (index + 1) % featured.length), 6000);
    return () => window.clearInterval(timer);
  }, [featured.length, activeFilter, activeGame, query]);

  const totalViews = honors.reduce((sum, honor) => sum + Number(honor.viewsCount || 0), 0);
  const championCount = honors.filter((honor) => ["winner", "runner_up", "record"].includes(honor.type)).length;
  const newsCount = honors.filter((honor) => honor.type === "news").length;
  const trending = [...honors].sort((a, b) => Number(b.viewsCount || 0) - Number(a.viewsCount || 0)).slice(0, 4);
  const gridItems = activeFilter === "all" && activeGame === "all" && !query.trim() && activeFeatured
    ? filteredHonors.filter((honor) => honor.id !== activeFeatured.id)
    : filteredHonors;

  return (
    <main className={`${styles.page} text-white`} dir="rtl">
      <header className="relative z-40 border-b border-white/[.07] bg-[#08090e]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <AppImage src="/icons/flexa-icon-192.png" alt="Flexa" width={44} height={44} priority className="h-11 w-11 object-contain drop-shadow-[0_0_16px_rgba(245,158,11,.25)]" />
            <div>
              <div className="text-[8px] font-black tracking-[.26em] text-amber-300">GAMENT ARCHIVES</div>
              <div className="text-sm font-black sm:text-base">تالار افتخارات</div>
            </div>
          </Link>
          <nav className="mr-auto flex items-center gap-2 text-[10px] font-black">
            <Link href="/leaderboard" className="hidden rounded-xl border border-white/[.08] bg-white/[.035] px-3.5 py-2.5 text-gray-400 transition hover:text-white sm:inline-flex">رتبه‌بندی</Link>
            <Link href="/tournaments" className="hidden rounded-xl border border-white/[.08] bg-white/[.035] px-3.5 py-2.5 text-gray-400 transition hover:text-white md:inline-flex">تورنومنت‌ها</Link>
            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/10 bg-emerald-500/[.065] px-3 py-2.5 text-emerald-300">
              <span className={`${styles.pulseDot} h-1.5 w-1.5 rounded-full bg-emerald-400`} /> آرشیو زنده
            </span>
          </nav>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-8">
        <div className={`${styles.heroTexture} min-h-[470px] rounded-[32px] border border-amber-200/10 shadow-[0_30px_100px_rgba(0,0,0,.35)] sm:rounded-[42px] lg:min-h-[520px]`}>
          <ParticleField count={34} className="opacity-45" />
          <div className="relative z-10 grid min-h-[470px] items-center gap-8 px-6 py-10 sm:px-9 lg:min-h-[520px] lg:grid-cols-[1.12fr_.88fr] lg:px-14">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/15 bg-amber-300/[.07] px-3 py-1.5 text-[9px] font-black tracking-[.16em] text-amber-200">
                <HonorsIcon name="crown" className="h-3.5 w-3.5" />
                LEGENDS ARE REMEMBERED
              </span>
              <h1 className="mt-6 text-4xl font-black leading-[1.22] tracking-tight sm:text-6xl lg:text-7xl">
                جایی برای ثبت
                <span className={`${styles.goldText} block`}>لحظه‌های ماندگار</span>
              </h1>
              <p className="mt-5 max-w-2xl text-xs leading-7 text-gray-400 sm:text-sm sm:leading-8">قهرمانان تورنومنت، رکوردهای بازیکنان و خبرهای رسمی دنیای بازی؛ با منبع شفاف و روایتی که ارزش ماندگارشدن دارد.</p>
              <div className="mt-7 flex flex-wrap gap-2.5">
                <a href="#hall-content" className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-l from-amber-300 to-yellow-500 px-5 py-3 text-xs font-black text-[#171006] shadow-[0_12px_32px_rgba(245,158,11,.18)] transition hover:brightness-110">
                  ورود به آرشیو <HonorsIcon name="arrow" className="h-4 w-4" />
                </a>
                <button onClick={() => setActiveFilter("news")} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[.045] px-5 py-3 text-xs font-black text-gray-200 transition hover:bg-white/[.08]">
                  <HonorsIcon name="news" className="h-4 w-4 text-cyan-300" /> تازه‌ترین خبرها
                </button>
              </div>

              <div className="mt-9 grid max-w-2xl grid-cols-3 gap-2.5">
                {[
                  [championCount.toLocaleString("fa-IR"), "قهرمان و رکورد"],
                  [newsCount.toLocaleString("fa-IR"), "خبر معتبر"],
                  [totalViews.toLocaleString("fa-IR"), "بازدید ثبت‌شده"],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-white/[.07] bg-black/15 px-3 py-3 backdrop-blur-md sm:px-4">
                    <strong className="block text-lg font-black text-amber-100 sm:text-2xl">{value}</strong>
                    <span className="mt-1 block text-[8px] font-bold text-gray-600 sm:text-[10px]">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative hidden place-items-center lg:grid">
              <div className={styles.medallion}>
                <span className={`${styles.rune} right-[3%] top-[20%]`}><HonorsIcon name="crown" className="h-5 w-5" /></span>
                <span className={`${styles.rune} bottom-[9%] right-[26%]`}><HonorsIcon name="sparkles" className="h-5 w-5" /></span>
                <span className={`${styles.rune} left-[2%] top-[43%]`}><HonorsIcon name="trophy" className="h-5 w-5" /></span>
                <AppImage src="/icons/honors_icon.webp" alt="نشان تالار افتخارات Flexa" width={330} height={330} priority className={styles.medallionIcon} />
              </div>
              <div className="absolute -bottom-8 left-1/2 w-64 -translate-x-1/2 rounded-2xl border border-white/[.08] bg-black/30 px-4 py-3 text-center backdrop-blur-xl">
                <span className="text-[8px] font-black tracking-[.22em] text-amber-300">GAMENT HALL OF FAME</span>
                <p className="mt-1 text-[10px] text-gray-500">هر افتخار، یک ردپای دائمی در تاریخ رقابت</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Placeholder while the archive loads. The spotlight below only renders
          once data arrives, and inserting it pushed the archive section down —
          the single real layout shift on this page (199px, ~0.136 CLS).
          Reserving a matching box on the default (unfiltered) view removes it. */}
      {loading && activeFilter === "all" && activeGame === "all" && !query.trim() && (
        <section aria-hidden className="mx-auto mt-6 max-w-7xl px-4 sm:mt-8 sm:px-6">
          <div className="mb-4 h-[52px]" />
          <div className="h-[390px] animate-pulse rounded-[32px] border border-white/[.07] bg-white/[.03] sm:h-[460px]" />
        </section>
      )}

      {activeFilter === "all" && activeGame === "all" && !query.trim() && activeFeatured && (
        <section className="mx-auto mt-6 max-w-7xl px-4 sm:mt-8 sm:px-6" aria-labelledby="featured-title">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <span className="text-[8px] font-black tracking-[.28em] text-amber-400">EDITOR&apos;S SPOTLIGHT</span>
              <h2 id="featured-title" className="mt-1 text-xl font-black sm:text-2xl">روایت ویژه تالار</h2>
            </div>
            {featured.length > 1 && (
              <div className="flex items-center gap-1.5" dir="ltr">
                {featured.map((item, index) => (
                  <button key={item.id} onClick={() => setFeaturedIndex(index)} aria-label={`نمایش محتوای ویژه ${index + 1}`} className={`h-2 rounded-full transition-all ${index === featuredIndex % featured.length ? "w-8 bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,.45)]" : "w-2 bg-white/15 hover:bg-white/30"}`} />
                ))}
              </div>
            )}
          </div>

          <Link href={`/honors/${activeFeatured.id}`} className={`${styles.cardTexture} group relative block min-h-[390px] overflow-hidden rounded-[32px] border border-white/[.09] bg-[#101117] shadow-[0_24px_70px_rgba(0,0,0,.3)] sm:min-h-[460px]`}>
            {activeFeatured.image ? (
              <AppImage key={activeFeatured.image} src={activeFeatured.image} alt={activeFeatured.imageAlt || activeFeatured.title} fill priority sizes="(max-width: 1024px) 100vw, 66vw" className={`${styles.imageZoom} absolute inset-0 h-full w-full object-cover`} />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(251,191,36,.18),transparent_30%),linear-gradient(135deg,#23180d,#12101c_55%,#07141b)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-l from-black/15 via-black/40 to-black/80 sm:bg-gradient-to-t sm:from-black/95 sm:via-black/25 sm:to-black/10" />
            <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-8 lg:max-w-4xl lg:p-10">
              <div className="flex flex-wrap items-center gap-2 text-[9px] font-black">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/15 bg-amber-400/15 px-2.5 py-1.5 text-amber-200 backdrop-blur-xl"><HonorsIcon name="sparkles" className="h-3.5 w-3.5" /> انتخاب ویژه</span>
                {activeFeatured.game && <span className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-gray-200 backdrop-blur-xl">{gameLabel(activeFeatured.game)}</span>}
                <span className="text-gray-400">{activeFeatured.time}</span>
              </div>
              <h2 className="mt-4 max-w-3xl text-2xl font-black leading-[1.45] text-white sm:text-4xl lg:text-5xl">{activeFeatured.title}</h2>
              <p className="mt-3 line-clamp-2 max-w-2xl text-xs leading-7 text-gray-300 sm:text-sm">{activeFeatured.summary || activeFeatured.description}</p>
              <span className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[10px] font-black text-black transition group-hover:bg-amber-100">مطالعه روایت کامل <HonorsIcon name="arrow" className="h-4 w-4 transition group-hover:-translate-x-1" /></span>
            </div>
          </Link>
        </section>
      )}

      <section id="hall-content" className="scroll-mt-24 pb-8 pt-10" aria-labelledby="archive-title">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-5 flex flex-col gap-4 border-b border-white/[.07] pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="text-[8px] font-black tracking-[.28em] text-violet-400">CURATED ARCHIVE</span>
              <h2 id="archive-title" className="mt-1 text-xl font-black sm:text-2xl">آرشیو افتخارات و خبرها</h2>
              <p className="mt-1 text-[10px] text-gray-600">{loading ? "در حال همگام‌سازی تالار..." : `${filteredHonors.length.toLocaleString("fa-IR")} مورد برای نمایش`}</p>
            </div>
            <label className="flex h-12 w-full items-center gap-3 rounded-2xl border border-white/[.09] bg-white/[.035] px-4 transition focus-within:border-amber-300/30 lg:max-w-md">
              <HonorsIcon name="search" className="h-5 w-5 shrink-0 text-gray-600" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجوی عنوان، بازیکن یا خبر..." className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-700" />
              {query && <button onClick={() => setQuery("")} className="text-[10px] font-bold text-gray-600 hover:text-white">پاک‌کردن</button>}
            </label>
          </div>

          <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            {TYPE_FILTERS.map((filter) => (
              <button key={filter.id} onClick={() => setActiveFilter(filter.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-[10px] font-black transition ${activeFilter === filter.id ? "border-amber-300/25 bg-amber-400/12 text-amber-200 shadow-[0_8px_25px_rgba(245,158,11,.08)]" : "border-white/[.07] bg-white/[.025] text-gray-500 hover:border-white/15 hover:text-gray-300"}`}>
                <HonorsIcon name={filter.icon} className="h-4 w-4" /> {filter.label}
              </button>
            ))}
            <span className="mx-1 hidden h-9 w-px bg-white/[.08] lg:block" />
            {GAME_FILTERS.map((game) => (
              <button key={game.id} onClick={() => setActiveGame(game.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[10px] font-black transition ${activeGame === game.id ? "border-violet-300/25 bg-violet-500/10 text-violet-200" : "border-white/[.07] bg-white/[.025] text-gray-500 hover:border-white/15 hover:text-gray-300"}`}>
                {game.image ? (
                  <AppImage src={game.image} alt="" width={16} height={16} className="h-4 w-4 object-contain" />
                ) : <HonorsIcon name="layers" className="h-4 w-4" />}
                {game.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
            <div className="min-w-0">
              {loading ? (
                // Two placeholders, not four. The archive usually holds a
                // couple of entries, so a four-card skeleton collapsed to one
                // row once the data arrived and shifted everything below it.
                // Under-guessing shrinks nothing: the grid only grows, which
                // does not move content that is already above it.
                <div className="grid gap-4 sm:grid-cols-2">
                  {Array.from({ length: 2 }).map((_, index) => <div key={index} className="h-[390px] animate-pulse rounded-[28px] border border-white/[.07] bg-white/[.035]" />)}
                </div>
              ) : loadError ? (
                <div className="rounded-[28px] border border-red-300/15 bg-red-500/[.045] py-16 text-center">
                  <HonorsIcon name="shield" className="mx-auto h-10 w-10 text-red-300" />
                  <h3 className="mt-4 font-black">دریافت آرشیو ناموفق بود</h3>
                  <p className="mt-2 text-xs text-gray-600">چند لحظه دیگر دوباره صفحه را باز کنید.</p>
                </div>
              ) : gridItems.length ? (
                <div className="grid auto-rows-fr gap-4 sm:grid-cols-2">{gridItems.map((honor, index) => <HonorCard key={honor.id} honor={honor} index={index} />)}</div>
              ) : (
                <div className={`${styles.cardTexture} rounded-[30px] border border-dashed border-white/[.1] bg-white/[.02] py-20 text-center`}>
                  <span className="mx-auto grid h-18 w-18 place-items-center rounded-[24px] border border-white/[.08] bg-white/[.035] text-amber-300"><HonorsIcon name="trophy" className="h-9 w-9" /></span>
                  <h3 className="mt-5 text-lg font-black">موردی در این بخش پیدا نشد</h3>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-gray-600">فیلترها را تغییر دهید. خبرهای خودکار فقط با متن و تصویر معتبر منبع رسمی منتشر می‌شوند.</p>
                  <button onClick={() => { setActiveFilter("all"); setActiveGame("all"); setQuery(""); }} className="mt-5 rounded-xl border border-white/10 bg-white/[.05] px-4 py-2.5 text-[10px] font-black text-gray-300">نمایش همه آرشیو</button>
                </div>
              )}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-4">
              <div className={`${styles.cardTexture} rounded-[26px] border border-white/[.08] bg-white/[.025] p-4`}>
                <div className="flex items-center justify-between">
                  <div><span className="text-[8px] font-black tracking-[.2em] text-amber-400">TRENDING</span><h3 className="mt-1 text-sm font-black">پربازدیدترین‌ها</h3></div>
                  <HonorsIcon name="eye" className="h-5 w-5 text-gray-600" />
                </div>
                <div className="mt-4 space-y-1">
                  {trending.length ? trending.map((honor, index) => (
                    <Link key={honor.id} href={`/honors/${honor.id}`} className="group flex items-center gap-3 rounded-2xl px-2 py-3 transition hover:bg-white/[.04]">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/[.07] bg-black/20 text-[10px] font-black text-amber-300">{(index + 1).toLocaleString("fa-IR")}</span>
                      <span className="min-w-0 flex-1"><strong className="line-clamp-2 block text-[10px] font-black leading-5 text-gray-300 group-hover:text-white">{honor.title}</strong><span className="mt-1 inline-flex items-center gap-1 text-[8px] text-gray-700"><HonorsIcon name="eye" className="h-3 w-3" /> {(honor.viewsCount || 0).toLocaleString("fa-IR")} بازدید</span></span>
                    </Link>
                  )) : <p className="py-5 text-center text-[10px] text-gray-700">هنوز آماری ثبت نشده است.</p>}
                </div>
              </div>

              <div className="overflow-hidden rounded-[26px] border border-cyan-300/10 bg-[radial-gradient(circle_at_80%_0%,rgba(34,211,238,.12),transparent_35%),linear-gradient(145deg,rgba(8,145,178,.08),rgba(255,255,255,.02))] p-4">
                <span className="grid h-10 w-10 place-items-center rounded-2xl border border-cyan-300/10 bg-cyan-400/[.08] text-cyan-300"><HonorsIcon name="shield" className="h-5 w-5" /></span>
                <h3 className="mt-4 text-sm font-black">خبر بدون منبع منتشر نمی‌شود</h3>
                <p className="mt-2 text-[10px] leading-5 text-gray-600">هر خبر خودکار باید متن کافی، تاریخ معتبر و تصویر همان منبع رسمی را داشته باشد. هوش مصنوعی فقط ترجمه می‌کند.</p>
                <Link href="/about" className="mt-4 inline-flex items-center gap-1 text-[9px] font-black text-cyan-300">درباره Flexa <HonorsIcon name="arrow" className="h-3.5 w-3.5" /></Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <div style={{ height: "var(--bottom-nav-space)" }} />
      <BottomNav />
    </main>
  );
}
