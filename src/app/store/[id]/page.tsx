"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import StoreIcon from "@/components/store/StoreIcon";

interface Listing {
  id: string;
  source: "official" | "user";
  kind: string;
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
  sellerId: string | null;
  sellerName: string | null;
  sellerVerified: boolean | null;
}

interface SellerInfo {
  stats: {
    avgRating: number;
    reviewCount: number;
    completedSales: number;
    tierLabel: string;
  };
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  buyerName: string | null;
  createdAt: string;
}

const KIND_LABELS: Record<string, string> = {
  currency: "ارز داخل بازی", account: "اکانت بازی", item: "آیتم", service: "خدمات",
};
const GAME_LABELS: Record<string, string> = {
  clash_royale: "کلش رویال", cod_mobile: "کالاف دیوتی موبایل", fortnite: "فورتنایت",
};
const CURRENCY_LABELS: Record<string, string> = {
  gem: "جم", cp: "CP", uc: "UC", vbucks: "وی‌باکس", coin: "سکه", gold: "طلا", other: "ارز",
};
const CURRENCY_ICONS: Record<string, string> = {
  gem: "/icons/currencies/gem.png",
  uc: "/icons/currencies/uc.png",
  cp: "/icons/currencies/cp.png",
  vbucks: "/icons/currencies/vbucks.png",
};

function toman(n: number) { return `${Math.round(n).toLocaleString("fa-IR")} USDT`; }
function codmMeta(listing: Listing | null) {
  return listing?.kind === "account" && listing.game === "cod_mobile" ? listing.metadata?.codm || null : null;
}
function metaValue(value: unknown) {
  if (value === true) return "دارد";
  if (value === false || value === null || value === undefined || value === "") return "—";
  return String(value);
}

function roundNice(n: number, dir: "down" | "up" | "near" = "near"): number {
  if (n <= 0) return 0;
  let step = 1000;
  if (n >= 50_000_000) step = 1_000_000;
  else if (n >= 10_000_000) step = 500_000;
  else if (n >= 2_000_000) step = 100_000;
  else if (n >= 500_000) step = 50_000;
  else if (n >= 100_000) step = 10_000;
  else step = 5_000;
  const q = n / step;
  const r = dir === "down" ? Math.floor(q) : dir === "up" ? Math.ceil(q) : Math.round(q);
  return Math.max(step, r * step);
}

export default function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [seller, setSeller] = useState<SellerInfo | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  // Price-offer (negotiation) state.
  const [showOffer, setShowOffer] = useState(false);
  const [offerToman, setOfferToman] = useState("");
  const [offerMsg, setOfferMsg] = useState("");
  const [sendingOffer, setSendingOffer] = useState(false);

  useEffect(() => {
    fetch(`/api/store/listings/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        setListing(d.listing);
        // For user listings, load the seller's reputation + reviews.
        if (d.listing?.source === "user" && d.listing?.sellerId) {
          fetch(`/api/store/seller/${d.listing.sellerId}`, { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((s) => s && setSeller(s))
            .catch(() => {});
          fetch(`/api/store/reviews?sellerId=${d.listing.sellerId}`, { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : { items: [] }))
            .then((s) => setReviews(Array.isArray(s.items) ? s.items : []))
            .catch(() => {});
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 4000); return () => clearTimeout(t); }, [msg]);

  async function buy() {
    if (!listing || buying) return;
    const finalPrice = listing.priceToman * qty;
    const accepted = window.confirm(
      `سفارش «${listing.title}» با مبلغ ${toman(finalPrice)} ثبت شود؟\n\nمبلغ از کیف پول شما کسر و تا تأیید تحویل، به‌صورت امانی نزد Flexa نگه داشته می‌شود.`
    );
    if (!accepted) return;
    setBuying(true);
    try {
      const res = await fetch("/api/store/orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ listingId: listing.id, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setMsg({ type: "err", text: "برای خرید ابتدا وارد شوید." });
          setTimeout(() => router.push("/login"), 1200);
        } else {
          setMsg({ type: "err", text: data.error || "خرید ناموفق بود." });
        }
        return;
      }
      setMsg({ type: "ok", text: "سفارش ثبت شد و مبلغ امانی نگه داشته شد." });
      setTimeout(() => router.push("/store/orders"), 1200);
    } catch {
      setMsg({ type: "err", text: "خطای ارتباط با سرور." });
    } finally {
      setBuying(false);
    }
  }

  async function sendOffer() {
    if (!listing || sendingOffer) return;
    const amount = Number(offerToman);
    if (!Number.isFinite(amount) || amount < 1000) {
      setMsg({ type: "err", text: "مبلغ پیشنهادی معتبر نیست." });
      return;
    }
    setSendingOffer(true);
    try {
      const res = await fetch("/api/store/offers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ listingId: listing.id, offerToman: Math.floor(amount), message: offerMsg || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setMsg({ type: "err", text: "برای پیشنهاد قیمت ابتدا وارد شوید." });
          setTimeout(() => router.push("/login"), 1200);
        } else {
          setMsg({ type: "err", text: data.error || "ثبت پیشنهاد ناموفق بود." });
        }
        return;
      }
      setMsg({ type: "ok", text: "پیشنهاد شما برای فروشنده ارسال شد. نتیجه را در «سفارش‌ها» می‌بینید." });
      setShowOffer(false);
      setOfferToman("");
      setOfferMsg("");
    } catch {
      setMsg({ type: "err", text: "خطای ارتباط با سرور." });
    } finally {
      setSendingOffer(false);
    }
  }

  async function reportListing() {
    if (!listing) return;
    const reasonKey = window.prompt(
      "دلیل گزارش را با شماره انتخاب کنید:\n1) کلاهبرداری\n2) آگهی جعلی\n3) قیمت نادرست\n4) محتوای نامناسب\n5) اکانت سرقتی\n6) سایر"
    );
    const map: Record<string, string> = {
      "1": "fraud", "2": "fake", "3": "wrong_price", "4": "inappropriate", "5": "stolen_account", "6": "other",
    };
    const reason = map[String(reasonKey || "").trim()];
    if (!reason) return;
    const details = window.prompt("توضیح (اختیاری):") || undefined;
    try {
      const res = await fetch("/api/store/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ listingId: listing.id, sellerId: listing.sellerId, reason, details }),
      });
      if (res.status === 401) {
        setMsg({ type: "err", text: "برای گزارش ابتدا وارد شوید." });
        return;
      }
      setMsg(res.ok ? { type: "ok", text: "گزارش شما ثبت شد و بررسی می‌شود." } : { type: "err", text: "ثبت گزارش ناموفق بود." });
    } catch {
      setMsg({ type: "err", text: "خطای ارتباط." });
    }
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-[#07080d] px-4 py-8 text-white">
        <div className="mx-auto max-w-7xl animate-pulse">
          <div className="h-11 w-56 rounded-2xl bg-white/[.05]" />
          <div className="mt-8 grid gap-7 lg:grid-cols-[1.08fr_.92fr]">
            <div className="aspect-[4/3] rounded-[30px] bg-white/[.05]" />
            <div className="space-y-4 py-3">
              <div className="h-6 w-36 rounded-full bg-white/[.05]" />
              <div className="h-10 w-5/6 rounded-2xl bg-white/[.05]" />
              <div className="h-24 rounded-[24px] bg-white/[.05]" />
              <div className="h-48 rounded-[26px] bg-white/[.05]" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !listing) {
    return (
      <main className="grid min-h-[70dvh] place-items-center bg-[#07080d] px-6 text-center text-white">
        <div>
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-[26px] border border-white/10 bg-white/[.04] text-violet-300">
            <StoreIcon name="search" className="h-9 w-9" />
          </span>
          <h1 className="mt-5 text-xl font-black">این محصول در دسترس نیست</h1>
          <p className="mt-2 text-sm text-gray-500">ممکن است آگهی فروخته یا غیرفعال شده باشد.</p>
          <Link href="/store" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black">
            بازگشت به فروشگاه
            <StoreIcon name="arrow-left" className="h-4 w-4" />
          </Link>
        </div>
      </main>
    );
  }

  const images = listing.images?.length ? listing.images : [];
  const totalToman = listing.priceToman * qty;
  const productIcon =
    listing.kind === "currency"
      ? CURRENCY_ICONS[listing.currencyKind || ""]
      : listing.game
        ? ({
            clash_royale: "/icons/icon-clash_royale.png",
            cod_mobile: "/icons/icon-cod_mobile.png",
            fortnite: "/icons/icon-fortnite.png",
          } as Record<string, string>)[listing.game]
        : undefined;
  const codm = codmMeta(listing);

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[#07080d] pb-28 text-white" dir="rtl">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(124,58,237,.14),transparent_30%),radial-gradient(circle_at_10%_35%,rgba(6,182,212,.07),transparent_25%)]" />

      <div className="relative z-30 border-b border-white/[.06] bg-[#0b0c12] px-4 py-2 text-center text-[10px] font-bold text-gray-400 sm:text-xs">
        <span className="inline-flex items-center gap-1.5">
          <StoreIcon name="shield" className="h-3.5 w-3.5 text-emerald-400" />
          خرید امن با پرداخت امانی و ضمانت بازگشت وجه
        </span>
      </div>

      <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#090a10]/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/store" className="flex items-center gap-2.5" aria-label="فروشگاه Flexa">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/flexa-icon-192.png" alt="Flexa" className="h-10 w-10 object-contain drop-shadow-[0_0_15px_rgba(168,85,247,.45)]" />
            <div className="hidden sm:block">
              <div className="text-[8px] font-black tracking-[.2em] text-violet-300">GAMENT STORE</div>
              <div className="text-sm font-black">فروشگاه Flexa</div>
            </div>
          </Link>
          <nav className="mr-auto flex items-center gap-2" aria-label="دسترسی‌های فروشگاه">
            <Link href="/wallet" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[.04] text-gray-300 hover:text-violet-200" title="کیف پول">
              <StoreIcon name="wallet" className="h-5 w-5" />
            </Link>
            <Link href="/store/orders" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 text-xs font-black text-gray-200">
              <StoreIcon name="box" className="h-4.5 w-4.5" />
              <span className="hidden min-[420px]:inline">سفارش‌ها</span>
            </Link>
            <Link href="/store" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-black">
              <StoreIcon name="store" className="h-4 w-4" />
              <span className="hidden sm:inline">همه محصولات</span>
            </Link>
          </nav>
        </div>
      </header>

      <div className="relative mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        <nav className="mb-5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500" aria-label="مسیر صفحه">
          <Link href="/" className="hover:text-white">Flexa</Link>
          <StoreIcon name="chevron-left" className="h-3 w-3" />
          <Link href="/store" className="hover:text-white">فروشگاه</Link>
          <StoreIcon name="chevron-left" className="h-3 w-3" />
          <span className="max-w-[220px] truncate text-gray-300">{listing.title}</span>
        </nav>

        <div className="grid items-start gap-6 lg:grid-cols-[1.08fr_.92fr] lg:gap-9">
          <section className="lg:sticky lg:top-24" aria-label="تصاویر محصول">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[30px] border border-white/[.09] bg-[#11121a] shadow-[0_25px_70px_rgba(0,0,0,.32)] sm:rounded-[36px]">
              {images[activeImg] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[activeImg]} alt={listing.title} className="h-full w-full object-contain" decoding="async" />
              ) : (
                <div className="relative grid h-full w-full place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_25%,rgba(168,85,247,.25),transparent_38%),linear-gradient(145deg,#191628,#0b0c13)]">
                  <div className="absolute inset-0 opacity-[.07] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:38px_38px]" />
                  {productIcon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={productIcon} alt="" className="relative h-36 w-36 rounded-[34px] object-contain drop-shadow-[0_28px_45px_rgba(0,0,0,.55)] sm:h-48 sm:w-48" />
                  ) : (
                    <StoreIcon name={listing.kind === "account" ? "user" : listing.kind === "service" ? "briefcase" : "shopping-bag"} className="relative h-28 w-28 text-white/20" />
                  )}
                </div>
              )}
              <span className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[10px] font-black backdrop-blur-xl ${
                listing.source === "official"
                  ? "border-amber-200/20 bg-amber-400/90 text-black"
                  : "border-white/10 bg-black/60 text-white"
              }`}>
                {listing.source === "official" ? <StoreIcon name="badge-check" className="h-3.5 w-3.5" /> : <StoreIcon name="user" className="h-3.5 w-3.5" />}
                {listing.source === "official" ? "محصول رسمی Flexa" : "فروش کاربر"}
              </span>
            </div>

            {images.length > 1 && (
              <div className="scrollbar-hide mt-3 flex gap-2 overflow-x-auto pb-1">
                {images.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    onClick={() => setActiveImg(index)}
                    aria-label={`نمایش تصویر ${index + 1}`}
                    className={`h-20 w-20 shrink-0 overflow-hidden rounded-2xl border bg-[#11121a] p-1 transition ${activeImg === index ? "border-violet-400 ring-2 ring-violet-400/15" : "border-white/10 hover:border-white/25"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt="" className="h-full w-full rounded-xl object-cover" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { icon: "shield" as const, title: "پرداخت امانی", text: "وجه امن می‌ماند" },
                { icon: "clock" as const, title: "مهلت تحویل", text: "حداکثر ۲۴ ساعت" },
                { icon: "headset" as const, title: "داوری Flexa", text: "حل اختلاف معامله" },
              ].map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-3 text-center">
                  <StoreIcon name={feature.icon} className="mx-auto h-5 w-5 text-violet-300" />
                  <strong className="mt-2 block text-[10px] font-black text-gray-200 sm:text-xs">{feature.title}</strong>
                  <span className="mt-1 hidden text-[9px] text-gray-600 min-[440px]:block">{feature.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="product-title">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300/15 bg-violet-500/10 px-2.5 py-1.5 text-violet-200">
                {listing.kind === "currency" && CURRENCY_ICONS[listing.currencyKind || ""] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={CURRENCY_ICONS[listing.currencyKind || ""]} alt="" className="h-4 w-4 rounded object-cover" />
                )}
                {listing.kind === "currency" ? CURRENCY_LABELS[listing.currencyKind || "other"] : KIND_LABELS[listing.kind] || listing.kind}
              </span>
              {listing.game && <span className="rounded-lg border border-white/[.07] bg-white/[.04] px-2.5 py-1.5 text-gray-300">{GAME_LABELS[listing.game] || listing.game}</span>}
              {codm?.level && <span className="rounded-lg bg-orange-500/10 px-2.5 py-1.5 text-orange-300">Level {codm.level}</span>}
              {codm?.mythicWeapons ? <span className="rounded-lg bg-fuchsia-500/10 px-2.5 py-1.5 text-fuchsia-300">{codm.mythicWeapons} Mythic</span> : null}
              {codm?.legendaryWeapons ? <span className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-amber-300">{codm.legendaryWeapons} Legendary</span> : null}
              {listing.stock > 0 && <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> موجود</span>}
            </div>

            <h1 id="product-title" className="mt-4 text-2xl font-black leading-[1.55] tracking-tight sm:text-3xl lg:text-4xl">{listing.title}</h1>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              {listing.kind === "currency" && listing.currencyAmount ? (
                <span className="font-black text-violet-300">{listing.currencyAmount.toLocaleString("fa-IR")} {CURRENCY_LABELS[listing.currencyKind || "other"]}</span>
              ) : null}
              {listing.soldCount > 0 && <span>{listing.soldCount.toLocaleString("fa-IR")} فروش موفق</span>}
              <span>کد کالا: {listing.id.slice(0, 8).toUpperCase()}</span>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/[.08] bg-white/[.028] p-4">
              {listing.source === "official" ? (
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-300/15 bg-amber-400/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/flexa-icon-192.png" alt="" className="h-9 w-9 object-contain" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-black">فروشگاه رسمی Flexa <StoreIcon name="badge-check" className="h-4 w-4 text-amber-300" /></div>
                    <p className="mt-1 text-[10px] text-gray-500">عرضه مستقیم، تحویل و پشتیبانی توسط تیم Flexa</p>
                  </div>
                  <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[9px] font-black text-emerald-300">تأییدشده</span>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/10 text-violet-300"><StoreIcon name="user" className="h-6 w-6" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-black">
                        {listing.sellerName || "فروشنده Flexa"}
                        {listing.sellerVerified && <StoreIcon name="badge-check" className="h-4 w-4 text-emerald-400" />}
                      </div>
                      <p className="mt-1 text-[10px] text-gray-500">هویت فروشنده توسط Flexa بررسی شده است</p>
                    </div>
                    {seller && <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-[9px] font-black text-amber-300">{seller.stats.tierLabel}</span>}
                  </div>
                  {seller && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[.06] pt-3 text-[10px] text-gray-400">
                      <span className="inline-flex items-center gap-1 text-amber-300"><StoreIcon name="star" className="h-3.5 w-3.5 fill-current" /> {seller.stats.avgRating > 0 ? seller.stats.avgRating.toLocaleString("fa-IR") : "بدون امتیاز"}</span>
                      <span>{seller.stats.reviewCount.toLocaleString("fa-IR")} نظر</span>
                      <span>{seller.stats.completedSales.toLocaleString("fa-IR")} فروش موفق</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 overflow-hidden rounded-[28px] border border-violet-300/15 bg-[linear-gradient(145deg,rgba(124,58,237,.11),rgba(255,255,255,.025))] p-5 shadow-[0_20px_55px_rgba(0,0,0,.2)] sm:p-6">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold text-gray-500">قیمت نهایی</span>
                  <div className="mt-1 text-2xl font-black text-white sm:text-3xl">{toman(listing.priceToman)}</div>
                </div>
                <div className="text-left text-[10px] text-gray-500">
                  <span className="block">موجودی</span>
                  <strong className={listing.stock > 0 ? "mt-1 block text-emerald-300" : "mt-1 block text-red-300"}>{listing.stock > 0 ? `${listing.stock.toLocaleString("fa-IR")} عدد` : "ناموجود"}</strong>
                </div>
              </div>

              {listing.warrantyDays ? (
                <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-500/[.08] px-3 py-2 text-[10px] font-black text-emerald-300">
                  <StoreIcon name="shield" className="h-4 w-4" /> {listing.warrantyDays.toLocaleString("fa-IR")} روز گارانتی فروشنده
                </div>
              ) : null}

              {listing.stock > 0 ? (
                <div className="mt-5">
                  <div className="flex items-stretch gap-2.5">
                    {listing.kind !== "account" && (
                      <div className="flex h-13 shrink-0 items-center rounded-2xl border border-white/10 bg-black/20">
                        <button onClick={() => setQty((value) => Math.max(1, value - 1))} aria-label="کاهش تعداد" className="grid h-full w-11 place-items-center text-lg font-black text-gray-300 transition hover:text-white">−</button>
                        <span className="min-w-10 text-center text-sm font-black">{qty.toLocaleString("fa-IR")}</span>
                        <button onClick={() => setQty((value) => Math.min(listing.stock, value + 1))} aria-label="افزایش تعداد" className="grid h-full w-11 place-items-center text-lg font-black text-gray-300 transition hover:text-white">+</button>
                      </div>
                    )}
                    <button onClick={buy} disabled={buying} className="inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-black text-white shadow-[0_12px_30px_rgba(124,58,237,.28)] transition hover:bg-violet-500 active:scale-[.98] disabled:opacity-45">
                      <StoreIcon name="shopping-bag" className="h-5 w-5" />
                      {buying ? "در حال ثبت سفارش..." : "خرید امن"}
                    </button>
                  </div>
                  {qty > 1 && <p className="mt-3 text-left text-xs font-black text-violet-200">جمع سفارش: {toman(totalToman)}</p>}
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-gray-500"><StoreIcon name="shield" className="h-3.5 w-3.5 text-emerald-400" /> مبلغ تنها پس از تأیید دریافت شما آزاد می‌شود.</p>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-red-300/15 bg-red-500/[.07] px-4 py-3 text-center text-sm font-black text-red-300">این محصول فعلاً ناموجود است</div>
              )}
            </div>

            {listing.source === "user" && listing.stock > 0 && (
              <div className="mt-3">
                {!showOffer ? (
                  <button
                    onClick={() => {
                      setShowOffer(true);
                      if (!offerToman) setOfferToman(String(Math.round((listing.priceToman * 0.9) / 1000) * 1000));
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-500/[.07] py-3.5 text-xs font-black text-cyan-200 transition hover:bg-cyan-500/[.12]"
                  >
                    <StoreIcon name="tag" className="h-4.5 w-4.5" /> پیشنهاد قیمت به فروشنده
                  </button>
                ) : (
                  <div className="rounded-[24px] border border-cyan-300/20 bg-cyan-500/[.055] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-cyan-100">پیشنهاد قیمت شما</h3>
                        <p className="mt-1 text-[10px] text-gray-500">بازه پیشنهادی: {toman(roundNice(listing.priceToman * 0.8, "down"))} تا {toman(listing.priceToman)}</p>
                      </div>
                      <button onClick={() => setShowOffer(false)} className="rounded-lg px-2 py-1 text-[10px] font-bold text-gray-500 hover:bg-white/[.05] hover:text-white">بستن</button>
                    </div>
                    <label className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 focus-within:border-cyan-300/40">
                      <input value={offerToman} onChange={(event) => setOfferToman(event.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" dir="ltr" placeholder="مبلغ پیشنهادی" className="h-12 min-w-0 flex-1 bg-transparent text-left text-sm font-black outline-none" />
                      <span className="text-[10px] text-gray-500">USDT</span>
                    </label>
                    <textarea value={offerMsg} onChange={(event) => setOfferMsg(event.target.value.slice(0, 500))} placeholder="پیام برای فروشنده (اختیاری)" rows={2} className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-xs outline-none focus:border-cyan-300/40" />
                    <button onClick={sendOffer} disabled={sendingOffer} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 py-3 text-xs font-black transition hover:bg-cyan-500 disabled:opacity-45">
                      <StoreIcon name="tag" className="h-4 w-4" /> {sendingOffer ? "در حال ارسال..." : "ارسال پیشنهاد برای فروشنده"}
                    </button>
                    <p className="mt-2 text-[9px] leading-5 text-gray-600">در صورت پذیرش، سفارش با مبلغ توافق‌شده ثبت و وجه به‌صورت امانی نگهداری می‌شود.</p>
                  </div>
                )}
              </div>
            )}

            {listing.source === "user" && (
              <button onClick={reportListing} className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-bold text-gray-600 transition hover:text-red-300">
                <StoreIcon name="info" className="h-3.5 w-3.5" /> گزارش تخلف در این آگهی
              </button>
            )}
          </section>
        </div>

        {codm && <section className="mt-10 rounded-[28px] border border-orange-500/20 bg-orange-950/10 p-5 sm:p-6"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500/10 text-orange-300">🎯</span><h2 className="text-lg font-black">مشخصات اکانت کالاف دیوتی موبایل</h2></div><div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">{[
          ["لول", codm.level], ["ریجن", String(codm.region || "").toUpperCase()], ["پلتفرم", codm.platform], ["روش ورود", codm.loginMethod],
          ["CP", codm.cpBalance], ["Mythic Gun", codm.mythicWeapons], ["Mythic Max", codm.maxedMythicWeapons], ["Legendary Gun", codm.legendaryWeapons],
          ["Epic Gun", codm.epicWeapons], ["Mythic Character", codm.mythicCharacters], ["Legendary Character", codm.legendaryCharacters], ["Epic Character", codm.epicCharacters],
          ["Diamond Camo", codm.diamondCamos], ["Damascus", metaValue(codm.damascusUnlocked)], ["Full Access", metaValue(codm.fullAccess)], ["Email Changeable", metaValue(codm.emailChangeable)],
        ].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] text-gray-500">{label}</div><div className="mt-1 text-xs font-black text-gray-100" dir="auto">{metaValue(value)}</div></div>)}</div>{codm.notableWeapons&&<div className="mt-4 rounded-2xl bg-black/25 p-4 text-xs leading-7"><b className="text-orange-300">گان‌های شاخص:</b><p className="mt-1 whitespace-pre-wrap text-gray-300">{codm.notableWeapons}</p></div>}{codm.notableCharacters&&<div className="mt-3 rounded-2xl bg-black/25 p-4 text-xs leading-7"><b className="text-purple-300">کاراکترهای شاخص:</b><p className="mt-1 whitespace-pre-wrap text-gray-300">{codm.notableCharacters}</p></div>}{codm.rareItems&&<div className="mt-3 rounded-2xl bg-black/25 p-4 text-xs leading-7"><b className="text-cyan-300">آیتم‌ها و نکات کمیاب:</b><p className="mt-1 whitespace-pre-wrap text-gray-300">{codm.rareItems}</p></div>}</section>}

        <section className="mt-10 grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="rounded-[28px] border border-white/[.08] bg-white/[.025] p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><StoreIcon name="info" className="h-5 w-5" /></span>
              <h2 className="text-lg font-black">توضیحات محصول</h2>
            </div>
            {listing.description ? (
              <p className="mt-5 whitespace-pre-wrap text-sm leading-8 text-gray-300">{listing.description}</p>
            ) : (
              <p className="mt-5 text-sm leading-8 text-gray-500">توضیح تکمیلی برای این محصول ثبت نشده است. مشخصات اصلی و شرایط معامله در بالای صفحه نمایش داده شده‌اند.</p>
            )}
          </div>
          <aside className="rounded-[28px] border border-white/[.08] bg-white/[.025] p-5">
            <h2 className="text-sm font-black">فرآیند خرید امن</h2>
            <ol className="mt-5 space-y-4">
              {[
                ["۱", "ثبت سفارش", "مبلغ از کیف پول به حساب امانی منتقل می‌شود."],
                ["۲", "تحویل کالا", "فروشنده حداکثر ۲۴ ساعت برای تحویل فرصت دارد."],
                ["۳", "تأیید یا اعتراض", "پس از بررسی کالا، دریافت را تأیید یا اعتراض کنید."],
              ].map(([step, title, text]) => (
                <li key={step} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-500/12 text-[10px] font-black text-violet-300">{step}</span>
                  <span><strong className="block text-xs font-black text-gray-200">{title}</strong><span className="mt-1 block text-[10px] leading-5 text-gray-600">{text}</span></span>
                </li>
              ))}
            </ol>
          </aside>
        </section>

        {listing.source === "user" && (
          <section className="mt-8" aria-labelledby="reviews-title">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <span className="text-[9px] font-black tracking-[.22em] text-amber-400">CUSTOMER REVIEWS</span>
                <h2 id="reviews-title" className="mt-1 text-lg font-black">نظر خریداران درباره فروشنده</h2>
              </div>
              {seller && seller.stats.reviewCount > 0 && <span className="inline-flex items-center gap-1 text-sm font-black text-amber-300"><StoreIcon name="star" className="h-4 w-4 fill-current" /> {seller.stats.avgRating.toLocaleString("fa-IR")}</span>}
            </div>
            {reviews.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {reviews.map((review) => (
                  <article key={review.id} className="rounded-[22px] border border-white/[.08] bg-white/[.025] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/[.05] text-gray-400"><StoreIcon name="user" className="h-4 w-4" /></span>
                        <span className="text-xs font-black text-gray-200">{review.buyerName || "خریدار Flexa"}</span>
                      </div>
                      <span className="flex gap-0.5 text-amber-400" aria-label={`${review.rating} از ۵ ستاره`}>
                        {Array.from({ length: 5 }).map((_, index) => <StoreIcon key={index} name="star" className={`h-3.5 w-3.5 ${index < review.rating ? "fill-current" : "text-gray-700"}`} />)}
                      </span>
                    </div>
                    {review.comment && <p className="mt-3 text-xs leading-7 text-gray-400">{review.comment}</p>}
                    <time className="mt-3 block text-[9px] text-gray-700">{new Date(review.createdAt).toLocaleDateString("fa-IR")}</time>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[.018] py-10 text-center text-xs text-gray-600">هنوز نظری برای این فروشنده ثبت نشده است.</div>
            )}
          </section>
        )}
      </div>

      {msg && (
        <div className={`fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border px-5 py-3 text-center text-sm font-bold shadow-2xl backdrop-blur-xl ${
          msg.type === "ok" ? "border-emerald-300/25 bg-emerald-600/95 text-white" : "border-red-300/25 bg-red-600/95 text-white"
        }`}>
          {msg.text}
        </div>
      )}

      <BottomNav />
    </main>
  );
}
