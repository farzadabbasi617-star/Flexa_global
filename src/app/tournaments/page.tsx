"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
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

const GAME_META: Record<string, { name: string; icon: string }> = {
  cod_mobile: { name: "Call of Duty: Mobile", icon: "/icons/icon-cod_mobile.png" },
  clash_royale: { name: "Clash Royale", icon: "/icons/icon-clash_royale.png" },
  fortnite: { name: "Fortnite", icon: "/icons/icon-fortnite.png" },
};

function TournamentsContent() {
  const { lang, dir } = useLanguage();
  const searchParams = useSearchParams();
  const gameFilter = searchParams.get("game");
  const { user } = useAuth();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(gameFilter || "all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (activeFilter !== "all") params.set("game", activeFilter);
      const res = await fetch(`/api/tournaments?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) {
        setTournaments(data);
      } else {
        setTournaments([]);
      }
    } catch {
      setTournaments([]);
    }
    setLoading(false);
  }, [activeFilter]);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  const filteredTournaments = tournaments.filter((t) => {
    if (!searchQuery) return true;
    return t.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-[#050508] text-white selection:bg-purple-500/30" dir={dir}>
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <Reveal>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <div className="text-xs font-black tracking-widest text-cyan-400 uppercase mb-1">
                FLEXA ARENA GLOBAL
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white">
                {lang === "ar" ? "البطولات والمواجهات المباشرة" : "Global Tournaments & Arenas"}
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                {lang === "ar"
                  ? "تصفح البطولات المفتوحة، انضم للوبي، واربح جوائز USDT و TON"
                  : "Compete in skill-based tournaments with guaranteed USDT & TON prize pools."}
              </p>
            </div>

            {user?.role === "admin" && (
              <Link
                href="/tournaments/create"
                className="px-6 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-xs font-black transition-all shadow-lg shadow-purple-600/30"
              >
                + {lang === "ar" ? "إنشاء بطولة" : "Create Tournament"}
              </Link>
            )}
          </div>
        </Reveal>

        {/* Search & Filter Bar */}
        <div className="p-4 rounded-3xl bg-dark-900 border border-white/10 mb-8 space-y-4">
          <div className="flex flex-col md:flex-row items-center gap-4">
            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <input
                type="text"
                placeholder={lang === "ar" ? "بحث عن بطولة..." : "Search tournaments..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-dark-950 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
              />
              <span className="absolute end-3 top-3 text-gray-500 text-sm">🔍</span>
            </div>

            {/* Game Filters */}
            <div className="flex items-center gap-2 overflow-x-auto w-full pb-1 sm:pb-0">
              <button
                onClick={() => setActiveFilter("all")}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                  activeFilter === "all"
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                    : "bg-dark-800 text-gray-400 hover:text-white"
                }`}
              >
                🎮 {lang === "ar" ? "جميع الألعاب" : "All Games"}
              </button>

              {Object.entries(GAME_META).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setActiveFilter(key)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                    activeFilter === key
                      ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                      : "bg-dark-800 text-gray-400 hover:text-white"
                  }`}
                >
                  <span>{meta.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tournaments Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-12">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-96 rounded-[32px] bg-dark-900 border border-white/5 animate-pulse" />
            ))}
          </div>
        ) : filteredTournaments.length === 0 ? (
          <div className="text-center py-20 bg-dark-900/50 rounded-3xl border border-white/10">
            <div className="text-5xl mb-4">🏆</div>
            <h3 className="text-xl font-black text-white mb-2">
              {lang === "ar" ? "لا توجد بطولات حالياً" : "No Active Tournaments Found"}
            </h3>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              {lang === "ar"
                ? "عد لاحقاً لمتابعة البطولات القادمة أو استخدم فلتر البحث."
                : "Check back soon for upcoming championships or select a different game filter."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTournaments.map((t) => (
              <TournamentCardLuxury key={t.id} t={t} isLoggedIn={!!user} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function TournamentsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050508] flex items-center justify-center text-3xl animate-pulse">
          ⚡
        </div>
      }
    >
      <TournamentsContent />
    </Suspense>
  );
}
