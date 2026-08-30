"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import NewsReviewPanel from "@/components/admin/NewsReviewPanel";
import { useAuth } from "@/contexts/AuthContext";

type TabKey = "overview" | "users" | "tournaments" | "matches" | "judgments" | "disputes" | "messages" | "telegram" | "media" | "news";

interface ConsoleData {
  stats: Record<string, number>;
  users: Array<Record<string, any>>;
  tournaments: Array<Record<string, any>>;
  matches: Array<Record<string, any>>;
  judgments: Array<Record<string, any>>;
  disputes: Array<Record<string, any>>;
  messages: Array<Record<string, any>>;
  telegramPreRegistrations: Array<Record<string, any>>;
  images: Array<Record<string, any>>;
}

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "overview", label: "فرماندهی", icon: "👑" },
  { key: "users", label: "کاربران", icon: "👥" },
  { key: "tournaments", label: "تورنومنت‌ها", icon: "🏆" },
  { key: "matches", label: "مسابقات", icon: "⚔️" },
  { key: "judgments", label: "داوری‌ها", icon: "⚖️" },
  { key: "disputes", label: "اعتراضات", icon: "🚨" },
  { key: "messages", label: "پیام‌ها", icon: "💬" },
  { key: "telegram", label: "تلگرام", icon: "⚡" },
  { key: "media", label: "رسانه و ظاهر", icon: "🖼️" },
  { key: "news", label: "اخبار", icon: "📰" },
];

function fmt(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toLocaleString("fa-IR");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return new Date(value).toLocaleString("fa-IR");
  }
  if (typeof value === "number") return value.toLocaleString("fa-IR");
  return String(value);
}

function StatusPill({ value }: { value: string }) {
  const map: Record<string, string> = {
    registration: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    in_progress: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30",
    completed: "bg-green-500/10 text-green-300 border-green-500/30",
    cancelled: "bg-red-500/10 text-red-300 border-red-500/30",
    pending: "bg-gray-500/10 text-gray-300 border-gray-500/30",
    disputed: "bg-red-500/10 text-red-300 border-red-500/30",
    awaiting_judgment: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    open: "bg-orange-500/10 text-orange-300 border-orange-500/30",
    resolved: "bg-green-500/10 text-green-300 border-green-500/30",
    new: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    contacted: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30",
    converted: "bg-green-500/10 text-green-300 border-green-500/30",
    archived: "bg-gray-500/10 text-gray-300 border-gray-500/30",
  };
  return <span className={`px-2 py-1 rounded-full border text-[10px] font-black ${map[value] || "bg-white/5 text-gray-300 border-white/10"}`}>{value}</span>;
}

export default function AdminPage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    // Honour ?tab= so links from elsewhere in the panel land on the right tab.
    if (typeof window === "undefined") return "overview";
    const requested = new URLSearchParams(window.location.search).get("tab");
    return (tabs.some((tab) => tab.key === requested) ? requested : "overview") as TabKey;
  });
  const [data, setData] = useState<ConsoleData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const loadConsole = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/console", { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "پنل مدیریت بارگذاری نشد");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "پنل مدیریت بارگذاری نشد");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refreshUser().catch(() => undefined);
  }, [refreshUser]);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) loadConsole();
  }, [isAdmin, loadConsole]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const rows = activeTab === "telegram"
      ? data.telegramPreRegistrations
      : ((data[activeTab as keyof ConsoleData] as Array<Record<string, any>>) || []);
    if (!q) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [activeTab, data, query]);

  async function deleteResource(resource: string, id: string) {
    if (!confirm("این عملیات قابل بازگشت نیست. ادامه می‌دهی؟")) return;
    try {
      const res = await fetch("/api/admin/console", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ resource, id }),
      });
      if (!res.ok) throw new Error("Delete failed");
      loadConsole();
    } catch {
      alert("حذف انجام نشد");
    }
  }

  async function updateResource(resource: string, id: string, patch: Record<string, unknown>) {
    try {
      const res = await fetch("/api/admin/console", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ resource, id, data: patch }),
      });
      if (!res.ok) throw new Error("Update failed");
      loadConsole();
    } catch {
      alert("ذخیره انجام نشد");
    }
  }

  if (loading || !user || !isAdmin) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="flex items-center justify-center py-32"><div className="text-5xl animate-neon-pulse">🔒</div></div>
      </div>
    );
  }

  const statCards = data
    ? [
        { key: "users", icon: "👥", label: "کاربران", value: data.stats.users, color: "text-neon-blue" },
        { key: "tournaments", icon: "🏆", label: "تورنومنت‌ها", value: data.stats.tournaments, color: "text-neon-purple" },
        { key: "matches", icon: "⚔️", label: "مسابقات", value: data.stats.matches, color: "text-neon-orange" },
        { key: "completedMatches", icon: "✅", label: "تکمیل‌شده", value: data.stats.completedMatches, color: "text-neon-green" },
        { key: "aiJudgments", icon: "🤖", label: "داوری AI", value: data.stats.aiJudgments, color: "text-neon-blue" },
        { key: "judgments", icon: "⚖️", label: "کل داوری‌ها", value: data.stats.judgments, color: "text-neon-purple" },
        { key: "disputes", icon: "🚨", label: "اعتراضات", value: data.stats.disputes, color: "text-neon-pink" },
        { key: "messages", icon: "💬", label: "پیام‌ها", value: data.stats.messages, color: "text-gray-300" },
        { key: "telegram", icon: "⚡", label: "پیش‌ثبت‌نام تلگرام", value: data.stats.telegramPreRegistrations, color: "text-neon-orange" },
        { key: "codProfiles", icon: "✅", label: "UID کالاف در انتظار", value: data.stats.codPendingProfiles || 0, color: "text-emerald-300", href: "/admin/cod-profiles" },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#070711] text-white relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none opacity-80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(168,85,247,.32),transparent_55%),radial-gradient(circle_at_0%_40%,rgba(0,212,255,.10),transparent_35%)]" />
        <div className="absolute inset-0 opacity-[.04] bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[size:38px_38px]" />
      </div>
      <Navbar />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
        <section className="admin-hero gaming-card p-6 sm:p-8 mb-8 border-neon-purple/20 overflow-hidden relative">
          <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-neon-purple/20 blur-3xl animate-pulse" />
          <div className="absolute -bottom-16 -right-16 w-48 h-48 rounded-full bg-neon-blue/10 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-neon-pink to-neon-orange flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(255,0,110,.25)] animate-float-slow">👑</div>
              <div>
                <h1 className="text-2xl sm:text-4xl font-black">مرکز فرماندهی Flexa</h1>
                <p className="text-gray-400 mt-2 text-sm">دسترسی کامل به کاربران، تورنومنت‌ها، مسابقات، داوری‌ها، اعتراضات، پیام‌ها و ظاهر اپ</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/users" className="gaming-btn text-xs">+ کاربر / نقش‌ها</Link>
              <Link href="/admin/tournaments" className="gaming-btn text-xs">کنترل تورنومنت</Link>
              <Link href="/admin/images" className="gaming-btn text-xs">+ تصویر</Link>
              <button onClick={() => setActiveTab("telegram")} className="gaming-btn text-xs">پیش‌ثبت‌نام تلگرام</button>
              <Link href="/admin/wallets" className="gaming-btn text-xs">کیف پول</Link>
              <Link href="/admin/cod-profiles" className="gaming-btn text-xs">تأیید UID کالاف</Link>
            </div>
          </div>
        </section>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4 mb-6">{error}</div>}

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {busy
            ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="gaming-card p-5 animate-pulse"><div className="h-14 bg-dark-600 rounded-xl" /></div>)
            : statCards.map((s) => (
                <button key={s.key} onClick={() => ("href" in s && s.href) ? router.push(s.href) : setActiveTab(s.key === "completedMatches" ? "matches" : (s.key as TabKey))} className="gaming-card p-4 text-right hover:border-neon-purple/40 transition-all group">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl group-hover:scale-125 transition-transform">{s.icon}</span>
                    <div>
                      <div className={`text-2xl font-black ${s.color}`}>{fmt(s.value)}</div>
                      <div className="text-xs text-gray-500">{s.label}</div>
                    </div>
                  </div>
                </button>
              ))}
        </section>

        <section className="gaming-card p-3 mb-6 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {tabs.map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`px-4 py-3 rounded-2xl text-sm font-black transition-all ${activeTab === tab.key ? "bg-neon-purple text-white shadow-[0_0_24px_rgba(168,85,247,.35)]" : "text-gray-400 hover:bg-dark-700 hover:text-white"}`}>
                <span className="me-2">{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab !== "overview" && activeTab !== "news" && (
          <div className="mb-5 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="gaming-input max-w-md" placeholder="جستجو در همین بخش..." />
            <button onClick={loadConsole} className="px-4 py-3 rounded-xl bg-dark-700 text-sm font-bold hover:bg-dark-600">🔄 بروزرسانی</button>
          </div>
        )}

        {activeTab === "news" && <div dir="rtl"><NewsReviewPanel /></div>}

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {[
              { href: "/admin/users", icon: "👥", title: "مدیریت کاربران", desc: "مشاهده، افزودن، نقش‌دهی، حذف امن و تأیید کاربران" },
              { href: "/tournaments", icon: "🏆", title: "مدیریت تورنومنت‌ها", desc: "ساخت، مشاهده، وضعیت، حذف و کنترل رویدادها" },
              { href: "/admin/cod-arena", icon: "🎯", title: "مرکز عملیات COD Arena", desc: "کاستوم‌روم، Roomer، Spectator، Kill، جایزه، مدرک، رنک و تسویه" },
              { href: "/admin/cod-profiles", icon: "✅", title: "تأیید UID کالاف", desc: "بررسی و تأیید COD UID/Username کاربران برای ثبت‌نام پولی" },
              { href: "/admin/cod-reports", icon: "🚨", title: "گزارش‌ها و جریمه‌های COD", desc: "بررسی چیت، تیم‌آپ، رکورد، اخطار، جریمه و بن بازیکن‌ها" },
              { href: "/judging", icon: "⚖️", title: "داوری مسابقات", desc: "ثبت نتیجه، داوری دستی، بررسی AI و اعتراضات" },
              { href: "/admin/images", icon: "🖼️", title: "استودیو رسانه", desc: "تصویر پس‌زمینه، هیرو، کارت بازی‌ها، آیکون‌ها و بنرها" },
              { href: "/admin/customize", icon: "🎨", title: "ظاهر و افکت‌ها", desc: "رنگ، برند، آیکون، فونت، اعلان و عمق بصری" },
              { href: "/admin/ai", icon: "🤖", title: "مرکز هوش مصنوعی", desc: "مدریشن، دستیار، تحلیل و موتور داوری هوشمند" },
              { href: "/admin/matches", icon: "⚔️", title: "مدیریت مسابقات", desc: "ثبت نتیجه، برنده، وضعیت، زمان‌بندی و حذف مسابقه" },
              { href: "/admin/judgments", icon: "⚖️", title: "مدیریت داوری‌ها", desc: "ثبت و بررسی داوری دستی و هوش مصنوعی" },
              { href: "/admin/disputes", icon: "🚨", title: "مرکز اعتراضات", desc: "پاسخ رسمی، حل‌وفصل، رد یا حذف اعتراضات" },
              { href: "/admin/wallets", icon: "💳", title: "کیف پول کاربران", desc: "مشاهده موجودی کاربران و اصلاح دستی با لاگ مدیریتی" },
              { href: "/admin/store", icon: "🛒", title: "مدیریت فروشگاه", desc: "تأیید احراز هویت فروشندگان، بررسی آگهی‌ها و حل اختلافات سفارش" },
              { href: "/admin/finance", icon: "📈", title: "گزارش مالی", desc: "گزارش تراکنش‌ها، موجودی‌ها، ورودی‌ها، خروجی‌ها و CSV" },
              { href: "/admin/prizes", icon: "🏆", title: "پرداخت جایزه", desc: "واریز جایزه تورنومنت به کیف پول برنده‌ها" },
              { href: "#telegram", icon: "⚡", title: "پیش‌ثبت‌نام تلگرام", desc: "مشاهده لیدهای ربات، Flexa ID، آیدی بازی، شماره تماس و وضعیت پیگیری" },
              { href: "/admin/notifications", icon: "🔔", title: "اعلان سیستمی", desc: "ارسال اعلان به همه کاربران یا کاربر مشخص" },
              { href: "/admin/support", icon: "🎧", title: "پشتیبانی و تیکت", desc: "مشاهده تیکت‌ها، پاسخ رسمی و تغییر وضعیت" },
              { href: "/admin/audit", icon: "🧾", title: "لاگ فعالیت مدیران", desc: "ردیابی تغییرات حساس، حذف‌ها، ویرایش‌ها و عملیات مالی" },
              { href: "/admin/maintenance", icon: "🧹", title: "نگهداری سیستم", desc: "پاکسازی نشست‌ها، rate limitها، چت اضافه و لاگ‌های قدیمی" },
              { href: "/admin/tournaments", icon: "🧩", title: "کنترل کامل تورنومنت", desc: "ویرایش کامل رویدادها، جوایز، قوانین، وضعیت و بنر" },
              { href: "/admin/honors", icon: "🏆", title: "تالار افتخارات", desc: "مدیریت محتوا، تأیید پیشنهادات هوش مصنوعی و انتشار اخبار" },
              { href: "/admin/media-partners", icon: "📣", title: "شرکای رسانه‌ای", desc: "تأیید قراردادها، رسانه‌ها، کمیسیون‌ها و تسویه افیلیت" },
              { href: "/admin/settings", icon: "⚙️", title: "تنظیمات سایت", desc: "اطلاعات سایت، تماس، تورنومنت، AI و جستجوی دستی خبر تالار افتخارات" },
            ].map((item) => (
              <Link key={item.href} href={item.href} onClick={() => item.href === "#telegram" && setActiveTab("telegram")} className="gaming-card p-6 group hover:border-neon-purple/50 transition-all relative overflow-hidden">
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-neon-purple/10 to-neon-blue/5" />
                <div className="relative flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center text-3xl group-hover:scale-110 group-hover:rotate-6 transition-transform">{item.icon}</div>
                  <div>
                    <h3 className="font-black text-lg">{item.title}</h3>
                    <p className="text-xs text-gray-500 leading-6 mt-1">{item.desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {activeTab === "users" && (
          <DataGrid rows={filtered} columns={["displayName", "username", "phoneNumber", "email", "role", "isVerified", "createdAt"]} actions={(row) => <Link href="/admin/users" className="text-neon-blue text-xs font-bold">مدیریت</Link>} />
        )}

        {activeTab === "tournaments" && (
          <DataGrid
            rows={filtered}
            columns={["name", "game", "format", "status", "registrations", "prizePool", "startDate"]}
            renderCell={(key, value, row) => key === "status" ? <StatusPill value={String(value)} /> : key === "name" ? <Link href={`/tournaments/${row.id}`} className="text-neon-blue font-bold">{fmt(value)}</Link> : fmt(value)}
            actions={(row) => (
              <div className="flex gap-2">
                <select defaultValue={row.status} onChange={(e) => updateResource("tournament", row.id, { status: e.target.value })} className="bg-dark-700 border border-gaming-border rounded-lg text-xs px-2 py-1">
                  <option value="registration">ثبت‌نام</option><option value="in_progress">در جریان</option><option value="completed">تکمیل</option><option value="cancelled">لغو</option>
                </select>
                <button onClick={() => deleteResource("tournament", row.id)} className="text-red-400 text-xs">حذف</button>
              </div>
            )}
          />
        )}

        {activeTab === "matches" && (
          <DataGrid rows={filtered} columns={["tournamentName", "round", "matchNumber", "player1Name", "player2Name", "status", "winnerName", "completedAt"]} renderCell={(key, value) => key === "status" ? <StatusPill value={String(value)} /> : fmt(value)} actions={(row) => <button onClick={() => deleteResource("match", row.id)} className="text-red-400 text-xs">حذف</button>} />
        )}

        {activeTab === "judgments" && (
          <DataGrid rows={filtered} columns={["tournamentName", "verdict", "isAiJudgment", "confidence", "reasoning", "createdAt"]} actions={(row) => <button onClick={() => deleteResource("judgment", row.id)} className="text-red-400 text-xs">حذف</button>} />
        )}

        {activeTab === "disputes" && (
          <DataGrid rows={filtered} columns={["tournamentName", "playerName", "reason", "status", "resolution", "createdAt"]} renderCell={(key, value) => key === "status" ? <StatusPill value={String(value)} /> : fmt(value)} actions={(row) => <button onClick={() => updateResource("dispute", row.id, { status: "resolved", resolution: "رسیدگی توسط مدیریت" })} className="text-neon-green text-xs">حل شد</button>} />
        )}

        {activeTab === "messages" && (
          <DataGrid rows={filtered} columns={["senderName", "senderUsername", "senderRole", "message", "createdAt"]} actions={(row) => <button onClick={() => deleteResource("message", row.id)} className="text-red-400 text-xs">حذف</button>} />
        )}

        {activeTab === "telegram" && (
          <DataGrid
            rows={filtered}
            columns={["fullName", "phoneNumber", "flexaId", "linkedDisplayName", "game", "platform", "gamerTag", "telegramUsername", "city", "teamName", "status", "updatedAt"]}
            renderCell={(key, value) => key === "status" ? <StatusPill value={String(value)} /> : fmt(value)}
            actions={(row) => (
              <div className="flex gap-2 items-center">
                <select defaultValue={row.status || "new"} onChange={(e) => updateResource("telegram_pre_registration", row.id, { status: e.target.value })} className="bg-dark-700 border border-gaming-border rounded-lg text-xs px-2 py-1">
                  <option value="new">جدید</option><option value="contacted">پیگیری شد</option><option value="converted">تبدیل به کاربر/ثبت‌نام</option><option value="archived">آرشیو</option>
                </select>
                <button onClick={() => deleteResource("telegram_pre_registration", row.id)} className="text-red-400 text-xs">حذف</button>
              </div>
            )}
          />
        )}

        {activeTab === "media" && (
          <DataGrid rows={filtered} columns={["title", "slug", "category", "isActive", "sortOrder"]} actions={() => <Link href="/admin/images" className="text-neon-blue text-xs font-bold">استودیو</Link>} />
        )}
      </main>
    </div>
  );
}

function DataGrid({
  rows,
  columns,
  renderCell,
  actions,
}: {
  rows: Array<Record<string, any>>;
  columns: string[];
  renderCell?: (key: string, value: unknown, row: Record<string, any>) => ReactNode;
  actions?: (row: Record<string, any>) => ReactNode;
}) {
  if (!rows.length) {
    return <div className="gaming-card p-10 text-center text-gray-500">داده‌ای برای نمایش نیست.</div>;
  }
  return (
    <div className="gaming-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-dark-800/80 text-gray-400">
            <tr>
              {columns.map((col) => <th key={col} className="text-right p-3 text-xs font-black uppercase">{col}</th>)}
              {actions && <th className="text-right p-3 text-xs font-black">عملیات</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id || JSON.stringify(row)} className="border-t border-white/5 hover:bg-white/[.03] transition-colors">
                {columns.map((col) => (
                  <td key={col} className="p-3 max-w-[280px] truncate text-gray-300">
                    {renderCell ? renderCell(col, row[col], row) : fmt(row[col])}
                  </td>
                ))}
                {actions && <td className="p-3 whitespace-nowrap">{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
