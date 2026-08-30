"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface MaintenanceStats {
  sessionsTotal: number;
  expiredSessions: number;
  rateLimitsTotal: number;
  expiredRateLimits: number;
  auditTotal: number;
  oldAuditLogs: number;
}

const ACTIONS = [
  { id: "all", title: "پاکسازی کامل", desc: "نشست‌های منقضی، rate limitهای قدیمی، و لاگ‌های خیلی قدیمی", icon: "🧹" },
  { id: "sessions", title: "نشست‌های منقضی", desc: "حذف sessionهای تاریخ‌گذشته", icon: "🔐" },
  { id: "rate_limits", title: "Rate Limitهای قدیمی", desc: "پاکسازی رکوردهای منقضی محدودیت درخواست", icon: "🛡️" },
  { id: "audit", title: "لاگ‌های قدیمی", desc: "حذف audit logهای قدیمی‌تر از ۱۸۰ روز", icon: "🧾" },
];

export default function AdminMaintenancePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<MaintenanceStats | null>(null);
  const [busy, setBusy] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/maintenance", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "آمار نگهداری بارگذاری نشد");
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "آمار نگهداری بارگذاری نشد");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function run(action: string) {
    if (!confirm("عملیات پاکسازی اجرا شود؟")) return;
    setRunning(action);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "پاکسازی انجام نشد");
      setStats(data.stats);
      setMessage(`پاکسازی انجام شد: ${JSON.stringify(data.result)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "پاکسازی انجام نشد");
    } finally {
      setRunning(null);
    }
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-black neon-text-purple">🧹 نگهداری سیستم</h1>
            <p className="text-gray-500 text-sm mt-2">پاکسازی رکوردهای منقضی و کاهش حجم جدول‌های پرتکرار</p>
          </div>
          <button onClick={load} className="gaming-btn text-sm">بروزرسانی آمار</button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 rounded-xl p-3 mb-5 text-sm break-all">{message}</div>}

        {busy ? (
          <div className="text-center py-20 text-4xl animate-neon-pulse">🧹</div>
        ) : stats && (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                ["کل نشست‌ها", stats.sessionsTotal, "🔐"],
                ["نشست منقضی", stats.expiredSessions, "⏳"],
                ["RateLimitها", stats.rateLimitsTotal, "🛡️"],
                ["RateLimit منقضی", stats.expiredRateLimits, "♻️"],
                ["لاگ مدیران", stats.auditTotal, "🧾"],
                ["لاگ قدیمی", stats.oldAuditLogs, "🗑️"],
              ].map(([label, value, icon]) => (
                <div key={String(label)} className="gaming-card p-4">
                  <div className="text-2xl mb-2">{icon}</div>
                  <div className="text-2xl font-black text-neon-blue">{Number(value).toLocaleString("fa-IR")}</div>
                  <div className="text-xs text-gray-500 mt-1">{label}</div>
                </div>
              ))}
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ACTIONS.map((action) => (
                <div key={action.id} className="gaming-card p-5">
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">{action.icon}</div>
                    <div className="flex-1">
                      <h2 className="font-black text-lg">{action.title}</h2>
                      <p className="text-gray-500 text-sm leading-7 mt-1">{action.desc}</p>
                      <button onClick={() => run(action.id)} disabled={running !== null} className="gaming-btn text-xs mt-4 disabled:opacity-50">
                        {running === action.id ? "در حال اجرا..." : "اجرای پاکسازی"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
