"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import StoreIcon, { type StoreIconName } from "@/components/store/StoreIcon";
import FeaturedCarousel from "@/components/store/FeaturedCarousel";
import FeaturedHeroSlides from "@/components/store/FeaturedHeroSlides";

type Kind = "currency" | "account" | "item" | "service";
type Source = "official" | "user";
type FilterId =
  | "all"
  | "clash_royale"
  | "cod_mobile"
  | "fortnite"
  | "gem"
  | "cp"
  | "uc"
  | "vbucks"
  | "account"
  | "item"
  | "service";

interface Listing {
  id: string;
  source: Source;
  kind: Kind;
  game: string | null;
  title: string;
  description: string | null;
  priceToman: number;
  currencyKind: string | null;
  currencyAmount: number | null;
  stock: number;
  soldCount: number;
  warrantyDays?: number;
  images: string[];
  metadata?: any;
  sellerName: string | null;
}

interface StoreFilter {
  id: FilterId;
  label: string;
  shortLabel: string;
  eyebrow: string;
  param: "kind" | "currencyKind" | "game" | null;
  image?: string;
  icon?: StoreIconName;
  color: string;
}

const CURRENCY_ICONS: Record<string, string> = {
  gem: "/icons/currencies/gem.png",
  uc: "/icons/currencies/uc.png",
  cp: "/icons/currencies/cp.png",
  vbucks: "/icons/currencies/vbucks.png",
};

const GAME_ICONS: Record<string, string> = {
  clash_royale: "/icons/icon-clash_royale.png",
  cod_mobile: "/icons/icon-cod_mobile.png",
  fortnite: "/icons/icon-fortnite.png",
};

const FILTERS: StoreFilter[] = [
  { id: "all", label: "همه محصولات", shortLabel: "همه", eyebrow: "MARKET", param: null, icon: "grid", color: "from-violet-500/25 to-fuchsia-500/5" },
  { id: "clash_royale", label: "کلش رویال", shortLabel: "کلش رویال", eyebrow: "CLASH ROYALE", param: "game", image: GAME_ICONS.clash_royale, color: "from-cyan-500/25 to-blue-500/5" },
  { id: "cod_mobile", label: "کالاف موبایل", shortLabel: "کالاف", eyebrow: "COD MOBILE", param: "game", image: GAME_ICONS.cod_mobile, color: "from-orange-500/25 to-red-500/5" },
  { id: "fortnite", label: "فورتنایت", shortLabel: "فورتنایت", eyebrow: "FORTNITE", param: "game", image: GAME_ICONS.fortnite, color: "from-fuchsia-500/25 to-purple-500/5" },
  { id: "gem", label: "جم بازی", shortLabel: "جم", eyebrow: "GEMS", param: "currencyKind", image: CURRENCY_ICONS.gem, color: "from-emerald-500/25 to-cyan-500/5" },
  { id: "cp", label: "سی‌پی کالاف", shortLabel: "CP", eyebrow: "COD POINTS", param: "currencyKind", image: CURRENCY_ICONS.cp, color: "from-amber-500/25 to-orange-500/5" },
  { id: "uc", label: "یوسی پابجی", shortLabel: "UC", eyebrow: "PUBG UC", param: "currencyKind", image: CURRENCY_ICONS.uc, color: "from-blue-500/25 to-cyan-500/5" },
  { id: "vbucks", label: "وی‌باکس", shortLabel: "V-BUCKS", eyebrow: "FORTNITE", param: "currencyKind", image: CURRENCY_ICONS.vbucks, color: "from-sky-500/25 to-indigo-500/5" },
  { id: "account", label: "اکانت بازی", shortLabel: "اکانت", eyebrow: "ACCOUNTS", param: "kind", icon: "user", color: "from-pink-500/25 to-rose-500/5" },
  { id: "item", label: "آیتم و اسکین", shortLabel: "آیتم و اسکین", eyebrow: "ITEMS", param: "kind", icon: "shopping-bag", color: "from-purple-500/25 to-fuchsia-500/5" },
  { id: "service", label: "خدمات بازی", shortLabel: "خدمات", eyebrow: "SERVICES", param: "kind", icon: "briefcase", color: "from-teal-500/25 to-emerald-500/5" },
];

const SOURCES: Array<{ id: "all" | Source; label: string; hint: string }> = [
  { id: "all", label: "همه فروشنده‌ها", hint: "رسمی و کاربران" },
  { id: "official", label: "فروشگاه رسمی Flexa", hint: "فروش مستقیم Flexa" },
  { id: "user", label: "فروشندگان احرازشده", hint: "بازار کاربران" },
];

const CURRENCY_LABELS: Record<string, string> = {
  gem: "جم",
  cp: "CP",
  uc: "UC",
  vbucks: "وی‌باکس",
  coin: "سکه",
  gold: "طلا",
  other: "ارز بازی",
};

const GAME_LABELS: Record<string, string> = {
  clash_royale: "کلش رویال",
  cod_mobile: "کالاف موبایل",
  fortnite: "فورتنایت",
};

function toman(value: number) {
  return `${Math.round(value).toLocaleString("fa-IR")} USDT`;
}
function codmMeta(listing: Listing) {
  return listing.kind === "account" && listing.game === "cod_mobile" ? listing.metadata?.codm || null : null;
}
function codmChips(listing: Listing) {
  const meta = codmMeta(listing);
  if (!meta) return [];
  return [
    meta.level ? `Lvl ${meta.level}` : "",
    meta.mythicWeapons ? `${meta.mythicWeapons} Mythic` : "",
    meta.legendaryWeapons ? `${meta.legendaryWeapons} Legendary` : "",
    meta.epicWeapons ? `${meta.epicWeapons} Epic Gun` : "",
    meta.cpBalance ? `${meta.cpBalance} CP` : "",
    meta.region ? String(meta.region).toUpperCase() : "",
  ].filter(Boolean).slice(0, 5);
}

function ProductFallback({ listing }: { listing: Listing }) {
  const gameIcon = listing.game ? GAME_ICONS[listing.game] : undefined;
  const currencyIcon = listing.currencyKind ? CURRENCY_ICONS[listing.currencyKind] : undefined;
  const icon = currencyIcon || gameIcon;
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_20%,rgba(168,85,247,.25),transparent_40%),linear-gradient(145deg,#171525,#0b0c13)]">
      <div className="absolute inset-0 opacity-[.08] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:30px_30px]" />
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" className="relative h-24 w-24 object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,.5)] transition duration-500 group-hover:scale-110" loading="lazy" decoding="async" />
      ) : (
        <StoreIcon name={listing.kind === "account" ? "user" : listing.kind === "service" ? "briefcase" : "shopping-bag"} className="relative h-20 w-20 text-white/25" />
      )}
    </div>
  );
}

export default function StorePage() {
  const [items, setItems] = useState<Listing[]>([]);
  // >0 means promoted listings took over the hero, so the static pitch stands down.
  const [heroSlides, setHeroSlides] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<FilterId>("all");
  const [source, setSource] = useState<"all" | Source>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "cheapest" | "expensive" | "bestselling">("newest");
  const [minToman, setMinToman] = useState("");
  const [maxToman, setMaxToman] = useState("");
  const [minLevel, setMinLevel] = useState("");
  const [minMythic, setMinMythic] = useState("");
  const [minLegendary, setMinLegendary] = useState("");
  const [codmPlatform, setCodmPlatform] = useState("");
  const [codmRegion, setCodmRegion] = useState("");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams();
    const active = FILTERS.find((item) => item.id === filter);
    if (active?.param) params.set(active.param, filter);
    if (source !== "all") params.set("source", source);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (sort !== "newest") params.set("sort", sort);
    if (minToman) params.set("minToman", minToman);
    if (maxToman) params.set("maxToman", maxToman);
    if (minLevel) params.set("minLevel", minLevel);
    if (minMythic) params.set("minMythic", minMythic);
    if (minLegendary) params.set("minLegendary", minLegendary);
    if (codmPlatform) params.set("platform", codmPlatform);
    if (codmRegion) params.set("region", codmRegion);
    try {
      const response = await fetch(`/api/store/listings?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("store-load-failed");
      const data = await response.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [filter, source, debouncedSearch, sort, minToman, maxToman, minLevel, minMythic, minLegendary, codmPlatform, codmRegion]);

  useEffect(() => {
    load();
  }, [load]);

  const activeFilter = useMemo(() => FILTERS.find((item) => item.id === filter) || FILTERS[0], [filter]);
  const hasActiveFilters = filter !== "all" || source !== "all" || Boolean(search || minToman || maxToman || minLevel || minMythic || minLegendary || codmPlatform || codmRegion) || sort !== "newest";

  function resetFilters() {
    setFilter("all");
    setSource("all");
    setSearch("");
    setDebouncedSearch("");
    setSort("newest");
    setMinToman("");
    setMaxToman("");
    setMinLevel("");
    setMinMythic("");
    setMinLegendary("");
    setCodmPlatform("");
    setCodmRegion("");
    setShowMobileFilters(false);
  }

  const filterPanel = (
    <div className="space-y-7">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-black text-white">نوع فروشنده</h3>
          {hasActiveFilters && (
            <button onClick={resetFilters} className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-300 hover:text-violet-200">
              <StoreIcon name="refresh" className="h-3.5 w-3.5" />
              پاک‌کردن
            </button>
          )}
        </div>
        <div className="space-y-2">
          {SOURCES.map((item) => (
            <button
              key={item.id}
              onClick={() => setSource(item.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-right transition ${
                source === item.id
                  ? "border-violet-400/45 bg-violet-500/12"
                  : "border-transparent bg-white/[.025] hover:border-white/10 hover:bg-white/[.05]"
              }`}
            >
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${source === item.id ? "border-violet-400 bg-violet-500" : "border-white/20"}`}>
                {source === item.id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-black text-gray-100">{item.label}</span>
                <span className="mt-0.5 block text-[10px] text-gray-500">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-black text-white">محدوده قیمت</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 focus-within:border-violet-400/60">
            <span className="block text-[9px] text-gray-500">از قیمت</span>
            <input
              value={minToman}
              onChange={(event) => setMinToman(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              dir="ltr"
              placeholder="۰"
              aria-label="حداقل قیمت به USDT"
              className="mt-1 w-full bg-transparent text-left text-xs font-bold text-white outline-none placeholder:text-gray-700"
            />
          </label>
          <label className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 focus-within:border-violet-400/60">
            <span className="block text-[9px] text-gray-500">تا قیمت</span>
            <input
              value={maxToman}
              onChange={(event) => setMaxToman(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              dir="ltr"
              placeholder="بدون محدودیت"
              aria-label="حداکثر قیمت به USDT"
              className="mt-1 w-full bg-transparent text-left text-xs font-bold text-white outline-none placeholder:text-gray-700"
            />
          </label>
        </div>
        <p className="mt-2 text-[10px] text-gray-600">همه قیمت‌ها به USDT نمایش داده می‌شوند.</p>
      </div>

      {(filter === "cod_mobile" || filter === "account") && (
        <div>
          <h3 className="mb-3 text-sm font-black text-white">فیلترهای اکانت کالاف</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 focus-within:border-orange-400/60">
              <span className="block text-[9px] text-gray-500">حداقل لول</span>
              <input
                value={minLevel}
                onChange={(e) => setMinLevel(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                dir="ltr"
                placeholder="۰"
                aria-label="حداقل لول"
                className="mt-1 w-full bg-transparent text-left text-xs font-bold text-white outline-none placeholder:text-gray-700"
              />
            </label>
            <label className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 focus-within:border-orange-400/60">
              <span className="block text-[9px] text-gray-500">حداقل میثیک گان</span>
              <input
                value={minMythic}
                onChange={(e) => setMinMythic(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                dir="ltr"
                placeholder="۰"
                aria-label="حداقل میثیک گان"
                className="mt-1 w-full bg-transparent text-left text-xs font-bold text-white outline-none placeholder:text-gray-700"
              />
            </label>
            <label className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 focus-within:border-orange-400/60">
              <span className="block text-[9px] text-gray-500">حداقل لجندری گان</span>
              <input
                value={minLegendary}
                onChange={(e) => setMinLegendary(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                dir="ltr"
                placeholder="۰"
                aria-label="حداقل لجندری گان"
                className="mt-1 w-full bg-transparent text-left text-xs font-bold text-white outline-none placeholder:text-gray-700"
              />
            </label>
            <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5">
              <span className="block text-[9px] text-gray-500">منطقه</span>
              <select
                value={codmRegion}
                onChange={(e) => setCodmRegion(e.target.value)}
                className="mt-1 w-full bg-transparent text-xs font-bold text-white outline-none"
              >
                <option value="">همه</option>
                <option value="global">GLOBAL</option>
                <option value="garena">GARENA</option>
              </select>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 sm:col-span-2">
              <span className="block text-[9px] text-gray-500">پلتفرم</span>
              <select
                value={codmPlatform}
                onChange={(e) => setCodmPlatform(e.target.value)}
                className="mt-1 w-full bg-transparent text-xs font-bold text-white outline-none"
              >
                <option value="">همه</option>
                <option value="android">Android</option>
                <option value="ios">iOS</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-emerald-400/15 bg-emerald-500/[.07] p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <StoreIcon name="shield" className="h-5 w-5" />
          </span>
          <div>
            <h4 className="text-xs font-black text-emerald-200">خرید امن با ضمانت Flexa</h4>
            <p className="mt-1 text-[10px] leading-5 text-emerald-100/55">وجه تا زمان دریافت و تأیید شما نزد Flexa امانی می‌ماند.</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[#07080d] pb-28 text-white" dir="rtl">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_82%_0%,rgba(124,58,237,.14),transparent_30%),radial-gradient(circle_at_8%_30%,rgba(6,182,212,.08),transparent_24%)]" />

      <div className="relative z-30 border-b border-white/[.06] bg-[#0b0c12] px-4 py-2 text-center text-[10px] font-bold text-gray-400 sm:text-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 sm:justify-between">
          <span className="inline-flex items-center gap-1.5">
            <StoreIcon name="shield" className="h-3.5 w-3.5 text-emerald-400" />
            معامله امن با پرداخت امانی و تضمین بازگشت وجه
          </span>
          <span className="hidden items-center gap-5 lg:flex">
            <span className="inline-flex items-center gap-1.5"><StoreIcon name="headset" className="h-3.5 w-3.5 text-cyan-400" /> پشتیبانی و داوری Flexa</span>
            <span className="inline-flex items-center gap-1.5"><StoreIcon name="badge-check" className="h-3.5 w-3.5 text-violet-400" /> فروشندگان احرازشده</span>
          </span>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#090a10]/90 backdrop-blur-2xl">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 lg:gap-5">
            <Link href="/store" className="flex shrink-0 items-center gap-2.5" aria-label="فروشگاه Flexa">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/flexa-icon-192.png" alt="Flexa" className="h-10 w-10 object-contain drop-shadow-[0_0_15px_rgba(168,85,247,.5)] sm:h-11 sm:w-11" />
              <div className="hidden sm:block">
                <div className="text-[9px] font-black tracking-[.2em] text-violet-300">GAMENT STORE</div>
                <div className="text-base font-black leading-5">فروشگاه Flexa</div>
              </div>
            </Link>

            <label className="hidden h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/[.045] px-4 transition focus-within:border-violet-400/55 focus-within:bg-white/[.065] md:flex">
              <StoreIcon name="search" className="h-5 w-5 shrink-0 text-gray-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="جستجو میان محصولات، اکانت‌ها و ارزهای بازی..."
                aria-label="جستجو در فروشگاه"
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-gray-600"
              />
              {search && <button onClick={() => setSearch("")} className="text-xs font-bold text-gray-500 hover:text-white">پاک‌کردن</button>}
            </label>

            <nav className="mr-auto flex items-center gap-1.5 sm:gap-2" aria-label="دسترسی‌های فروشگاه">
              <Link href="/wallet" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[.045] text-gray-300 transition hover:border-violet-400/35 hover:text-violet-200 sm:h-11 sm:w-11" title="کیف پول">
                <StoreIcon name="wallet" className="h-5 w-5" />
              </Link>
              <Link href="/store/orders" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.045] px-3 text-xs font-black text-gray-200 transition hover:border-violet-400/35 sm:h-11 sm:px-4">
                <StoreIcon name="box" className="h-5 w-5" />
                <span className="hidden lg:inline">سفارش‌های من</span>
              </Link>
              <Link href="/store/my-listings" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.045] px-3 text-xs font-black text-gray-200 transition hover:border-violet-400/35 sm:h-11 sm:px-4" title="آگهی‌های من">
                <StoreIcon name="store" className="h-5 w-5" />
                <span className="hidden lg:inline">آگهی‌های من</span>
              </Link>
              <Link href="/store/sell" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-black text-white shadow-[0_8px_24px_rgba(124,58,237,.28)] transition hover:bg-violet-500 sm:h-11 sm:px-4">
                <StoreIcon name="plus" className="h-4 w-4" />
                <span className="hidden min-[430px]:inline">ثبت آگهی</span>
              </Link>
            </nav>
          </div>

          <label className="mt-3 flex h-11 items-center gap-3 rounded-2xl border border-white/10 bg-white/[.045] px-3 focus-within:border-violet-400/55 md:hidden">
            <StoreIcon name="search" className="h-4.5 w-4.5 shrink-0 text-gray-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="جستجو در فروشگاه..."
              aria-label="جستجو در فروشگاه"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-600"
            />
            {search && <button onClick={() => setSearch("")} className="text-[11px] font-bold text-gray-500">پاک‌کردن</button>}
          </label>
        </div>
      </header>

      <div className="relative mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
        <section className="grid gap-4 lg:grid-cols-[1.55fr_.65fr]">
          <div className="relative min-h-[330px] overflow-hidden rounded-[30px] border border-violet-300/15 bg-[radial-gradient(circle_at_18%_15%,rgba(34,211,238,.18),transparent_25%),radial-gradient(circle_at_78%_10%,rgba(168,85,247,.35),transparent_34%),linear-gradient(125deg,#151127,#0c0d16_60%,#101a22)] p-6 shadow-[0_25px_80px_rgba(0,0,0,.32)] sm:min-h-[360px] sm:p-9">
            <div className="absolute inset-0 opacity-[.08] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:42px_42px] [mask-image:linear-gradient(to_left,black,transparent_75%)]" />
            <div className="absolute -bottom-28 -left-16 h-80 w-80 rounded-full border border-cyan-300/10" />
            <div className="absolute -bottom-16 -left-4 h-56 w-56 rounded-full border border-violet-300/10" />

            <FeaturedHeroSlides onLoaded={setHeroSlides} />

            {heroSlides === 0 && (
            <div className="relative z-10 flex h-full max-w-2xl flex-col items-start justify-center md:max-w-[63%]">
              <span className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-500/10 px-3 py-1.5 text-[10px] font-black text-violet-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                بازار امن کالاهای دیجیتال بازی
              </span>
              <h1 className="mt-5 text-3xl font-black leading-[1.35] tracking-tight sm:text-5xl">
                خرید و فروش گیمینگ،
                <span className="block bg-gradient-to-l from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">سریع، واقعی و مطمئن</span>
              </h1>
              <p className="mt-4 max-w-xl text-xs leading-7 text-gray-300 sm:text-sm sm:leading-8">
                اکانت، جم، CP، UC، وی‌باکس و آیتم بازی را از فروشگاه رسمی یا فروشندگان احرازشده بخرید؛ پرداخت شما تا تأیید تحویل در حساب امن Flexa می‌ماند.
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <a href="#products" className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-xs font-black text-[#0b0c12] transition hover:bg-violet-100">
                  مشاهده محصولات
                  <StoreIcon name="arrow-left" className="h-4 w-4" />
                </a>
                <Link href="/store/sell" className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[.06] px-5 py-3 text-xs font-black text-white transition hover:bg-white/[.1]">
                  <StoreIcon name="store" className="h-4 w-4 text-violet-300" />
                  فروش در Flexa
                </Link>
              </div>
            </div>
            )}

            {heroSlides === 0 && (
            <div className="pointer-events-none absolute bottom-5 left-4 hidden h-64 w-64 md:block lg:left-7 xl:h-72 xl:w-72">
              <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/20 blur-3xl" />
              {[
                [CURRENCY_ICONS.gem, "right-4 top-0 h-24 w-24 -rotate-6"],
                [CURRENCY_ICONS.cp, "bottom-3 right-8 h-20 w-20 rotate-6"],
                [CURRENCY_ICONS.vbucks, "bottom-8 left-1 h-24 w-24 -rotate-3"],
                [CURRENCY_ICONS.uc, "left-5 top-2 h-20 w-20 rotate-6"],
              ].map(([src, className]) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" className={`absolute rounded-[26px] border border-white/15 object-cover shadow-[0_20px_45px_rgba(0,0,0,.5)] ${className}`} />
              ))}
              <div className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[25px] border border-white/15 bg-[#11131d]/90 shadow-2xl backdrop-blur-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/flexa-icon-192.png" alt="" className="h-14 w-14 object-contain" />
              </div>
            </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Link href="/store/orders" className="group relative overflow-hidden rounded-[26px] border border-cyan-300/15 bg-[linear-gradient(145deg,rgba(8,145,178,.16),rgba(255,255,255,.025))] p-4 transition hover:border-cyan-300/30 sm:p-5">
              <div className="absolute -bottom-10 -left-8 h-32 w-32 rounded-full bg-cyan-400/10 blur-2xl" />
              <span className="relative grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-300">
                <StoreIcon name="package" className="h-6 w-6" />
              </span>
              <h2 className="relative mt-4 text-sm font-black sm:text-base">پیگیری سفارش</h2>
              <p className="relative mt-1 hidden text-[11px] leading-5 text-gray-500 min-[400px]:block">وضعیت تحویل و پرداخت امانی را ببینید.</p>
              <span className="relative mt-3 inline-flex items-center gap-1 text-[10px] font-black text-cyan-300">مشاهده سفارش‌ها <StoreIcon name="chevron-left" className="h-3.5 w-3.5 transition group-hover:-translate-x-1" /></span>
            </Link>
            <Link href="/store/price-estimate" className="group relative overflow-hidden rounded-[26px] border border-amber-300/15 bg-[linear-gradient(145deg,rgba(245,158,11,.14),rgba(255,255,255,.025))] p-4 transition hover:border-amber-300/30 sm:p-5">
              <div className="absolute -bottom-10 -left-8 h-32 w-32 rounded-full bg-amber-400/10 blur-2xl" />
              <span className="relative grid h-11 w-11 place-items-center rounded-2xl border border-amber-300/15 bg-amber-400/10 text-amber-300">
                <StoreIcon name="tag" className="h-6 w-6" />
              </span>
              <h2 className="relative mt-4 text-sm font-black sm:text-base">تخمین قیمت هوشمند</h2>
              <p className="relative mt-1 hidden text-[11px] leading-5 text-gray-500 min-[400px]:block">ارزش حدودی اکانت یا کالای خود را بسنجید.</p>
              <span className="relative mt-3 inline-flex items-center gap-1 text-[10px] font-black text-amber-300">محاسبه قیمت <StoreIcon name="chevron-left" className="h-3.5 w-3.5 transition group-hover:-translate-x-1" /></span>
            </Link>
          </div>
        </section>

        {/* Promoted listings sit above the categories: the first thing after
            the hero, which is what a seller is paying for. Renders nothing
            when no placement is live, so the page is unchanged until then. */}
        <FeaturedCarousel />

        <section className="mt-9 sm:mt-12" aria-labelledby="store-categories-title">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <span className="text-[9px] font-black tracking-[.25em] text-violet-400">SHOP BY CATEGORY</span>
              <h2 id="store-categories-title" className="mt-1 text-xl font-black sm:text-2xl">دسته‌بندی‌های فروشگاه</h2>
            </div>
            <span className="hidden text-xs text-gray-600 sm:block">برای انتخاب، روی دسته موردنظر بزنید</span>
          </div>

          <div className="scrollbar-hide -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setFilter(item.id);
                  document.getElementById("products")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`group relative min-h-[120px] min-w-[135px] snap-start overflow-hidden rounded-[24px] border bg-gradient-to-br p-4 text-right transition lg:min-w-0 ${item.color} ${
                  filter === item.id
                    ? "border-violet-300/60 ring-2 ring-violet-400/15"
                    : "border-white/[.08] hover:-translate-y-1 hover:border-white/20"
                }`}
              >
                <div className="absolute -bottom-8 -left-7 h-24 w-24 rounded-full bg-white/[.04]" />
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[8px] font-black tracking-[.16em] text-white/35">{item.eyebrow}</span>
                  {filter === item.id && <span className="grid h-5 w-5 place-items-center rounded-full bg-violet-500 text-white"><StoreIcon name="check" className="h-3 w-3" /></span>}
                </div>
                <div className="absolute bottom-3 left-3">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" className="h-12 w-12 rounded-2xl object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,.5)] transition group-hover:scale-110" loading="lazy" decoding="async" />
                  ) : (
                    <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-black/20 text-white/70">
                      <StoreIcon name={item.icon || "grid"} className="h-6 w-6" />
                    </span>
                  )}
                </div>
                <span className="absolute bottom-4 right-4 max-w-[72px] text-xs font-black leading-5 text-white">{item.shortLabel}</span>
              </button>
            ))}
          </div>
        </section>

        <section id="products" className="scroll-mt-40 pt-10 sm:pt-12" aria-labelledby="products-heading">
          <div className="mb-5 flex flex-col gap-4 border-b border-white/[.07] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-[9px] font-black tracking-[.25em] text-cyan-400">GAMENT MARKETPLACE</span>
              <h2 id="products-heading" className="mt-1 text-xl font-black sm:text-2xl">{activeFilter.label}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {loading ? "در حال به‌روزرسانی محصولات..." : `${items.length.toLocaleString("fa-IR")} محصول در این صفحه`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMobileFilters((value) => !value)}
                className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black lg:hidden ${showMobileFilters || hasActiveFilters ? "border-violet-400/40 bg-violet-500/10 text-violet-200" : "border-white/10 bg-white/[.04] text-gray-300"}`}
              >
                <StoreIcon name="sliders" className="h-4 w-4" />
                فیلترها
                {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />}
              </button>
              <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 sm:min-w-[170px]">
                <span className="shrink-0 text-[10px] text-gray-500">مرتب‌سازی:</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as typeof sort)}
                  aria-label="مرتب‌سازی محصولات"
                  className="min-w-0 flex-1 bg-transparent text-xs font-black text-white outline-none [color-scheme:dark]"
                >
                  <option value="newest">جدیدترین</option>
                  <option value="bestselling">پرفروش‌ترین</option>
                  <option value="cheapest">ارزان‌ترین</option>
                  <option value="expensive">گران‌ترین</option>
                </select>
              </label>
            </div>
          </div>

          {showMobileFilters && (
            <div className="mb-5 rounded-[26px] border border-white/10 bg-[#101119] p-4 lg:hidden">
              {filterPanel}
            </div>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="sticky top-28 hidden rounded-[26px] border border-white/[.08] bg-white/[.025] p-4 lg:block" aria-label="فیلتر محصولات">
              {filterPanel}
            </aside>

            <div className="min-w-0">
              {loading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className="overflow-hidden rounded-[24px] border border-white/[.07] bg-white/[.025]">
                      <div className="aspect-[4/3] animate-pulse bg-white/[.055]" />
                      <div className="space-y-3 p-4">
                        <div className="h-3 w-1/3 animate-pulse rounded-full bg-white/[.06]" />
                        <div className="h-4 w-full animate-pulse rounded-full bg-white/[.06]" />
                        <div className="h-4 w-2/3 animate-pulse rounded-full bg-white/[.06]" />
                        <div className="h-10 animate-pulse rounded-xl bg-white/[.06]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : loadError ? (
                <div className="rounded-[28px] border border-red-400/15 bg-red-500/[.045] px-5 py-16 text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-red-300"><StoreIcon name="info" className="h-7 w-7" /></span>
                  <h3 className="mt-4 font-black">دریافت محصولات ناموفق بود</h3>
                  <p className="mt-2 text-xs text-gray-500">ارتباط با فروشگاه برقرار نشد. چند لحظه دیگر دوباره تلاش کنید.</p>
                  <button onClick={load} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-black">
                    <StoreIcon name="refresh" className="h-4 w-4" /> تلاش دوباره
                  </button>
                </div>
              ) : items.length === 0 ? (
                <div className="relative overflow-hidden rounded-[28px] border border-white/[.08] bg-white/[.025] px-5 py-16 text-center">
                  <div className="absolute left-1/2 top-0 h-40 w-80 -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />
                  <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-[22px] border border-white/10 bg-white/[.05] text-violet-300">
                    <StoreIcon name="shopping-bag" className="h-8 w-8" />
                  </span>
                  <h3 className="relative mt-5 text-lg font-black">محصولی با این مشخصات پیدا نشد</h3>
                  <p className="relative mx-auto mt-2 max-w-md text-xs leading-6 text-gray-500">فیلترها را تغییر دهید یا اولین فروشنده این دسته باشید و محصول خود را در بازار Flexa ثبت کنید.</p>
                  <div className="relative mt-5 flex flex-wrap justify-center gap-2">
                    {hasActiveFilters && <button onClick={resetFilters} className="rounded-xl border border-white/10 bg-white/[.05] px-4 py-2.5 text-xs font-black text-gray-200">نمایش همه محصولات</button>}
                    <Link href="/store/sell" className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black"><StoreIcon name="plus" className="h-4 w-4" /> ثبت آگهی فروش</Link>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {items.map((listing) => (
                    <article key={listing.id} className="group flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-white/[.08] bg-[#0f1017] shadow-[0_14px_35px_rgba(0,0,0,.18)] transition duration-300 hover:-translate-y-1 hover:border-violet-300/30 hover:shadow-[0_18px_45px_rgba(0,0,0,.32)]">
                      <Link href={`/store/${listing.id}`} className="relative block aspect-[4/3] overflow-hidden bg-[#14151e]">
                        {listing.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={listing.images[0]} alt={listing.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
                        ) : (
                          <ProductFallback listing={listing} />
                        )}
                        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
                        <span className={`absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-black backdrop-blur-md ${
                          listing.source === "official"
                            ? "border-amber-200/20 bg-amber-400/90 text-black"
                            : "border-white/10 bg-black/55 text-white"
                        }`}>
                          {listing.source === "official" && <StoreIcon name="badge-check" className="h-3 w-3" />}
                          {listing.source === "official" ? "فروشگاه رسمی" : "فروش کاربر"}
                        </span>
                        {listing.stock > 0 && listing.stock <= 3 && (
                          <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-red-500/90 px-2 py-1 text-[9px] font-black text-white">تنها {listing.stock.toLocaleString("fa-IR")} عدد</span>
                        )}
                      </Link>

                      <div className="flex flex-1 flex-col p-3.5">
                        <div className="mb-2 flex min-h-5 flex-wrap items-center gap-1.5 text-[9px] font-bold text-gray-500">
                          {listing.game && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-white/[.05] px-1.5 py-1">
                              {GAME_ICONS[listing.game] && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={GAME_ICONS[listing.game]} alt="" className="h-3.5 w-3.5 object-contain" loading="lazy" decoding="async" />
                              )}
                              {GAME_LABELS[listing.game] || listing.game}
                            </span>
                          )}
                          {listing.kind === "currency" && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-1 text-violet-300">
                              {listing.currencyAmount ? listing.currencyAmount.toLocaleString("fa-IR") : ""} {CURRENCY_LABELS[listing.currencyKind || "other"]}
                            </span>
                          )}
                          {codmChips(listing).map((chip) => <span key={chip} className="rounded-md bg-orange-500/10 px-1.5 py-1 text-orange-300">{chip}</span>)}
                        </div>

                        <Link href={`/store/${listing.id}`} className="line-clamp-2 min-h-12 text-[12px] font-black leading-6 text-gray-100 transition hover:text-violet-200 sm:text-[13px]">
                          {listing.title}
                        </Link>

                        <div className="mt-2 min-h-5 text-[9px] text-gray-500">
                          {listing.source === "user" ? (
                            <span className="inline-flex items-center gap-1"><StoreIcon name="user" className="h-3.5 w-3.5" /> {listing.sellerName || "فروشنده احرازشده"}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-400/75"><StoreIcon name="badge-check" className="h-3.5 w-3.5" /> عرضه مستقیم Flexa</span>
                          )}
                          {listing.soldCount > 0 && <span> · {listing.soldCount.toLocaleString("fa-IR")} فروش</span>}
                        </div>

                        {Boolean(listing.warrantyDays) && (
                          <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-lg bg-emerald-500/[.09] px-2 py-1 text-[9px] font-black text-emerald-300">
                            <StoreIcon name="shield" className="h-3 w-3" /> {listing.warrantyDays?.toLocaleString("fa-IR")} روز گارانتی
                          </span>
                        )}

                        <div className="mt-auto border-t border-white/[.06] pt-3">
                          <span className="block text-[9px] text-gray-600">قیمت نهایی</span>
                          <div className="mt-0.5 text-sm font-black text-white sm:text-base">{toman(listing.priceToman)}</div>
                          <Link href={`/store/${listing.id}`} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 py-2.5 text-[10px] font-black text-white transition group-hover:bg-violet-500">
                            مشاهده و خرید
                            <StoreIcon name="chevron-left" className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-12 grid grid-cols-2 gap-3 overflow-hidden rounded-[28px] border border-white/[.07] bg-white/[.025] p-4 sm:grid-cols-4 sm:p-6" aria-label="مزایای فروشگاه Flexa">
          {[
            { icon: "shield" as StoreIconName, title: "پرداخت امانی", text: "وجه تا تأیید شما امن است", color: "text-emerald-300 bg-emerald-500/10" },
            { icon: "badge-check" as StoreIconName, title: "فروشنده معتبر", text: "احراز هویت پیش از فروش", color: "text-violet-300 bg-violet-500/10" },
            { icon: "clock" as StoreIconName, title: "مهلت تحویل", text: "بازپرداخت خودکار در تأخیر", color: "text-cyan-300 bg-cyan-500/10" },
            { icon: "headset" as StoreIconName, title: "داوری اختلاف", text: "بررسی اعتراض توسط Flexa", color: "text-amber-300 bg-amber-500/10" },
          ].map((feature) => (
            <div key={feature.title} className="flex items-center gap-3 rounded-2xl p-2 sm:p-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${feature.color}`}><StoreIcon name={feature.icon} className="h-5 w-5" /></span>
              <span>
                <span className="block text-xs font-black text-gray-100">{feature.title}</span>
                <span className="mt-1 hidden text-[10px] text-gray-600 min-[420px]:block">{feature.text}</span>
              </span>
            </div>
          ))}
        </section>
      </div>

      <BottomNav />
    </main>
  );
}
