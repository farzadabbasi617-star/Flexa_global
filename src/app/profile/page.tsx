"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";

interface ClashApiProfile {
  tag: string;
  name: string;
  expLevel: number | null;
  trophies: number | null;
  bestTrophies: number | null;
  wins: number | null;
  losses: number | null;
  battleCount: number | null;
  clan: { tag: string | null; name: string | null } | null;
  arena: { id: number | null; name: string | null } | null;
}

interface TelegramLinkAccount {
  telegramId: string;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  linkedAt: string;
}

interface DashboardData {
  user: { id: string; displayName: string; username: string | null; flexaId: string; level: number; xp: number; rankPoints: number };
  player: { id: string; rating: number; wins: number; losses: number } | null;
  stats: {
    rating: number;
    wins: number;
    losses: number;
    winRate: number;
    myTournaments: number;
    upcomingMatches: number;
    unreadNotifications: number;
    openTickets: number;
  };
  wallet: { balanceToman: number; balanceRial: string };
  tournaments: Array<{ registrationId: string; tournamentId: string; tournamentName: string | null; game: string | null; status: string | null; startDate: string | null; checkedInAt: string | null; bannerUrl: string | null }>;
  matches: Array<{ id: string; tournamentId: string; tournamentName: string | null; opponent: { displayName: string; username: string; rating: number } | null; status: string; round: number; matchNumber: number; player1Score: number | null; player2Score: number | null; scheduledAt: string | null; createdAt: string }>;
  transactions: Array<{ id: string; type: string; status: string; amountToman: number; createdAt: string }>;
  tickets: Array<{ id: string; subject: string; status: string; createdAt: string }>;
  recentActivity: Array<{ type: string; icon: string; title: string; description: string; link: string | null; time: string }>;
}


function statusFa(status: string | null | undefined) {
  const map: Record<string, string> = {
    registration: "ثبت‌نام",
    in_progress: "در جریان",
    completed: "تکمیل‌شده",
    cancelled: "لغوشده",
    pending: "در انتظار",
    awaiting_judgment: "در انتظار داوری",
    disputed: "اعتراض‌شده",
    open: "باز",
    closed: "بسته",
    resolved: "حل‌شده",
  };
  return status ? map[status] || status : "—";
}

function transactionLabel(type: string) {
  const map: Record<string, string> = {
    deposit: "شارژ کیف پول",
    withdrawal: "برداشت",
    entry_fee: "ورودی تورنومنت",
    refund: "برگشت وجه",
    tournament_win: "جایزه تورنومنت",
  };
  return map[type] || type;
}

function getRankTier(rating: number) {
  if (rating >= 2000) return { label: "افسانه‌ای", color: "text-purple-400 bg-purple-950/40 border-purple-500/50", icon: "🔮" };
  if (rating >= 1600) return { label: "الماس", color: "text-cyan-400 bg-cyan-950/40 border-cyan-500/50", icon: "💎" };
  if (rating >= 1300) return { label: "طلایی", color: "text-yellow-400 bg-yellow-950/40 border-yellow-500/50", icon: "🥇" };
  if (rating >= 1000) return { label: "نقره‌ای", color: "text-gray-300 bg-gray-900/40 border-gray-500/50", icon: "🥈" };
  return { label: "برنزی", color: "text-amber-600 bg-amber-950/40 border-amber-800/50", icon: "🥉" };
}

export default function ProfilePage() {
  const { user, loading, logout, refreshUser } = useAuth();
  const router = useRouter();

  // Dashboard Data
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [clashProfile, setClashProfile] = useState<ClashApiProfile | null>(null);

  // Profile Edit Data
  const [displayName, setDisplayName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("/icons/profile_icon.png");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  // Telegram Link Data
  const [telegramAccount, setTelegramAccount] = useState<TelegramLinkAccount | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramMessage, setTelegramMessage] = useState("");
  const [telegramError, setTelegramError] = useState("");

  // Interactive Quests System State (Option 3)
  const [claimedQuests, setClaimedQuests] = useState<string[]>([]);
  const [claimLoading, setClaimLoading] = useState<string | null>(null);
  const [questSuccessMsg, setQuestSuccessMsg] = useState("");
  const [questErrorMsg, setQuestErrorMsg] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setDashboardError("");
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "اطلاعات حساب بارگذاری نشد");
      setData(json);
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : "اطلاعات حساب بارگذاری نشد");
    } finally {
      setBusy(false);
    }
  }, [user]);

  async function loadClashProfile(tag?: string | null) {
    if (!tag) return setClashProfile(null);
    try {
      const response = await fetch(`/api/clash-royale/player?tag=${encodeURIComponent(tag)}`, { cache: "no-store", credentials: "include" });
      const json = await response.json();
      setClashProfile(response.ok ? json.player || null : null);
    } catch {
      setClashProfile(null);
    }
  }

  async function loadTelegramLink() {
    if (!user) return;
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/link", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (res.ok) setTelegramAccount(json.account || null);
    } catch {
      setTelegramAccount(null);
    }
    setTelegramLoading(false);
  }

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || user.username || "");
      setSelectedAvatar(user.avatarUrl || "/icons/profile_icon.png");
      const metadata = (user.metadata as Record<string, any>) || {};
      setClaimedQuests(metadata.claimedQuests || []);
      loadDashboard();
      loadTelegramLink();
      loadClashProfile(user.clashRoyaleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const gameIds = useMemo(() => {
    if (!user) return [];
    return [
      {
        label: "کلش رویال",
        icon: "/icons/icon-clash_royale.png",
        id: user.clashRoyaleId,
        username: user.clashRoyaleUsername,
      },
      {
        label: "کالاف موبایل",
        icon: "/icons/icon-cod_mobile.png",
        id: user.codMobileId,
        username: user.codMobileUsername,
      },
      {
        label: "فورتنایت",
        icon: "/icons/icon-fortnite.png",
        id: user.fortniteId,
        username: user.fortniteUsername,
      },
    ];
  }, [user]);

  async function saveProfile(nextAvatar?: string) {
    if (!user) return;
    const avatarUrl = nextAvatar || selectedAvatar;
    setProfileSaving(true);
    setProfileMessage("");
    setProfileError("");
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ displayName: displayName.trim(), avatarUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ذخیره پروفایل انجام نشد.");
      setProfileMessage("پروفایل با موفقیت ذخیره شد.");
      await refreshUser();
      loadDashboard();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "ذخیره پروفایل انجام نشد.");
    }
    setProfileSaving(false);
  }

  async function chooseAvatar(url: string) {
    setSelectedAvatar(url);
    await saveProfile(url);
  }

  async function submitTelegramCode() {
    setTelegramMessage("");
    setTelegramError("");
    const code = telegramCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setTelegramError("کد اتصال باید ۶ رقم باشد.");
      return;
    }
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "اتصال تلگرام انجام نشد.");
      setTelegramMessage("حساب تلگرام با موفقیت لینک شد.");
      setTelegramCode("");
      await loadTelegramLink();
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : "اتصال تلگرام انجام نشد.");
    }
    setTelegramLoading(false);
  }

  async function unlinkTelegram() {
    if (!confirm("اتصال تلگرام حذف شود؟")) return;
    setTelegramMessage("");
    setTelegramError("");
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/link", {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "حذف اتصال انجام نشد.");
      setTelegramAccount(null);
      setTelegramMessage("اتصال تلگرام حذف شد.");
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : "حذف اتصال انجام نشد.");
    }
    setTelegramLoading(false);
  }

  // Interactive Quest Claim Reward API call
  async function handleClaimQuest(questId: string) {
    setClaimLoading(questId);
    setQuestSuccessMsg("");
    setQuestErrorMsg("");
    try {
      const res = await fetch("/api/quests/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ questId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "خطا در ثبت مأموریت");
      
      setQuestSuccessMsg(json.message);
      setClaimedQuests(json.claimedQuests || []);
      
      // Update local state instantly and sync from backend
      await refreshUser();
      loadDashboard();
    } catch (err) {
      setQuestErrorMsg(err instanceof Error ? err.message : "ثبت مأموریت انجام نشد.");
    }
    setClaimLoading(null);
  }

  const nextMatch = useMemo(() => data?.matches.find((m) => m.status !== "completed") || null, [data]);
  const activeTournament = useMemo(() => data?.tournaments.find((t) => t.status === "registration" || t.status === "in_progress") || null, [data]);

  const hasGameIds = user?.clashRoyaleId || user?.codMobileId || user?.fortniteId;
  const tier = useMemo(() => getRankTier(data?.stats.rating ?? 1000), [data]);

  // Exact XP progression calculation matching Flexa leveling formula
  const xpInfo = useMemo(() => {
    if (!user) return { currentLevelBaseXP: 0, nextLevelTargetXP: 100, levelXP: 0, levelMaxXP: 100, progressPercent: 0 };
    const lvl = user.level || 1;
    const currentLevelBaseXP = Math.pow(lvl - 1, 2) * 100;
    const nextLevelTargetXP = Math.pow(lvl, 2) * 100;
    const levelXP = (user.xp || 0) - currentLevelBaseXP;
    const levelMaxXP = nextLevelTargetXP - currentLevelBaseXP;
    const progressPercent = Math.max(0, Math.min(100, (levelXP / levelMaxXP) * 100));
    return { currentLevelBaseXP, nextLevelTargetXP, levelXP, levelMaxXP, progressPercent };
  }, [user]);

  // Client-side interactive and dynamic Quest Checklist (Option 3)
  const quests = useMemo(() => {
    if (!user || !data) return [];
    return [
      {
        id: "game_ids",
        title: "ثبت شناسه‌های بازی",
        desc: "ثبت حداقل یک آیدی بازی (کالاف، کلش یا فورتنایت)",
        xp: 50,
        completed: Boolean(hasGameIds),
        icon: "🎮",
      },
      {
        id: "telegram_link",
        title: "اتصال به ربات تلگرام",
        desc: "لینک کردن موفق حساب تلگرام به Flexa",
        xp: 50,
        completed: Boolean(telegramAccount),
        icon: "🔗",
      },
      {
        id: "join_tournament",
        title: "اولین رقابت",
        desc: "ثبت‌نام در حداقل یک تورنومنت Flexa",
        xp: 100,
        completed: Boolean(data.stats.myTournaments > 0),
        icon: "⚔️",
      },
      {
        id: "level_5",
        title: "کهنه‌کار نوپا",
        desc: "رسیدن به سطح کاربری ۵ در پلتفرم",
        xp: 150,
        completed: Boolean(user.level >= 5),
        icon: "⚡",
      },
    ];
  }, [user, data, hasGameIds, telegramAccount]);

  if (loading || busy || !user) {
    return (
      <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center">
        <div className="text-4xl animate-pulse">⚡</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,_rgba(92,0,160,.68)_0%,_rgba(32,0,56,.42)_34%,_transparent_72%)]" />
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-purple-700/20 blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-[540px] mx-auto px-4 sm:px-5" style={{ paddingBottom: "var(--bottom-nav-space)" }}>
        
        {/* Header */}
        <header className="pt-7 sm:pt-10 pb-4 text-right">
          <div className="inline-flex items-center gap-2 text-[10px] font-black text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1 mb-3">
            👑 تنظیمات، پروفایل و داشبورد کاربری Flexa
          </div>
          <h1 className="text-3xl font-black">تنظیمات حساب</h1>
          <p className="text-xs text-gray-500 mt-1 leading-6">
            کارت هویت رسمی بازیکن و دسترسی به بخش‌های حساب
          </p>
        </header>

        {/* Site Errors */}
        {dashboardError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-2xl p-4 mb-5 text-xs text-right">
            {dashboardError}
          </div>
        )}

        {/* Option 2: Esports Gamer ID Card */}
        <section className="mb-6 relative group">
          {/* Subtle backglow */}
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/15 to-cyan-500/15 rounded-[38px] blur-xl opacity-60 transition-opacity group-hover:opacity-100" />
          
          <div className="relative glass-panel rounded-[38px] border border-purple-500/30 overflow-hidden bg-gradient-to-br from-[#1c1140]/90 via-[#0a071f]/95 to-[#050508]/100 p-6 shadow-2xl">
            {/* Holographic Watermark lines */}
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[linear-gradient(45deg,#fff_25%,transparent_25%,transparent_50%,#fff_50%,#fff_75%,transparent_75%,transparent)] bg-[length:40px_40px]" />
            <div className="absolute -top-12 -left-12 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Top Bar of the Card */}
            <div className="flex justify-between items-start mb-6">
              <div className="text-right">
                <div className="text-[9px] font-black text-purple-400 tracking-[0.2em] uppercase leading-none">GAMENT ATHLETE LICENSE</div>
                <div className="text-[10px] text-gray-500 font-bold mt-1 leading-none">کارت هویت رسمی بازیکن</div>
              </div>
              <img src="/icons/flexa-icon-192.png" alt="Flexa Logo" className="w-8 h-8 object-contain drop-shadow-[0_0_8px_rgba(188,0,255,0.4)]" loading="lazy" decoding="async" />
            </div>

            {/* Body of the Card */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex-1 min-w-0 text-right">
                <h2 className="text-2xl sm:text-3xl font-black text-white truncate leading-none mb-2">{user.displayName}</h2>
                <div className="text-xs text-gray-400 font-bold num-en">@{user.username}</div>
                
                <div className="flex items-center gap-1.5 justify-end mt-3.5">
                  <span className="text-[10px] text-purple-300 font-black en-font tracking-wide bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20 num-en">
                    {user.flexaId}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[9px] border font-black flex items-center gap-1 shrink-0 ${tier.color}`}>
                    <span>{tier.icon}</span>
                    <span>{tier.label}</span>
                  </span>
                </div>
              </div>

              {/* Avatar Box with level badge */}
              <div className="relative shrink-0">
                <div className="p-0.5 rounded-full bg-gradient-to-tr from-[#bc00ff] to-[#00d2ff] shadow-[0_0_20px_rgba(188,0,255,0.35)]">
                  <img
                    src={selectedAvatar}
                    alt="Avatar"
                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-[#09071f] object-cover bg-black/40"
                    onError={(e) => ((e.target as HTMLImageElement).src = "/icons/profile_icon.png")}
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-purple-600 to-fuchsia-600 border-2 border-[#09071f] w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black num-en shadow-md">
                  {user.level || 1}
                </div>
              </div>
            </div>

            {/* Bottom Bar: Level progress & License Info */}
            <div className="mt-6 pt-4 border-t border-white/5 flex flex-col gap-2">
              <div className="flex justify-between items-center text-[9px] text-gray-500 font-bold">
                <span className="num-en">LEVEL {user.level || 1} PROGRESS</span>
                <span className="num-en text-purple-300">{user.xp || 0} / {xpInfo.nextLevelTargetXP} XP</span>
              </div>
              <div className="h-2 bg-black/40 border border-white/5 rounded-full overflow-hidden p-0.5">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-500 shadow-[0_0_10px_rgba(188,0,255,0.5)] transition-all duration-500"
                  style={{ width: `${xpInfo.progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {clashProfile && (
          <section className="gaming-card p-5 mb-6 border border-cyan-500/25 bg-cyan-950/10" dir="rtl">
            <div className="flex items-center justify-between gap-3 mb-4"><div><h3 className="font-black text-cyan-300">⚔️ پروفایل تأییدشده کلش رویال</h3><p className="text-xs text-gray-500 mt-1">اطلاعات زنده از Supercell API</p></div><span className="text-green-300 text-xs font-black">✅ API Verified</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="bg-black/20 rounded-xl p-3"><div className="text-xs text-gray-500">نام</div><div className="font-black mt-1 truncate">{clashProfile.name}</div></div>
              <div className="bg-black/20 rounded-xl p-3"><div className="text-xs text-gray-500">Trophy</div><div className="font-black text-yellow-300 mt-1">{Number(clashProfile.trophies || 0).toLocaleString("fa-IR")}</div></div>
              <div className="bg-black/20 rounded-xl p-3"><div className="text-xs text-gray-500">Best</div><div className="font-black text-orange-300 mt-1">{Number(clashProfile.bestTrophies || 0).toLocaleString("fa-IR")}</div></div>
              <div className="bg-black/20 rounded-xl p-3"><div className="text-xs text-gray-500">Arena</div><div className="font-black text-purple-300 mt-1 truncate">{clashProfile.arena?.name || "—"}</div></div>
              <div className="bg-black/20 rounded-xl p-3"><div className="text-xs text-gray-500">برد</div><div className="font-black text-green-300 mt-1">{Number(clashProfile.wins || 0).toLocaleString("fa-IR")}</div></div>
              <div className="bg-black/20 rounded-xl p-3"><div className="text-xs text-gray-500">باخت</div><div className="font-black text-red-300 mt-1">{Number(clashProfile.losses || 0).toLocaleString("fa-IR")}</div></div>
              <div className="bg-black/20 rounded-xl p-3"><div className="text-xs text-gray-500">Clan</div><div className="font-black mt-1 truncate">{clashProfile.clan?.name || "بدون کلن"}</div></div>
              <div className="bg-black/20 rounded-xl p-3"><div className="text-xs text-gray-500">Player Tag</div><div className="font-black font-mono mt-1">{clashProfile.tag}</div></div>
            </div>
          </section>
        )}

        {/* Settings tabs */}
        <section className="grid grid-cols-2 gap-3 mb-8" dir="rtl">
          <Link href="/profile/user" className="settings-tile flex items-center justify-center gap-2 bg-[#111114] border border-purple-500/20 rounded-2xl py-4 hover:border-purple-500/40 active:scale-95 transition-transform">
            <img src="/icons/profile_icon.png" alt="پروفایل" className="w-6 h-6 object-contain drop-shadow-[0_0_8px_#bc00ff]" loading="lazy" decoding="async" />
            <span className="text-xs font-black text-purple-200">پروفایل</span>
          </Link>
          <Link href="/wallet" className="settings-tile flex items-center justify-center gap-2 bg-[#111114] border border-purple-500/20 rounded-2xl py-4 hover:border-purple-500/40 active:scale-95 transition-transform">
            <img src="/icons/wallet_icon.png" alt="کیف پول" className="w-6 h-6 object-contain drop-shadow-[0_0_8px_#bc00ff]" loading="lazy" decoding="async" />
            <span className="text-xs font-black text-purple-200">کیف پول</span>
          </Link>
          <Link href="/profile/descriptions" className="settings-tile flex items-center justify-center gap-2 bg-[#111114] border border-cyan-500/20 rounded-2xl py-4 hover:border-cyan-500/40 active:scale-95 transition-transform">
            <img src="/icons/profile_descriptions.png" alt="توضیحات" className="w-6 h-6 object-contain drop-shadow-[0_0_8px_#00d2ff]" loading="lazy" decoding="async" />
            <span className="text-xs font-black text-cyan-200">توضیحات</span>
          </Link>
          <Link href="/profile/security" className="settings-tile flex items-center justify-center gap-2 bg-[#111114] border border-white/10 rounded-2xl py-4 hover:border-white/20 active:scale-95 transition-transform">
            <img src="/icons/profile_security.png" alt="امنیت حساب" className="w-6 h-6 object-contain drop-shadow-[0_0_8px_#bc00ff]" loading="lazy" decoding="async" />
            <span className="text-xs font-black">امنیت حساب</span>
          </Link>
          <Link href="/profile/privacy" className="settings-tile flex items-center justify-center gap-2 bg-[#111114] border border-white/10 rounded-2xl py-4 hover:border-white/20 active:scale-95 transition-transform">
            <img src="/icons/profile_privacy.png" alt="حریم خصوصی" className="w-6 h-6 object-contain drop-shadow-[0_0_8px_#bc00ff]" loading="lazy" decoding="async" />
            <span className="text-xs font-black">حریم خصوصی</span>
          </Link>
          <Link href="/support" className="settings-tile flex items-center justify-center gap-2 bg-[#111114] border border-white/10 rounded-2xl py-4 hover:border-white/20 active:scale-95 transition-transform">
            <img src="/icons/profile_support_center.png" alt="پشتیبانی" className="w-6 h-6 object-contain drop-shadow-[0_0_8px_#bc00ff]" loading="lazy" decoding="async" />
            <span className="text-xs font-black">پشتیبانی</span>
          </Link>
          <Link href="/referrals" className="settings-tile flex items-center justify-center gap-2 bg-cyan-500/[.07] border border-cyan-400/20 rounded-2xl py-4 hover:border-cyan-400/40 active:scale-95 transition-transform">
            <span className="text-xl">🎁</span>
            <span className="text-xs font-black text-cyan-200">درآمد از معرفی</span>
          </Link>
          <Link href="/media-partners" className="settings-tile flex items-center justify-center gap-2 bg-violet-500/[.08] border border-violet-400/20 rounded-2xl py-4 hover:border-violet-400/40 active:scale-95 transition-transform">
            <span className="text-xl">📣</span>
            <span className="text-xs font-black text-violet-200">همکاری رسانه‌ای</span>
          </Link>
          {isAdmin && (
            <Link href="/admin" className="col-span-2 flex items-center justify-center gap-2 bg-[#111114] border border-fuchsia-500/20 rounded-2xl py-4 hover:border-fuchsia-500/40 active:scale-95 transition-transform">
              <img src="/icons/profile_super_admin.png" alt="پنل مدیریت ارشد" className="w-6 h-6 object-contain drop-shadow-[0_0_8px_#e879f9]" loading="lazy" decoding="async" />
              <span className="text-xs font-black text-fuchsia-300">ورود به پنل مدیریت ارشد</span>
            </Link>
          )}
        </section>

        <button
          onClick={logout}
          className="w-full glass-panel py-4 sm:py-5 rounded-[24px] sm:rounded-[30px] text-red-400 text-sm font-black border border-red-500/10 hover:bg-red-500/5 active:scale-95 transition-transform"
        >
          خروج از حساب کاربری
        </button>
      </div>

      <BottomNav />
      <style jsx global>{`
        .glass-panel { background: rgba(18, 18, 22, 0.7); backdrop-filter: blur(20px); }
        .num-en { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .en-font { font-family: Impact, "Arial Black", system-ui, sans-serif; letter-spacing: -0.04em; }
        .settings-tile { min-height: 54px; transition: transform .15s ease, border-color .15s ease; }
        
        @keyframes float-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .animate-float-slow {
          animation: float-slow 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
