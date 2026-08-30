import Link from "next/link";
import AppImage from "@/components/AppImage";
import BottomNav from "@/components/BottomNav";
import DailyQuests from "@/components/DailyQuests";
import HeroScene from "@/components/fx/HeroScene";
import TiltCard from "@/components/fx/TiltCard";
import Reveal from "@/components/fx/Reveal";
import MagneticButton from "@/components/fx/MagneticButton";
import TrustBadges from "@/components/trust/TrustBadges";
import { SITE_URL } from "@/lib/seo";
import { db } from "@/db";
import { siteImages, tournaments, registrations } from "@/db/schema";
import { asc, desc, eq, count } from "drizzle-orm";
import { ttlCache } from "@/lib/server-cache";

interface SiteImageMeta {
  slug: string;
  title: string;
  category: string;
  altText?: string | null;
}

interface TournamentPreview {
  id: string;
  name: string;
  game: string;
  registeredCount?: number;
  maxPlayers?: number;
  entryFee?: string | null;
  prizePool?: string | null;
  startDate?: string | null;
  bannerUrl?: string | null;
}

interface HonorPreview {
  id: string;
  title: string;
  summary?: string;
  description: string;
  image?: string;
  game?: string;
  time?: string;
  readTimeMinutes?: number;
}

const GAMES = [
  {
    id: "cod_mobile",
    bannerSlug: "bg-codm",
    name: "COD MOBILE",
    faName: "کالاف موبایل",
    icon: "/icons/icon-cod_mobile.png",
    href: "/games/call-of-duty-mobile",
    accent: "from-orange-500 to-red-600",
    glow: "rgba(249,115,22,.28)",
    bg: "radial-gradient(circle at 72% 32%, rgba(255,140,0,.40), transparent 20%), linear-gradient(135deg, #090a10 0%, #151720 48%, #3a220d 100%)",
  },
  {
    id: "fortnite",
    bannerSlug: "bg-fortnite",
    name: "FORTNITE",
    faName: "فورتنایت",
    icon: "/icons/icon-fortnite.png",
    href: "/games/fortnite",
    accent: "from-purple-500 to-pink-600",
    glow: "rgba(188,0,255,.30)",
    bg: "radial-gradient(circle at 75% 25%, rgba(188,0,255,.38), transparent 20%), radial-gradient(circle at 22% 70%, rgba(0,210,255,.16), transparent 24%), linear-gradient(135deg, #090a10 0%, #151022 52%, #28103a 100%)",
  },
  {
    id: "clash_royale",
    bannerSlug: "bg-clash",
    name: "CLASH ROYALE",
    faName: "کلش رویال",
    icon: "/icons/icon-clash_royale.png",
    href: "/games/clash-royale",
    accent: "from-cyan-400 to-blue-600",
    glow: "rgba(34,211,238,.24)",
    bg: "radial-gradient(circle at 74% 32%, rgba(0,210,255,.34), transparent 20%), radial-gradient(circle at 24% 68%, rgba(255,230,0,.12), transparent 22%), linear-gradient(135deg, #080a12 0%, #101827 52%, #09283a 100%)",
  },
];

// Render live so the hero, game banners and tournaments always reflect the
// current database; the per-query ttlCache calls keep this cheap.
export const dynamic = "force-dynamic";

function gameLabel(game?: string | null) {
  if (game === "cod_mobile") return "کالاف موبایل";
  if (game === "fortnite") return "فورتنایت";
  if (game === "clash_royale") return "کلش رویال";
  return "گیمینگ";
}

function formatDate(value?: string | null) {
  if (!value) return "به‌زودی";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "به‌زودی";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function assetUrl(slug: string) {
  return `/api/public/images/asset?slug=${encodeURIComponent(slug)}`;
}

// Fetch only image metadata (no heavy base64 payload) and let the browser
// load the actual bytes through /api/public/images/asset, which caches them.
async function getSiteImageMeta(): Promise<SiteImageMeta[]> {
  try {
    const rows = await db
      .select({
        slug: siteImages.slug,
        title: siteImages.title,
        category: siteImages.category,
        altText: siteImages.altText,
      })
      .from(siteImages)
      .where(eq(siteImages.isActive, true))
      .orderBy(asc(siteImages.sortOrder));
    return rows;
  } catch {
    return [];
  }
}

async function getTournaments(): Promise<TournamentPreview[]> {
  try {
    return await ttlCache("home:tournaments:6", 30_000, async () => {
      const rows = await db
        .select({
          id: tournaments.id,
          name: tournaments.name,
          game: tournaments.game,
          maxPlayers: tournaments.maxPlayers,
          entryFee: tournaments.entryFee,
          prizePool: tournaments.prizePool,
          startDate: tournaments.startDate,
          bannerUrl: tournaments.bannerUrl,
          registeredCount: count(registrations.id),
        })
        .from(tournaments)
        .leftJoin(registrations, eq(tournaments.id, registrations.tournamentId))
        .groupBy(tournaments.id)
        .orderBy(desc(tournaments.createdAt))
        .limit(6);

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        game: r.game,
        maxPlayers: r.maxPlayers,
        entryFee: r.entryFee,
        prizePool: r.prizePool,
        startDate: r.startDate ? new Date(r.startDate).toISOString() : null,
        bannerUrl: r.bannerUrl,
        registeredCount: Number(r.registeredCount || 0),
      }));
    });
  } catch {
    return [];
  }
}

async function getHonors(): Promise<HonorPreview[]> {
  try {
    return await ttlCache("home:honors:3", 60_000, async () => {
      const res = await fetch(`${SITE_URL}/api/honors`, {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.filter((item: HonorPreview) => item).slice(0, 3) : [];
    });
  } catch {
    return [];
  }
}

export default async function LuxuryHomePage() {
  const [images, tournaments, honors] = await Promise.all([
    getSiteImageMeta(),
    getTournaments(),
    getHonors(),
  ]);

  const bySlug: Record<string, SiteImageMeta> = {};
  const byCategory: Record<string, SiteImageMeta> = {};
  for (const image of images) {
    bySlug[image.slug] = image;
    if (!byCategory[image.category]) byCategory[image.category] = image;
  }

  const heroImage = bySlug["home-hero"] || byCategory["hero"];
  const featuredTournament = tournaments[0];
  const featuredHonor = honors[0];

  return (
    <main
      className="min-h-screen text-white relative overflow-x-hidden selection:bg-purple-500/30 bg-[#050508]"
      dir="rtl"
    >
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_75%_0%,rgba(168,85,247,.28),transparent_34%),radial-gradient(circle_at_15%_18%,rgba(34,211,238,.14),transparent_32%),linear-gradient(140deg,#050508,#0b0b12_46%,#080411)]" />
      <div className="fixed inset-0 pointer-events-none opacity-[.08] bg-[linear-gradient(115deg,transparent_0_18%,rgba(255,255,255,.4)_18%_19%,transparent_19%_42%,rgba(255,255,255,.25)_42%_43%,transparent_43%)]" />

      <div
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8"
        style={{ paddingBottom: "var(--bottom-nav-space)" }}
      >
        <header className="flex items-center justify-between gap-4 mb-7 sm:mb-10">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <AppImage
              src="/icons/flexa-icon-192.png"
              alt="Flexa Logo"
              width={56}
              height={56}
              // First thing painted on the busiest page.
              priority
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-[0_0_18px_rgba(188,0,255,.55)] shrink-0"
            />
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-black text-cyan-300 tracking-[0.24em] mb-1">
                GAMENT ESPORTS
              </div>
              <h1 className="text-xl sm:text-3xl font-black leading-tight truncate">Flexa</h1>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/honors"
              className="hidden sm:inline-flex px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black hover:border-purple-300/40"
            >
              اخبار
            </Link>
            <Link
              href="/wallet"
              className="grid place-items-center w-12 h-12 rounded-2xl bg-purple-500/12 border border-purple-300/20 active:scale-95"
            >
              <AppImage src="/icons/wallet_icon.png" alt="کیف پول" width={32} height={32} className="w-8 h-8 object-contain" />
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[1.15fr_.85fr] gap-5 sm:gap-6 mb-10 sm:mb-14">
          <HeroScene
            heroImage={heroImage ? assetUrl(heroImage.slug) : null}
            heroAlt={heroImage?.altText || heroImage?.title}
            className="rounded-[34px] sm:rounded-[44px] border border-purple-300/20 min-h-[430px] sm:min-h-[510px] bg-[#0d0b16] shadow-[0_0_70px_rgba(124,58,237,.18)]"
          >
            <div className="relative h-full flex flex-col justify-end p-6 sm:p-9">
              <div className="inline-flex w-fit items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/15 border border-purple-300/20 text-[10px] font-black text-purple-100 mb-5 animate-slide-up">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                فصل جدید رقابت‌ها فعال است
              </div>
              <h2 className="text-4xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight max-w-3xl animate-slide-up [animation-delay:80ms] [animation-fill-mode:backwards]">
                آرنای حرفه‌ای<br />برگزاری تورنومنت
              </h2>
              <p className="text-sm sm:text-base text-gray-300 leading-8 mt-5 max-w-2xl animate-slide-up [animation-delay:160ms] [animation-fill-mode:backwards]">
                ثبت‌نام سریع، کیف پول امن، چک‌این، لابی اختصاصی، ثبت نتیجه، داوری قابل پیگیری و اخبار گیمینگ در یک پلتفرم فارسی.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mt-7 animate-slide-up [animation-delay:240ms] [animation-fill-mode:backwards]">
                <MagneticButton>
                  <Link href="/tournaments" className="gaming-btn text-sm sm:text-base px-6 py-4">
                    ورود به تورنومنت‌ها
                  </Link>
                </MagneticButton>
                <MagneticButton>
                  <Link
                    href="/register"
                    className="block px-6 py-4 rounded-2xl bg-white/7 border border-white/10 text-sm sm:text-base font-black text-center hover:border-cyan-300/40 active:scale-95 transition"
                  >
                    ساخت حساب رایگان
                  </Link>
                </MagneticButton>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-8 max-w-xl">
                {[
                  ["۳", "بازی اصلی"],
                  ["AI", "داوری هوشمند"],
                  ["۲۴/۷", "پشتیبانی"],
                ].map(([value, label], i) => (
                  <div
                    key={label}
                    className="rounded-2xl bg-white/[.06] border border-white/10 p-3 text-center backdrop-blur-md animate-slide-up [animation-fill-mode:backwards]"
                    style={{ animationDelay: `${320 + i * 90}ms` }}
                  >
                    <div className="text-lg sm:text-2xl font-black text-purple-200">{value}</div>
                    <div className="text-[10px] text-gray-400 mt-1">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </HeroScene>

          <aside className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            <TiltCard maxTilt={7} liftZ={12} className="rounded-[30px]">
              <Link
                href={featuredTournament ? `/tournaments/${featuredTournament.id}` : "/tournaments"}
                className="relative block overflow-hidden rounded-[30px] border border-cyan-300/15 bg-gradient-to-br from-cyan-950/30 to-[#0d0b16] p-5 min-h-[205px] group active:scale-[.99] transition"
              >
                <div className="absolute -top-14 -left-14 w-44 h-44 rounded-full bg-cyan-400/15 blur-3xl" />
                <div className="relative" style={{ transform: "translateZ(24px)" }}>
                  <div className="text-[10px] font-black tracking-[0.24em] text-cyan-300 mb-3">
                    NEXT TOURNAMENT
                  </div>
                  <h3 className="text-xl font-black leading-8 line-clamp-2">
                    {featuredTournament?.name || "تورنومنت‌های فعال Flexa"}
                  </h3>
                  <p className="text-xs text-gray-400 mt-3 leading-6">
                    {featuredTournament
                      ? `${gameLabel(featuredTournament.game)} • شروع: ${formatDate(featuredTournament.startDate)}`
                      : "روم‌های فعال را ببین و وارد رقابت شو."}
                  </p>
                  {featuredTournament && (
                    <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                      <span className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                        {(featuredTournament.registeredCount || 0).toLocaleString("fa-IR")}/
                        {(featuredTournament.maxPlayers || 0).toLocaleString("fa-IR")} نفر
                      </span>
                      <span className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                        {featuredTournament.entryFee || "رایگان"}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            </TiltCard>

            <TiltCard maxTilt={7} liftZ={12} className="rounded-[30px]">
              <Link
                href={featuredHonor ? `/honors/${featuredHonor.id}` : "/honors"}
                className="relative overflow-hidden rounded-[30px] border border-purple-300/15 bg-gradient-to-br from-purple-950/35 to-[#0d0b16] min-h-[205px] group active:scale-[.99] transition flex items-end"
              >
                {featuredHonor?.image && (
                  <AppImage
                    src={featuredHonor.image}
                    alt={featuredHonor.title}
                    fill
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    className="absolute inset-0 w-full h-full object-cover opacity-45 group-hover:scale-105 transition duration-700"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />
                <div className="relative p-5" style={{ transform: "translateZ(24px)" }}>
                  <div className="text-[10px] font-black tracking-[0.24em] text-purple-300 mb-3">
                    LATEST NEWS
                  </div>
                  <h3 className="text-lg sm:text-xl font-black leading-7 line-clamp-2">
                    {featuredHonor?.title || "آخرین اخبار گیمینگ"}
                  </h3>
                  <p className="text-xs text-gray-300 mt-3 line-clamp-2 leading-6">
                    {featuredHonor?.summary ||
                      featuredHonor?.description ||
                      "اخبار کالاف، کلش، فورتنایت و رویدادهای گیمینگ را دنبال کن."}
                  </p>
                </div>
              </Link>
            </TiltCard>
          </aside>
        </section>

        <section className="mb-10 sm:mb-14">
          <Reveal className="flex items-center justify-between mb-4 sm:mb-6">
            <div>
              <div className="text-[10px] font-black text-purple-300 tracking-[0.28em] mb-1">
                CHOOSE YOUR GAME
              </div>
              <h3 className="text-2xl sm:text-3xl font-black">بازی محبوبت را انتخاب کن</h3>
            </div>
            <Link href="/tournaments" className="text-xs font-black text-cyan-300">
              همه روم‌ها ←
            </Link>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            {GAMES.map((game, i) => {
              const gameImage =
                bySlug[game.bannerSlug] ||
                bySlug[`game-card-${game.id}`] ||
                byCategory[game.id];
              return (
                <Reveal key={game.id} delay={i * 0.08} from="up" distance={22}>
                  <TiltCard maxTilt={9} liftZ={16} className="rounded-[30px]">
                    <Link
                      href={`/tournaments?game=${game.id}`}
                      className="group block active:scale-[.985] transition-transform"
                    >
                      <article
                        className="relative overflow-hidden rounded-[30px] border border-white/10 min-h-[190px] p-5 flex flex-col justify-between"
                        style={{
                          background: game.bg,
                          boxShadow: `0 0 42px ${game.glow}`,
                        }}
                      >
                        {gameImage && (
                          <AppImage
                            src={assetUrl(gameImage.slug)}
                            alt={gameImage.altText || gameImage.title}
                            fill
                            sizes="(max-width: 768px) 100vw, 33vw"
                            className="absolute inset-0 w-full h-full object-cover opacity-55 saturate-125 brightness-110 group-hover:scale-110 group-hover:opacity-70 transition duration-700"
                          />
                        )}
                        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,.46),rgba(0,0,0,.10)_58%,rgba(0,0,0,.04)),linear-gradient(to_left,rgba(0,0,0,.34),transparent_55%)]" />
                        <div className="relative flex items-start justify-between gap-2" style={{ transform: "translateZ(30px)" }}>
                          <div
                            className={`w-16 h-16 rounded-3xl bg-gradient-to-br ${game.accent} p-0.5 shadow-2xl shrink-0`}
                          >
                            <div className="w-full h-full rounded-[22px] bg-black/25 backdrop-blur-sm flex items-center justify-center">
                              <AppImage
                                src={game.icon}
                                alt={game.faName}
                                width={44}
                                height={44}
                                className="w-11 h-11 object-contain"
                              />
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-white/45 tracking-[.25em]">
                            ROOMS
                          </span>
                        </div>
                        <div className="relative text-right mt-8" style={{ transform: "translateZ(20px)" }}>
                          <h4 className="text-3xl font-black en-font italic leading-none">
                            {game.name}
                          </h4>
                          <p className="text-xs text-gray-300 mt-3">
                            روم‌ها و تورنومنت‌های {game.faName}
                          </p>
                        </div>
                      </article>
                    </Link>
                  </TiltCard>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[.9fr_1.1fr] gap-5 mb-10 sm:mb-14">
          <Reveal from="right">
            <div className="rounded-[30px] border border-white/10 bg-white/[.04] p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-300/20 flex items-center justify-center text-2xl">
                  🤖
                </div>
                <div>
                  <h3 className="font-black">داوری و راهنمای هوشمند</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    ثبت نتیجه، اعتراض و تحلیل ریسک با زیرساخت AI
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-300 leading-8">
                Flexa برای مدیریت رقابت سالم ساخته شده؛ از ثبت‌نام تا اعلام نتیجه، همه مسیر شفاف و قابل پیگیری است.
              </p>
            </div>
          </Reveal>

          <Reveal from="left" delay={0.1}>
            <DailyQuests />
          </Reveal>
        </section>

        {/* Licence + payment gateway. Both existed already but were invisible:
            a small footer seal, and no mention of ZarinPal anywhere. */}
        <Reveal>
          <section className="mb-10 sm:mb-14">
            <TrustBadges />
          </section>
        </Reveal>
      </div>

      <BottomNav />
    </main>
  );
}
