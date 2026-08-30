"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import ParticleField from "@/components/fx/ParticleField";
import HonorsIcon from "@/components/honors/HonorsIcon";
import styles from "../honors.module.css";

interface HonorDetail {
  id: string;
  type: string;
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
  sources?: Array<{ title: string; link: string; source: string; pubDate?: string | null }>;
  game?: string;
  publishedAt?: string | null;
  htmlUrl?: string;
  galleryImages?: Array<{ src: string; alt: string }>;
  likesCount?: number;
  viewsCount?: number;
  likedByMe?: boolean;
}

const SITE_URL = "https://www.flexa1.ir";

const GAME_LABELS: Record<string, string> = {
  clash_royale: "کلش رویال",
  cod_mobile: "کالاف موبایل",
  fortnite: "فورتنایت",
};

const GAME_ICONS: Record<string, string> = {
  clash_royale: "/icons/icon-clash_royale.png",
  cod_mobile: "/icons/icon-cod_mobile.png",
  fortnite: "/icons/icon-fortnite.png",
};


function absoluteUrl(path?: string) {
  if (!path) return SITE_URL;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function newsArticleJsonLd(honor: HonorDetail) {
  const description = (honor.summary || honor.description || "").replace(/\s+/g, " ").slice(0, 240);
  return {
    "@context": "https://schema.org",
    "@type": honor.type === "news" ? "NewsArticle" : "Article",
    headline: honor.title,
    description,
    image: honor.image ? [absoluteUrl(honor.image)] : undefined,
    datePublished: honor.publishedAt || undefined,
    dateModified: honor.publishedAt || undefined,
    inLanguage: "fa-IR",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": absoluteUrl(`/honors/${honor.id}`),
    },
    author: {
      "@type": "Organization",
      name: "Flexa",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Flexa",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/icons/flexa-icon-192.png"),
      },
    },
    keywords: honor.seoKeywords?.join(", "),
    articleSection: honor.game ? GAME_LABELS[honor.game] || honor.game : "گیمینگ",
  };
}

function breadcrumbJsonLd(honor: HonorDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "خانه", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "تالار افتخارات", item: absoluteUrl("/honors") },
      { "@type": "ListItem", position: 3, name: honor.title, item: absoluteUrl(`/honors/${honor.id}`) },
    ],
  };
}

function linkifyText(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)]+|store\.supercell\.com[^\s)]*)/gi);
  return parts.map((part, index) => {
    const isUrl = /^(https?:\/\/|store\.supercell\.com)/i.test(part);
    if (!isUrl) return <span key={index}>{part}</span>;
    const href = part.startsWith("http") ? part : `https://${part}`;
    return (
      <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline decoration-cyan-300/40 underline-offset-4 hover:text-cyan-200 break-all">
        {part}
      </a>
    );
  });
}

const TYPE_LABELS: Record<string, string> = {
  winner: "قهرمان",
  runner_up: "نایب‌قهرمان",
  levelup: "لول‌آپ",
  rankup: "ارتقای رتبه",
  record: "رکورد",
  fairplay: "بازیکن اخلاق",
  team: "افتخار تیمی",
  news: "خبر",
  event: "رویداد",
};

export default function HonorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [honor, setHonor] = useState<HonorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [engagementBusy, setEngagementBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/honors/${id}`, { cache: "no-store" })
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "افتخار پیدا نشد");
        setHonor(data);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "افتخار پیدا نشد"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const honorId = honor?.id;
  const honorHtmlUrl = honor?.htmlUrl;

  useEffect(() => {
    // Deliberately depends only on the primitive id/htmlUrl (not the whole
    // `honor` object) since this effect itself updates `honor` via
    // setHonor below — depending on the full object would re-trigger the
    // view-count POST on every stats update and create a request loop.
    if (!honorId || honorHtmlUrl) return;
    let cancelled = false;
    fetch(`/api/honors/${honorId}/engagement`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ action: "view" }),
      credentials: "include",
    })
      .then((res) => res.json())
      .then((stats) => {
        if (!cancelled) setHonor((prev) => prev ? { ...prev, ...stats } : prev);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [honorId, honorHtmlUrl]);

  async function toggleLike() {
    if (!honor || engagementBusy) return;
    setEngagementBusy(true);
    try {
      const res = await fetch(`/api/honors/${honor.id}/engagement`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ action: "like" }),
        credentials: "include",
      });
      const stats = await res.json();
      if (res.ok) setHonor((prev) => prev ? { ...prev, ...stats } : prev);
    } finally {
      setEngagementBusy(false);
    }
  }

  async function shareHonor() {
    if (!honor) return;
    const url = `${window.location.origin}/honors/${honor.id}`;
    const text = `${honor.title}\n${honor.summary || honor.description.slice(0, 220)}\n${url}`;
    if (navigator.share) {
      await navigator.share({ title: honor.title, text, url }).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(text).catch(() => undefined);
      alert("متن افتخار کپی شد.");
    }
  }

  if (loading) {
    return (
      <main className={`${styles.page} min-h-[100dvh] px-4 py-8 text-white`}>
        <div className="mx-auto max-w-7xl animate-pulse">
          <div className="h-12 w-52 rounded-2xl bg-white/[.05]" />
          <div className="mt-6 h-[520px] rounded-[38px] bg-white/[.045]" />
          <div className="mx-auto -mt-20 h-80 max-w-4xl rounded-[32px] bg-[#101117]" />
        </div>
      </main>
    );
  }

  if (error || !honor) {
    return (
      <main className={`${styles.page} grid min-h-[75dvh] place-items-center px-5 text-center text-white`}>
        <div>
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-[26px] border border-white/[.09] bg-white/[.035] text-amber-300"><HonorsIcon name="trophy" className="h-10 w-10" /></span>
          <h1 className="mt-5 text-xl font-black">این محتوا پیدا نشد</h1>
          <p className="mt-2 text-sm text-gray-600">{error || "ممکن است از آرشیو عمومی خارج شده باشد."}</p>
          <Link href="/honors" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-5 py-3 text-xs font-black text-black">بازگشت به تالار <HonorsIcon name="arrow" className="h-4 w-4" /></Link>
        </div>
      </main>
    );
  }

  if (honor.htmlUrl) {
    return (
      <main className={`${styles.page} min-h-screen text-white`}>
        <header className="sticky top-0 z-50 border-b border-white/[.08] bg-[#08090e]/90 backdrop-blur-2xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-3 sm:px-6">
            <Link href="/honors" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2 text-[10px] font-black text-gray-300"><HonorsIcon name="arrow" className="h-4 w-4 rotate-180" /> تالار</Link>
            <div className="min-w-0 flex-1">
              <span className="text-[8px] font-black tracking-[.18em] text-amber-300">{TYPE_LABELS[honor.type] || "خبر"}{honor.game ? ` · ${GAME_LABELS[honor.game] || honor.game}` : ""}</span>
              <h1 className="truncate text-xs font-black sm:text-sm">{honor.title}</h1>
            </div>
            <button onClick={shareHonor} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-[10px] font-black text-black"><HonorsIcon name="share" className="h-4 w-4" /> اشتراک</button>
          </div>
        </header>
        <iframe src={honor.htmlUrl} title={honor.title} className="block h-[calc(100dvh-64px)] w-full border-0 bg-[#0a0a2e]" />
      </main>
    );
  }

  const gameIcon = honor.game ? GAME_ICONS[honor.game] : undefined;

  return (
    <main className={`${styles.page} min-h-[100dvh] pb-28 text-white`} dir="rtl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(newsArticleJsonLd(honor)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(honor)) }} />

      <header className="relative z-40 border-b border-white/[.07] bg-[#08090e]/82 backdrop-blur-2xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/honors" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/flexa-icon-192.png" alt="Flexa" className="h-10 w-10 object-contain" />
            <div className="hidden sm:block"><div className="text-[8px] font-black tracking-[.22em] text-amber-300">GAMENT ARCHIVES</div><div className="text-sm font-black">تالار افتخارات</div></div>
          </Link>
          <nav className="mr-auto flex items-center gap-2">
            <Link href="/honors" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/[.08] bg-white/[.04] px-3 text-[10px] font-black text-gray-300"><HonorsIcon name="arrow" className="h-4 w-4 rotate-180" /> بازگشت</Link>
            <button onClick={shareHonor} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-amber-400 px-3 text-[10px] font-black text-black"><HonorsIcon name="share" className="h-4 w-4" /><span className="hidden min-[390px]:inline">اشتراک</span></button>
          </nav>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-8">
        <div className={`${styles.heroTexture} relative min-h-[510px] overflow-hidden rounded-[32px] border border-white/[.09] shadow-[0_30px_100px_rgba(0,0,0,.38)] sm:min-h-[590px] sm:rounded-[42px]`}>
          <ParticleField count={26} className="opacity-35" />
          {honor.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={honor.image} alt={honor.imageAlt || honor.title} className="absolute inset-0 h-full w-full object-cover opacity-75" decoding="async" />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_15%,rgba(245,158,11,.18),transparent_32%),linear-gradient(145deg,#21180e,#12101c_55%,#06161c)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#08090e] via-black/52 to-black/15" />
          <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-9 lg:p-12">
            <nav className="mb-6 flex flex-wrap items-center gap-2 text-[9px] font-bold text-gray-400" aria-label="مسیر صفحه">
              <Link href="/" className="hover:text-white">Flexa</Link><span>/</span><Link href="/honors" className="hover:text-white">تالار افتخارات</Link><span>/</span><span className="max-w-[220px] truncate text-gray-300">{honor.title}</span>
            </nav>
            <div className="flex flex-wrap items-center gap-2 text-[9px] font-black">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/15 bg-amber-400/15 px-2.5 py-1.5 text-amber-200 backdrop-blur-xl"><HonorsIcon name={honor.type === "news" ? "news" : "trophy"} className="h-3.5 w-3.5" /> {TYPE_LABELS[honor.type] || honor.type}</span>
              {honor.game && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-gray-200 backdrop-blur-xl">
                  {gameIcon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={gameIcon} alt="" className="h-3.5 w-3.5 object-contain" />
                  )}
                  {GAME_LABELS[honor.game] || honor.game}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-gray-400"><HonorsIcon name="clock" className="h-3.5 w-3.5" /> {honor.time}</span>
            </div>
            <h1 className="mt-5 max-w-5xl text-3xl font-black leading-[1.45] tracking-tight sm:text-5xl lg:text-6xl">{honor.title}</h1>
            {honor.summary && <p className="mt-4 max-w-3xl text-xs leading-7 text-gray-300 sm:text-sm sm:leading-8">{honor.summary}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3 text-[10px] font-bold text-gray-400">
              {honor.readTimeMinutes && <span className="inline-flex items-center gap-1.5"><HonorsIcon name="clock" className="h-4 w-4 text-cyan-300" /> {honor.readTimeMinutes.toLocaleString("fa-IR")} دقیقه مطالعه</span>}
              {honor.type === "news" && <><span className="inline-flex items-center gap-1.5"><HonorsIcon name="eye" className="h-4 w-4 text-violet-300" /> {(honor.viewsCount || 0).toLocaleString("fa-IR")} بازدید</span><span className="inline-flex items-center gap-1.5"><HonorsIcon name="heart" className="h-4 w-4 text-pink-300" /> {(honor.likesCount || 0).toLocaleString("fa-IR")} پسند</span></>}
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-2 grid max-w-6xl items-start gap-5 px-4 sm:px-6 lg:-mt-10 lg:grid-cols-[minmax(0,1fr)_310px]">
        <article className={`${styles.cardTexture} overflow-hidden rounded-[30px] border border-white/[.09] bg-[#0e0f15] p-5 shadow-[0_24px_65px_rgba(0,0,0,.26)] sm:p-8`}>
          <div className="mb-7 flex items-center justify-between gap-3 border-b border-white/[.07] pb-5">
            <div><span className="text-[8px] font-black tracking-[.22em] text-amber-400">THE FULL STORY</span><h2 className="mt-1 text-lg font-black">متن کامل</h2></div>
            <span className="grid h-10 w-10 place-items-center rounded-2xl border border-white/[.08] bg-white/[.035] text-amber-300"><HonorsIcon name={honor.type === "news" ? "news" : "trophy"} className="h-5 w-5" /></span>
          </div>

          <div className={styles.articleBody}>
            {honor.description.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index} className="whitespace-pre-wrap">{linkifyText(paragraph)}</p>)}
          </div>

          {honor.galleryImages?.length ? (
            <div className="mt-8 grid gap-4">
              {honor.galleryImages.map((image) => (
                <figure key={image.src} className="overflow-hidden rounded-[24px] border border-white/[.08] bg-black/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.src} alt={image.alt} className="h-auto w-full object-cover" loading="lazy" />
                  <figcaption className="border-t border-white/[.06] px-4 py-3 text-[10px] leading-6 text-gray-500">{image.alt}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}

          {honor.seoKeywords?.length ? (
            <div className="mt-8 border-t border-white/[.07] pt-5">
              <span className="mb-3 block text-[9px] font-black text-gray-600">موضوعات مرتبط</span>
              <div className="flex flex-wrap gap-2">{honor.seoKeywords.map((tag) => <span key={tag} className="rounded-lg border border-violet-300/10 bg-violet-500/[.06] px-2.5 py-1.5 text-[9px] font-bold text-violet-200">#{tag}</span>)}</div>
            </div>
          ) : null}

          {(honor.username || honor.level || honor.prize) && (
            <div className="mt-8 grid grid-cols-2 gap-3 border-t border-white/[.07] pt-6">
              {honor.username && <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><span className="text-[9px] text-gray-600">بازیکن</span><strong dir="ltr" className="mt-2 block text-sm">@{honor.username}</strong></div>}
              {honor.level && <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><span className="text-[9px] text-gray-600">سطح</span><strong className="mt-2 block text-sm">{honor.level.toLocaleString("fa-IR")}</strong></div>}
              {honor.prize && <div className="col-span-2 rounded-2xl border border-amber-300/10 bg-amber-400/[.055] p-4"><span className="text-[9px] text-gray-600">جایزه</span><strong className="mt-2 block text-sm text-amber-200">{honor.prize}</strong></div>}
            </div>
          )}
        </article>

        <aside className="space-y-4 lg:sticky lg:top-4">
          {honor.sources?.length ? (
            <section className={`${styles.cardTexture} rounded-[26px] border border-cyan-300/10 bg-cyan-500/[.035] p-4`}>
              <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-400/[.08] text-cyan-300"><HonorsIcon name="shield" className="h-5 w-5" /></span><div><span className="text-[8px] font-black tracking-[.18em] text-cyan-400">VERIFIED SOURCES</span><h2 className="mt-1 text-sm font-black">منابع خبر</h2></div></div>
              <p className="mt-3 text-[9px] leading-5 text-gray-600">این مطلب فقط از متن منابع زیر ترجمه و ویرایش شده است.</p>
              <div className="mt-4 space-y-2">
                {honor.sources.slice(0, 5).map((source, index) => (
                  <a key={`${source.link}-${index}`} href={source.link} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 rounded-2xl border border-white/[.06] bg-black/15 p-3 transition hover:border-cyan-300/20">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[.04] text-[9px] font-black text-cyan-300">{(index + 1).toLocaleString("fa-IR")}</span>
                    <span className="min-w-0 flex-1"><strong className="line-clamp-2 block text-[10px] font-black leading-5 text-gray-300 group-hover:text-white">{source.title}</strong><span className="mt-1 block text-[8px] text-gray-700">{source.source}</span></span>
                    <HonorsIcon name="external" className="h-3.5 w-3.5 shrink-0 text-gray-700" />
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {honor.type === "news" && (
            <section className="rounded-[26px] border border-white/[.08] bg-white/[.025] p-4">
              <h2 className="text-sm font-black">تعامل با این خبر</h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={toggleLike} disabled={engagementBusy} className={`inline-flex flex-col items-center justify-center rounded-2xl border py-3 text-[10px] font-black transition disabled:opacity-50 ${honor.likedByMe ? "border-pink-300/25 bg-pink-500/12 text-pink-200" : "border-white/[.08] bg-white/[.03] text-gray-400 hover:text-pink-200"}`}><HonorsIcon name="heart" className={`mb-1.5 h-5 w-5 ${honor.likedByMe ? "fill-current" : ""}`} /> {(honor.likesCount || 0).toLocaleString("fa-IR")} پسند</button>
                <div className="inline-flex flex-col items-center justify-center rounded-2xl border border-white/[.08] bg-white/[.03] py-3 text-[10px] font-black text-gray-400"><HonorsIcon name="eye" className="mb-1.5 h-5 w-5 text-violet-300" /> {(honor.viewsCount || 0).toLocaleString("fa-IR")} بازدید</div>
              </div>
              <button onClick={shareHonor} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-amber-300 to-yellow-500 py-3 text-[10px] font-black text-black"><HonorsIcon name="share" className="h-4 w-4" /> اشتراک‌گذاری مطلب</button>
            </section>
          )}

          <div className="rounded-[26px] border border-amber-300/10 bg-[radial-gradient(circle_at_80%_0%,rgba(245,158,11,.12),transparent_35%),rgba(255,255,255,.02)] p-4">
            <HonorsIcon name="crown" className="h-6 w-6 text-amber-300" />
            <h3 className="mt-3 text-sm font-black">تالار افتخارات Flexa</h3>
            <p className="mt-2 text-[9px] leading-5 text-gray-600">آرشیو قهرمانان، رکوردها و خبرهای رسمی بازی‌ها.</p>
            <Link href="/honors" className="mt-4 inline-flex items-center gap-1 text-[9px] font-black text-amber-300">مشاهده همه <HonorsIcon name="arrow" className="h-3.5 w-3.5" /></Link>
          </div>
        </aside>
      </div>

      <BottomNav />
    </main>
  );
}
