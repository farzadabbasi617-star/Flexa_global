"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";

interface StoreItem {
  id: string;
  title: string;
  game: "cod_mobile" | "clash_royale" | "fortnite" | "pubg_mobile";
  category: "currency" | "pass" | "account";
  priceUSDT: number;
  amount: string;
  icon: string;
  badge?: string;
}

export default function GlobalStorePage() {
  const { lang, dir } = useLanguage();
  const [activeGame, setActiveMode] = useState<string>("all");

  const sampleItems: StoreItem[] = [
    {
      id: "cp-800",
      title: "COD Mobile — 800 CP",
      game: "cod_mobile",
      category: "currency",
      priceUSDT: 9.99,
      amount: "800 CP",
      icon: "🎯",
      badge: "Popular",
    },
    {
      id: "cp-2000",
      title: "COD Mobile — 2,000 CP",
      game: "cod_mobile",
      category: "currency",
      priceUSDT: 24.99,
      amount: "2,000 CP",
      icon: "🎯",
      badge: "Best Value",
    },
    {
      id: "pass-cod",
      title: "COD Mobile — Battle Pass Vault",
      game: "cod_mobile",
      category: "pass",
      priceUSDT: 6.99,
      amount: "Battle Pass",
      icon: "⚡",
    },
    {
      id: "gems-500",
      title: "Clash Royale — 500 Gems",
      game: "clash_royale",
      category: "currency",
      priceUSDT: 4.99,
      amount: "500 Gems",
      icon: "💎",
    },
    {
      id: "vbucks-1000",
      title: "Fortnite — 1,000 V-Bucks",
      game: "fortnite",
      category: "currency",
      priceUSDT: 8.99,
      amount: "1,000 V-Bucks",
      icon: "🏗️",
    },
  ];

  const filteredItems = sampleItems.filter((item) => {
    if (activeGame === "all") return true;
    return item.game === activeGame;
  });

  return (
    <div className="min-h-screen bg-[#050508] text-white selection:bg-purple-500/30" dir={dir}>
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Banner */}
        <div className="p-8 sm:p-12 rounded-[36px] bg-gradient-to-r from-purple-950/40 via-dark-900 to-cyan-950/40 border border-purple-500/20 mb-10 shadow-2xl">
          <div className="max-w-2xl">
            <div className="text-xs font-black tracking-widest text-cyan-400 uppercase mb-2">
              FLEXA DIGITAL STORE
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-white mb-4">
              {lang === "ar" ? "متجر العملات والاشتراكات" : "In-Game Currencies & Passes"}
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-7">
              {lang === "ar"
                ? "شحن سريع لـ CP، Gems و V-Bucks مع الدفع الفوري بالـ USDT و TON"
                : "Instant top-ups for CP, Gems, V-Bucks & Battle Passes with direct crypto payment."}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 border-b border-white/10">
          <button
            onClick={() => setActiveMode("all")}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
              activeGame === "all"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "bg-dark-900 text-gray-400 hover:text-white"
            }`}
          >
            🛒 {lang === "ar" ? "جميع المنتجات" : "All Products"}
          </button>
          <button
            onClick={() => setActiveMode("cod_mobile")}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
              activeGame === "cod_mobile"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "bg-dark-900 text-gray-400 hover:text-white"
            }`}
          >
            🎯 COD Mobile
          </button>
          <button
            onClick={() => setActiveMode("clash_royale")}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
              activeGame === "clash_royale"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "bg-dark-900 text-gray-400 hover:text-white"
            }`}
          >
            💎 Clash Royale
          </button>
          <button
            onClick={() => setActiveMode("fortnite")}
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
              activeGame === "fortnite"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "bg-dark-900 text-gray-400 hover:text-white"
            }`}
          >
            🏗️ Fortnite
          </button>
        </div>

        {/* Store Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="p-6 rounded-3xl bg-dark-900 border border-white/10 hover:border-purple-500/40 transition-all shadow-xl flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl">
                    {item.icon}
                  </div>
                  {item.badge && (
                    <span className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-black uppercase">
                      {item.badge}
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-black text-white mb-1">{item.title}</h3>
                <div className="text-xs text-gray-400 font-bold mb-4">{item.amount} • Instant Delivery</div>
              </div>

              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold">{lang === "ar" ? "السعر" : "Price"}</div>
                  <div className="text-lg font-black text-emerald-400">${item.priceUSDT} USDT</div>
                </div>

                <Link
                  href="/wallet"
                  className="px-5 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-xs font-black text-white transition-all shadow-lg shadow-purple-600/30"
                >
                  {lang === "ar" ? "شراء الآن" : "Buy Now 💳"}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
