"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";

interface PlayerRank {
  rank: number;
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  rating: number;
  wins: number;
  losses: number;
  totalEarningsUSDT: number;
  tier: "Legend" | "Diamond" | "Platinum" | "Gold";
  game: string;
}

export default function GlobalLeaderboardPage() {
  const { lang, dir } = useLanguage();
  const [activeBoard, setActiveBoard] = useState<"rating" | "earnings" | "wins">("rating");
  const [searchQuery, setSearchQuery] = useState("");

  const sampleLeaderboard: PlayerRank[] = [
    {
      rank: 1,
      id: "p-1",
      username: "ShadowStrike",
      displayName: "ShadowStrike 👑",
      rating: 2450,
      wins: 142,
      losses: 18,
      totalEarningsUSDT: 3450,
      tier: "Legend",
      game: "COD Mobile",
    },
    {
      rank: 2,
      id: "p-2",
      username: "ApexHunter",
      displayName: "ApexHunter",
      rating: 2310,
      wins: 118,
      losses: 22,
      totalEarningsUSDT: 2800,
      tier: "Legend",
      game: "Clash Royale",
    },
    {
      rank: 3,
      id: "p-3",
      username: "FortniteGod",
      displayName: "FortniteGod",
      rating: 2180,
      wins: 95,
      losses: 20,
      totalEarningsUSDT: 1950,
      tier: "Diamond",
      game: "Fortnite",
    },
    {
      rank: 4,
      id: "p-4",
      username: "RoyaleSniper",
      displayName: "RoyaleSniper",
      rating: 2050,
      wins: 82,
      losses: 25,
      totalEarningsUSDT: 1400,
      tier: "Diamond",
      game: "Clash Royale",
    },
    {
      rank: 5,
      id: "p-5",
      username: "CyberGamer",
      displayName: "CyberGamer",
      rating: 1920,
      wins: 70,
      losses: 30,
      totalEarningsUSDT: 950,
      tier: "Platinum",
      game: "COD Mobile",
    },
  ];

  const filteredPlayers = sampleLeaderboard.filter((p) => {
    if (!searchQuery) return true;
    return p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || p.username.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-[#050508] text-white selection:bg-purple-500/30" dir={dir}>
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="text-xs font-black tracking-widest text-cyan-400 uppercase mb-1">
            FLEXA ARENA GLOBAL
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">
            🏆 {lang === "ar" ? "قائمة المتصدرين العالمية" : "Global Leaderboard & Rankings"}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {lang === "ar"
              ? "تصنيف أفضل اللاعبين في العالم حس التصنيف (ELO) وإجمالي الأرباح بالكريبتو"
              : "Top ranked esports players worldwide based on ELO ratings & total USDT earnings."}
          </p>
        </div>

        {/* Top 3 Podium Showcase */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {sampleLeaderboard.slice(0, 3).map((p, idx) => {
            const podiumStyles = [
              "border-yellow-500/40 bg-gradient-to-b from-yellow-950/30 to-dark-900 shadow-yellow-500/10",
              "border-slate-400/40 bg-gradient-to-b from-slate-900/30 to-dark-900 shadow-slate-400/10",
              "border-amber-600/40 bg-gradient-to-b from-amber-950/30 to-dark-900 shadow-amber-600/10",
            ];
            const podiumCrowns = ["🥇 1st Place", "🥈 2nd Place", "🥉 3rd Place"];

            return (
              <div
                key={p.id}
                className={`p-6 rounded-3xl border shadow-2xl text-center space-y-3 ${podiumStyles[idx]}`}
              >
                <div className="text-xs font-black uppercase text-yellow-400 tracking-wider">
                  {podiumCrowns[idx]}
                </div>
                <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 mx-auto flex items-center justify-center text-2xl font-black text-white">
                  {p.displayName.charAt(0)}
                </div>
                <h3 className="text-lg font-black text-white truncate">{p.displayName}</h3>
                <div className="text-xs text-gray-400 font-bold">{p.game}</div>

                <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase">Rating</div>
                    <div className="font-black text-cyan-300">{p.rating} ELO</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase">Earnings</div>
                    <div className="font-black text-emerald-400">${p.totalEarningsUSDT} USDT</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filter Controls */}
        <div className="p-4 rounded-3xl bg-dark-900 border border-white/10 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveBoard("rating")}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                activeBoard === "rating"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "bg-dark-800 text-gray-400 hover:text-white"
              }`}
            >
              ⭐ {lang === "ar" ? "التصنيف (ELO)" : "ELO Rating"}
            </button>
            <button
              onClick={() => setActiveBoard("earnings")}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                activeBoard === "earnings"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "bg-dark-800 text-gray-400 hover:text-white"
              }`}
            >
              💰 {lang === "ar" ? "الأرباح" : "USDT Earnings"}
            </button>
          </div>

          <input
            type="text"
            placeholder={lang === "ar" ? "بحث عن لاعب..." : "Search player name..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 bg-dark-950 border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Leaderboard Table */}
        <div className="rounded-3xl bg-dark-900 border border-white/10 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs sm:text-sm">
              <thead className="bg-dark-950 border-b border-white/10 text-gray-400 uppercase font-mono text-[10px] tracking-wider">
                <tr>
                  <th className="px-6 py-4 text-start">Rank</th>
                  <th className="px-6 py-4 text-start">Player</th>
                  <th className="px-6 py-4 text-start">Main Game</th>
                  <th className="px-6 py-4 text-center">W / L</th>
                  <th className="px-6 py-4 text-center">ELO Rating</th>
                  <th className="px-6 py-4 text-end">Earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium">
                {filteredPlayers.map((p) => (
                  <tr key={p.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-black text-cyan-300">#{p.rank}</td>
                    <td className="px-6 py-4 font-bold text-white flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center font-black text-purple-300">
                        {p.displayName.charAt(0)}
                      </div>
                      <span>{p.displayName}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-400">{p.game}</td>
                    <td className="px-6 py-4 text-center font-mono text-gray-300">
                      {p.wins}W / {p.losses}L
                    </td>
                    <td className="px-6 py-4 text-center font-black text-purple-300">
                      {p.rating} ELO
                    </td>
                    <td className="px-6 py-4 text-end font-black text-emerald-400">
                      ${p.totalEarningsUSDT} USDT
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
