"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface CodRoom {
  id: string;
  title: string;
  mode: "1v1_duel" | "kill_race" | "battle_royale";
  map: string;
  teamMode: "solo" | "duo" | "squad";
  capacity: number;
  registeredCount: number;
  entryFeeUSDT: number;
  perKillRewardUSDT: number;
  prizePoolUSDT: number;
  status: "registration" | "lobby_open" | "in_progress" | "completed";
  startsAt: string;
}

export default function CodArenaPage() {
  const { lang, dir } = useLanguage();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"lobbies" | "leaderboard">("lobbies");
  const [activeMode, setActiveMode] = useState<string>("all");

  const sampleRooms: CodRoom[] = [
    {
      id: "room-101",
      title: "1v1 Sniper Duel — Shipment Arena",
      mode: "1v1_duel",
      map: "Shipment 1944",
      teamMode: "solo",
      capacity: 2,
      registeredCount: 1,
      entryFeeUSDT: 5,
      perKillRewardUSDT: 0,
      prizePoolUSDT: 10,
      status: "registration",
      startsAt: "In 15 Minutes",
    },
    {
      id: "room-102",
      title: "Alcatraz Rebirth Kill Race #42",
      mode: "kill_race",
      map: "Alcatraz",
      teamMode: "duo",
      capacity: 40,
      registeredCount: 28,
      entryFeeUSDT: 2,
      perKillRewardUSDT: 0.5,
      prizePoolUSDT: 80,
      status: "registration",
      startsAt: "Today, 20:00 UTC",
    },
    {
      id: "room-103",
      title: "BR Isolated Solos High Stakes",
      mode: "battle_royale",
      map: "Isolated",
      teamMode: "solo",
      capacity: 100,
      registeredCount: 84,
      entryFeeUSDT: 10,
      perKillRewardUSDT: 1.5,
      prizePoolUSDT: 1000,
      status: "lobby_open",
      startsAt: "Live Now 🔴",
    },
  ];

  const filteredRooms = sampleRooms.filter((r) => {
    if (activeMode === "all") return true;
    return r.mode === activeMode;
  });

  return (
    <div className="min-h-screen bg-[#050508] text-white selection:bg-purple-500/30" dir={dir}>
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Banner */}
        <div className="relative rounded-[36px] overflow-hidden border border-orange-500/20 bg-gradient-to-r from-orange-950/40 via-dark-900 to-[#0d0b16] p-8 sm:p-12 mb-10 shadow-2xl">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 text-xs font-black uppercase tracking-wider mb-4">
              🎯 CALL OF DUTY: MOBILE ARENA
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight mb-4">
              {lang === "ar" ? "ساحة قتال كالاف دیوتي موبایل" : "COD Mobile Lobbies & 1v1 Duels"}
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-7 mb-6">
              {lang === "ar"
                ? "لابيات خاصة، مبارزات ۱ ضد ۱، مكافآت لكل قتل (Per Kill Rewards) وتسوية جوائز فورية بـ USDT."
                : "Automated custom lobbies, 1v1 Sniper Duels, Alcatraz Kill Races, and instant USDT per-kill payouts."}
            </p>

            <div className="flex items-center gap-3">
              <span className="px-3.5 py-1.5 rounded-xl bg-white/10 text-xs font-bold text-gray-300 border border-white/10">
                {user?.codMobileId ? `UID: ${user.codMobileId} ✅` : (lang === "ar" ? "لم يتم ربط المعرف" : "UID Not Linked")}
              </span>
              <Link
                href="/profile/edit"
                className="text-xs font-bold text-orange-400 hover:underline"
              >
                {lang === "ar" ? "تعديل المعرف ←" : "Link CODM UID →"}
              </Link>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
            <button
              onClick={() => setActiveMode("all")}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                activeMode === "all"
                  ? "bg-orange-600 text-white shadow-lg shadow-orange-600/30"
                  : "bg-dark-900 text-gray-400 hover:text-white"
              }`}
            >
              🎯 {lang === "ar" ? "جميع اللابيات" : "All Lobbies"}
            </button>
            <button
              onClick={() => setActiveMode("1v1_duel")}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                activeMode === "1v1_duel"
                  ? "bg-orange-600 text-white shadow-lg shadow-orange-600/30"
                  : "bg-dark-900 text-gray-400 hover:text-white"
              }`}
            >
              ⚔️ {lang === "ar" ? "مبارزات 1v1" : "1v1 Duels"}
            </button>
            <button
              onClick={() => setActiveMode("kill_race")}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                activeMode === "kill_race"
                  ? "bg-orange-600 text-white shadow-lg shadow-orange-600/30"
                  : "bg-dark-900 text-gray-400 hover:text-white"
              }`}
            >
              🔥 {lang === "ar" ? "سباق القتل (Kill Race)" : "Kill Race"}
            </button>
            <button
              onClick={() => setActiveMode("battle_royale")}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                activeMode === "battle_royale"
                  ? "bg-orange-600 text-white shadow-lg shadow-orange-600/30"
                  : "bg-dark-900 text-gray-400 hover:text-white"
              }`}
            >
              🏆 {lang === "ar" ? "باتل رويال" : "Battle Royale"}
            </button>
          </div>
        </div>

        {/* Lobbies Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRooms.map((r) => (
            <div
              key={r.id}
              className="p-6 rounded-3xl bg-dark-900 border border-white/10 hover:border-orange-500/40 transition-all shadow-xl space-y-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="px-2.5 py-1 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-black uppercase">
                    {r.map} • {r.teamMode}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-xl text-[10px] font-black ${
                      r.status === "lobby_open"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse"
                        : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    }`}
                  >
                    {r.status === "lobby_open" ? (lang === "ar" ? "اللوبي مفتوح الآن" : "Lobby Open 🔴") : r.startsAt}
                  </span>
                </div>

                <h3 className="text-lg font-black text-white leading-snug mb-2">{r.title}</h3>

                <div className="grid grid-cols-2 gap-2 my-4 text-xs font-bold">
                  <div className="p-3 rounded-2xl bg-dark-950 border border-white/5">
                    <div className="text-[10px] text-gray-400">{lang === "ar" ? "جائزة القتل" : "Per Kill Payout"}</div>
                    <div className="text-emerald-400 mt-0.5">
                      {r.perKillRewardUSDT > 0 ? `$${r.perKillRewardUSDT} USDT` : "N/A"}
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-dark-950 border border-white/5">
                    <div className="text-[10px] text-gray-400">{lang === "ar" ? "مجموع الجوائز" : "Prize Pool"}</div>
                    <div className="text-yellow-400 mt-0.5">${r.prizePoolUSDT} USDT</div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-gray-400">{lang === "ar" ? "رسوم الدخول" : "Entry Fee"}</div>
                  <div className="text-sm font-black text-cyan-300">
                    {r.entryFeeUSDT === 0 ? "FREE" : `$${r.entryFeeUSDT} USDT`}
                  </div>
                </div>

                <button className="px-5 py-2.5 rounded-2xl bg-orange-600 hover:bg-orange-500 text-xs font-black text-white transition-all shadow-lg shadow-orange-600/30 active:scale-95">
                  {lang === "ar" ? "دخول اللوبي" : "Join Lobby →"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
