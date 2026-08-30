import Link from "next/link";
import AppImage from "@/components/AppImage";
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
    tagline: "Battle Royale & Multiplayer Arenas",
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
    tagline: "Building & Zero Build Duos",
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
    tagline: "1v1 Duels & Golden Ladder",
    icon: "/icons/icon-clash_royale.png",
    href: "/games/clash-royale",
    accent: "from-cyan-400 to-blue-600",
    glow: "rgba(34,211,238,.24)",
    bg: "radial-gradient(circle at 74% 32%, rgba(0,210,255,.34), transparent 20%), radial-gradient(circle at 24% 68%, rgba(255,230,0,.12), transparent 22%), linear-gradient(135deg, #080a12 0%, #101827 52%, #09283a 100%)",
  },
];

export const dynamic = "force-dynamic";

function gameLabel(game?: string | null) {
  if (game === "cod_mobile") return "Call of Duty: Mobile";
  if (game === "fortnite") return "Fortnite";
  if (game === "clash_royale") return "Clash Royale";
  return "Esports";
}

function formatDate(value?: string | null) {
  if (!value) return "Upcoming";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Upcoming";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function assetUrl(slug: string) {
  return `/api/public/images/asset?slug=${encodeURIComponent(slug)}`;
}

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
    >
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_75%_0%,rgba(168,85,247,.28),transparent_34%),radial-gradient(circle_at_15%_18%,rgba(34,211,238,.14),transparent_32%),linear-gradient(140deg,#050508,#0b0b12_46%,#080411)]" />
      <div className="fixed inset-0 pointer-events-none opacity-[.08] bg-[linear-gradient(115deg,transparent_0_18%,rgba(255,255,255,.4)_18%_19%,transparent_19%_42%,rgba(255,255,255,.25)_42%_43%,transparent_43%)]" />

      <div
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8"
        style={{ paddingBottom: "var(--bottom-nav-space)" }}
      >
        <header className="flex items-center justify-between gap-4 mb-7 sm:mb-10">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border border-neon-purple/40 bg-dark-900 shadow-[0_0_20px_rgba(188,0,255,.3)] flex items-center justify-center text-2xl font-black text-neon-purple shrink-0">
              ⚡
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-xs font-black text-cyan-300 tracking-[0.24em] mb-0.5">
                FLEXA ARENA GLOBAL
              </div>
              <h1 className="text-xl sm:text-3xl font-black leading-tight truncate">Flexa Global</h1>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/honors"
              className="hidden sm:inline-flex px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-black hover:border-purple-300/40"
            >
              News & Updates
            </Link>
            <Link
              href="/wallet"
              className="grid place-items-center px-4 py-2.5 rounded-2xl bg-purple-500/15 border border-purple-300/30 text-xs font-bold active:scale-95 text-cyan-300 hover:bg-purple-500/25 transition"
            >
              💳 Crypto Wallet
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
                GLOBAL SEASON LIVE • INSTANT CRYPTO PAYOUTS
              </div>
              <h2 className="text-4xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight max-w-3xl animate-slide-up [animation-delay:80ms] [animation-fill-mode:backwards]">
                COMPETE & WIN<br />GLOBAL ESPORTS
              </h2>
              <p className="text-sm sm:text-base text-gray-300 leading-7 mt-5 max-w-2xl animate-slide-up [animation-delay:160ms] [animation-fill-mode:backwards]">
                Instant registration, secure USDT & TON wallets, private lobbies, automated AI match verification, and global leaderboards.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mt-7 animate-slide-up [animation-delay:240ms] [animation-fill-mode:backwards]">
                <MagneticButton>
                  <Link href="/tournaments" className="gaming-btn text-sm sm:text-base px-6 py-4">
                    Explore Tournaments 🏆
                  </Link>
                </MagneticButton>
                <MagneticButton>
                  <Link
                    href="/register"
                    className="block px-6 py-4 rounded-2xl bg-white/7 border border-white/10 text-sm sm:text-base font-black text-center hover:border-cyan-300/40 active:scale-95 transition"
                  >
                    Create Free Account ⚡
                  </Link>
                </MagneticButton>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-8 max-w-xl">
                {[
                  ["USDT / TON", "Instant Crypto Payouts"],
                  ["AI Engine", "Smart Match Verification"],
                  ["24/7", "Global Support"],
                ].map(([value, label], i) => (
                  <div
                    key={label}
                    className="rounded-2xl bg-white/[.06] border border-white/10 p-3 text-center backdrop-blur-md animate-slide-up [animation-fill-mode:backwards]"
                    style={{ animationDelay: `${320 + i * 90}ms` }}
                  >
                    <div className="text-base sm:text-xl font-black text-purple-200">{value}</div>
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
                <div className="text-xs font-bold text-cyan-300 tracking-wider uppercase mb-1">
                  FEATURED EVENT
                </div>
                <h3 className="text-xl font-black text-white mb-2">
                  {featuredTournament?.name || "Global Championship 2026"}
                </h3>
                <p className="text-xs text-gray-400 mb-4">
                  {gameLabel(featuredTournament?.game)} • Prize Pool: {featuredTournament?.prizePool || "$1,000 USDT"}
                </p>
                <span className="inline-flex items-center gap-2 text-xs font-bold text-cyan-400 group-hover:translate-x-1 transition-transform">
                  Join Tournament →
                </span>
              </Link>
            </TiltCard>

            <TiltCard maxTilt={7} liftZ={12} className="rounded-[30px]">
              <Link
                href="/cod-arena"
                className="relative block overflow-hidden rounded-[30px] border border-orange-500/20 bg-gradient-to-br from-orange-950/30 to-[#0d0b16] p-5 min-h-[205px] group active:scale-[.99] transition"
              >
                <div className="text-xs font-bold text-orange-400 tracking-wider uppercase mb-1">
                  COD ARENA
                </div>
                <h3 className="text-xl font-black text-white mb-2">
                  1v1 Duels & Kill Race Lobbies
                </h3>
                <p className="text-xs text-gray-400 mb-4">
                  Automated lobbies, Instant UID verification, and instant match rewards in USDT/TON.
                </p>
                <span className="inline-flex items-center gap-2 text-xs font-bold text-orange-400 group-hover:translate-x-1 transition-transform">
                  Enter COD Arena →
                </span>
              </Link>
            </TiltCard>
          </aside>
        </section>

        {/* Featured Games Grid */}
        <section className="mb-12">
          <Reveal>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-white">Supported Games</h2>
                <p className="text-xs sm:text-sm text-gray-400 mt-1">Select a game to view tournaments and active lobbies</p>
              </div>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {GAMES.map((game) => (
              <TiltCard key={game.id} maxTilt={8} liftZ={14} className="rounded-3xl">
                <Link
                  href={game.href}
                  className="relative block p-6 rounded-3xl border border-white/10 overflow-hidden group hover:border-purple-500/40 transition-all duration-300"
                  style={{ background: game.bg }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-black/40 p-2 border border-white/10 group-hover:scale-110 transition-transform">
                      <AppImage
                        src={game.icon}
                        alt={game.name}
                        width={40}
                        height={40}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white">{game.name}</h3>
                      <p className="text-xs text-gray-400">{game.tagline}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10 text-xs font-bold text-cyan-300">
                    <span>View Events</span>
                    <span>→</span>
                  </div>
                </Link>
              </TiltCard>
            ))}
          </div>
        </section>

        <TrustBadges />
      </div>
    </main>
  );
}
