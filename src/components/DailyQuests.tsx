"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardData {
  stats: { myTournaments: number };
}

interface TelegramLinkAccount {
  telegramId: string;
}

export default function DailyQuests() {
  const { user, refreshUser } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [telegramAccount, setTelegramAccount] = useState<TelegramLinkAccount | null>(null);
  const [claimedQuests, setClaimedQuests] = useState<string[]>([]);
  const [claimLoading, setClaimLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const metadata = (user?.metadata as { claimedQuests?: string[] } | undefined) || {};
    setClaimedQuests(metadata.claimedQuests || []);
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [dashboardRes, telegramRes] = await Promise.all([
        fetch("/api/dashboard", { cache: "no-store", credentials: "include" }),
        fetch("/api/telegram/link", { cache: "no-store", credentials: "include" }),
      ]);
      if (dashboardRes.ok) setDashboard(await dashboardRes.json());
      if (telegramRes.ok) {
        const json = await telegramRes.json();
        setTelegramAccount(json.account || null);
      }
    } catch {
      // Silent: quests are optional on the arena page.
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const hasGameIds = Boolean(user?.clashRoyaleId || user?.codMobileId || user?.fortniteId);

  const quests = useMemo(() => {
    if (!user) return [];
    return [
      {
        id: "game_ids",
        title: "ثبت شناسه‌های بازی",
        desc: "ثبت حداقل یک آیدی بازی (کالاف، کلش یا فورتنایت)",
        xp: 50,
        completed: hasGameIds,
        icon: "🎮",
        href: "/profile/user",
      },
      {
        id: "telegram_link",
        title: "اتصال به ربات تلگرام",
        desc: "لینک کردن موفق حساب تلگرام به Flexa",
        xp: 50,
        completed: Boolean(telegramAccount),
        icon: "🔗",
        href: "/profile/user#telegram",
      },
      {
        id: "join_tournament",
        title: "اولین رقابت",
        desc: "ثبت‌نام در حداقل یک تورنومنت Flexa",
        xp: 100,
        completed: Boolean((dashboard?.stats.myTournaments || 0) > 0),
        icon: "⚔️",
        href: "/tournaments",
      },
      {
        id: "level_5",
        title: "کهنه‌کار نوپا",
        desc: "رسیدن به سطح کاربری ۵ در پلتفرم",
        xp: 150,
        completed: Boolean((user.level || 1) >= 5),
        icon: "⚡",
        href: "/profile",
      },
    ];
  }, [dashboard, hasGameIds, telegramAccount, user]);

  async function handleClaimQuest(questId: string) {
    setClaimLoading(questId);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/quests/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ questId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "خطا در ثبت مأموریت");
      setMessage(json.message || "جایزه مأموریت دریافت شد.");
      setClaimedQuests(json.claimedQuests || []);
      await refreshUser();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت مأموریت انجام نشد.");
    } finally {
      setClaimLoading(null);
    }
  }

  if (!user) return null;

  return (
    <section className="mb-24 sm:mb-28" dir="rtl">
      <div className="glass-panel rounded-3xl sm:rounded-[36px] border border-white/10 p-5 sm:p-6">
        <div className="text-right mb-4">
          <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
            <span>🎯</span>
            <span>دیلی کوئست‌ها و مأموریت‌های Flexa</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">ماموریت‌ها را کامل کن، XP بگیر و سریع‌تر لول‌آپ شو.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quests.map((quest) => {
            const isClaimed = claimedQuests.includes(quest.id);
            const isClaimable = quest.completed && !isClaimed;
            return (
              <div
                key={quest.id}
                className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                  isClaimed
                    ? "bg-emerald-500/5 border-emerald-500/15 opacity-75"
                    : isClaimable
                    ? "bg-yellow-500/5 border-yellow-500/25"
                    : "bg-black/20 border-white/5 hover:border-white/10"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${isClaimed ? "bg-emerald-500/10 text-emerald-400" : isClaimable ? "bg-yellow-500/10 text-yellow-400" : "bg-white/5 text-gray-400"}`}>
                    {isClaimed ? "✓" : quest.icon}
                  </div>
                  <div className="text-right min-w-0 flex-1">
                    <div className={`text-xs font-black truncate ${isClaimed ? "text-emerald-400 line-through" : isClaimable ? "text-yellow-300" : "text-gray-200"}`}>{quest.title}</div>
                    <div className="text-[10px] text-gray-500 mt-1 truncate">{quest.desc}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/10">+{quest.xp} XP</span>
                  {isClaimed ? (
                    <span className="text-[10px] font-black text-emerald-500">گرفته شد</span>
                  ) : isClaimable ? (
                    <button onClick={() => handleClaimQuest(quest.id)} disabled={claimLoading !== null} className="text-[10px] bg-gradient-to-r from-yellow-500 to-amber-600 text-black px-2.5 py-1 rounded-lg font-black disabled:opacity-50">
                      {claimLoading === quest.id ? "..." : "دریافت"}
                    </button>
                  ) : (
                    <Link href={quest.href} className="text-[10px] bg-purple-600 hover:bg-purple-500 text-white px-2.5 py-1 rounded-lg font-black">شروع</Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {message && <div className="text-green-300 text-xs mt-3 text-right font-bold">✅ {message}</div>}
        {error && <div className="text-red-300 text-xs mt-3 text-right font-bold">❌ {error}</div>}
      </div>
    </section>
  );
}
