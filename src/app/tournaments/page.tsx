"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import TournamentCardLuxury from "@/components/TournamentCardLuxury";
import Reveal from "@/components/fx/Reveal";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface Tournament {
  id: string;
  name: string;
  game: string;
  gameMode: string | null;
  maxPlayers: number;
  registeredCount: number;
  prizePool: string | null;
  winnersCount?: number;
  entryFee: string | null;
  startDate: string | null;
  bannerUrl?: string | null;
}

const GAME_META: Record<string, { fa: string; en: string; icon: string; accent: string }> = {
  clash_royale: { fa: "کلش رویال", en: "Clash Royale", icon: "/icons/icon-clash_royale.png", accent: "from-cyan-500 to-blue-700" },
  cod_mobile: { fa: "کالاف موبایل", en: "COD Mobile", icon: "/icons/icon-cod_mobile.png", accent: "from-orange-500 to-red-700" },
  fortnite: { fa: "فورتنایت", en: "Fortnite", icon: "/icons/icon-fortnite.png", accent: "from-purple-500 to-pink-700" },
};

const DEFAULT_MODE_LABEL: Record<string, string> = {
  clash_royale: "دوئل / لیگ کلش",
  cod_mobile: "روم‌های کالاف",
  fortnite: "بتل رویال / کریتیو",
};

function normalizeMode(tournament: Tournament) {
  const value = tournament.gameMode?.trim();
  return value || DEFAULT_MODE_LABEL[tournament.game] || "سایر مودها";
}

function TournamentsContent({ canCreate, walletBalanceToman, isLoggedIn }: { canCreate: boolean; walletBalanceToman: number | null; isLoggedIn: boolean }) {
  const { lang } = useLanguage();
  const searchParams = useSearchParams();
  const gameFilter = searchParams.get("game");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(gameFilter || "all");

  const L = (fa: string, en: string) => (lang === "fa" ? fa : en);

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (activeFilter !== "all") params.set("game", activeFilter);
      const res = await fetch(`/api/tournaments?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setTournaments(Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : []);
    } catch {
      setTournaments([]);
    }
    setLoading(false);
  }, [activeFilter]);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  const games = [
    { id: "all", name: L("همه", "All"), icon: "/icons/flexa-icon-192.png" },
    ...Object.entries(GAME_META).map(([id, meta]) => ({ id, name: L(meta.fa, meta.en), icon: meta.icon })),
  ];

  const grouped = useMemo(() => {
    const result = new Map<string, Map<string, Tournament[]>>();

    for (const tournament of tournaments) {
      if (!result.has(tournament.game)) result.set(tournament.game, new Map());
      const mode = normalizeMode(tournament);
      const gameModes = result.get(tournament.game)!;
      if (!gameModes.has(mode)) gameModes.set(mode, []);
      gameModes.get(mode)!.push(tournament);
    }

    // Stable ordering: known games first, then custom/unknown.
    return Array.from(result.entries()).sort(([a], [b]) => {
      const order = ["cod_mobile", "fortnite", "clash_royale"];
      return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b));
    });
  }, [tournaments]);

  return (
    <>
      {/* Game Selection Pills */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-3 snap-x scrollbar-hide" dir="rtl">
        {games.map((g) => (
          <button
            key={g.id}
            onClick={() => setActiveFilter(g.id)}
            className={`snap-start whitespace-nowrap px-4 py-2.5 rounded-2xl text-xs font-black border transition-all active:scale-[0.985] flex items-center gap-2 shrink-0 ${
              activeFilter === g.id
                ? "bg-purple-600 text-white border-purple-500 shadow-[0_0_15px_rgba(168,85,247,.35)]"
                : "bg-[#111114] text-gray-400 border-white/5 hover:border-white/10 active:bg-[#18181c]"
            }`}
          >
            <img src={g.icon} alt={g.name} className="w-4 h-4 object-contain shrink-0" loading="lazy" decoding="async" />
            <span>{g.name}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-4xl animate-neon-pulse">🎮</div>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🏟️</div>
          <h3 className="text-xl font-bold mb-2">{L("هنوز تورنومنتی نیست", "No Tournaments Yet")}</h3>
          <p className="text-gray-400 mb-6">
            {canCreate
              ? L("اولین تورنومنت رو بساز!", "Create the first tournament!")
              : L("به‌زودی تورنومنت‌های جدید توسط مدیرها ساخته می‌شود.", "Admins will create tournaments soon.")}
          </p>
          {canCreate && (
            <Link href="/tournaments/create" className="gaming-btn">
              {L("ساخت تورنومنت", "Create Tournament")}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-12">
          {grouped.map(([gameId, modeMap]) => {
            const meta = GAME_META[gameId] || { fa: gameId, en: gameId, icon: "🎮", accent: "from-purple-500 to-blue-700" };
            const modes = Array.from(modeMap.entries()).sort(([a], [b]) => a.localeCompare(b, "fa"));

            return (
              <Reveal as="section" key={gameId} className="relative" distance={22}>
                <div className="flex items-center justify-between gap-4 mb-5" dir="rtl">
                  <div className="flex items-center gap-3">
                    {/* Uniform Square Game Logo inside glowing container */}
                    <div className="w-12 h-12 rounded-2xl bg-[#111114] border border-white/10 flex items-center justify-center p-2 sm:p-2.5 shadow-[0_0_20px_rgba(168,85,247,0.12)] shrink-0">
                      <img src={meta.icon} alt={L(meta.fa, meta.en)} className="w-full h-full object-contain" loading="lazy" decoding="async" />
                    </div>
                    <div className="text-right">
                      <h2 className="text-xl sm:text-2xl font-black text-white">{L(meta.fa, meta.en)}</h2>
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-1">اسکرول افقی تورنومنت‌ها بر اساس مود بازی</p>
                    </div>
                  </div>
                  <Link href={`/tournaments?game=${gameId}`} className="text-xs font-black text-purple-300 whitespace-nowrap">
                    همه {L(meta.fa, meta.en)} ←
                  </Link>
                </div>

                <div className="space-y-8">
                  {modes.map(([mode, list]) => (
                    <div key={`${gameId}-${mode}`} className="glass-panel p-5 rounded-3xl border border-white/5" dir="rtl">
                      <div className="flex items-center justify-between gap-3 mb-5">
                        <div className="text-right">
                          <h3 className="font-black text-base sm:text-lg text-white">{mode}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">{list.length.toLocaleString("fa-IR")} روم فعال</p>
                        </div>
                        <span className="text-[9px] px-2.5 py-1 rounded-full bg-white/5 text-gray-400 border border-white/5 font-semibold">
                          اسکرول افقی
                        </span>
                      </div>

                      <div className="flex gap-4 overflow-x-auto snap-x pb-2 -mx-1 px-1 scrollbar-hide">
                        {list.map((tournament) => (
                          <div key={tournament.id} className="snap-start shrink-0 w-[min(295px,calc(100vw-48px))]">
                            <TournamentCardLuxury t={tournament} walletBalanceToman={walletBalanceToman} isLoggedIn={isLoggedIn} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Reveal>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function TournamentsPage() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const [walletBalanceToman, setWalletBalanceToman] = useState<number | null>(null);
  const L = (fa: string, en: string) => (lang === "fa" ? fa : en);
  const canCreate = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    if (!user) {
      setWalletBalanceToman(null);
      return;
    }
    fetch("/api/wallet/balance", { cache: "no-store", credentials: "include" })
      .then((res) => res.json())
      .then((data) => setWalletBalanceToman(Number(data.balanceToman || 0)))
      .catch(() => setWalletBalanceToman(null));
  }, [user]);

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "var(--bottom-nav-space)" }}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6" dir="rtl">
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5 justify-start">
              <img src="/icons/honors_icon.webp" alt="Tournaments" className="w-8 h-8 object-contain drop-shadow-[0_0_8px_#bc00ff] shrink-0" loading="lazy" decoding="async" />
              <span className="bg-gradient-to-l from-purple-400 to-cyan-300 bg-clip-text text-transparent">{L("تورنومنت‌ها", "Tournaments")}</span>
            </h1>
            <p className="text-gray-400 mt-1.5 text-xs">
              {L("هر بازی در مودهای خودش، با اسکرول افقی تورنومنت‌ها", "Browse tournaments by game and mode")}
            </p>
          </div>
          {canCreate && (
            <Link href="/tournaments/create" className="gaming-btn text-sm">
              + {L("تورنومنت جدید", "New Tournament")}
            </Link>
          )}
        </div>
        {user && walletBalanceToman !== null && (
          <div className="gaming-card p-4 mb-6 flex items-center justify-between gap-3 border-neon-blue/20" dir="rtl">
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">موجودی کیف پول</div>
              <div className="font-black text-neon-blue num-en">{walletBalanceToman.toLocaleString("en-US")} USDT</div>
            </div>
            <Link href="/wallet" className="gaming-btn text-xs">شارژ / تراکنش‌ها</Link>
          </div>
        )}
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="text-4xl animate-neon-pulse">🎮</div></div>}>
          <TournamentsContent canCreate={Boolean(canCreate)} walletBalanceToman={walletBalanceToman} isLoggedIn={Boolean(user)} />
        </Suspense>
      </div>
      <BottomNav />
    </div>
  );
}
