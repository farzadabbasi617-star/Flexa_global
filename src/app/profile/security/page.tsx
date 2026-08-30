"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface SessionRow {
  id: string;
  isCurrent: boolean;
  device: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

export default function ProfileSecurityPage() {
  const { user, loading } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/sessions", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "نشست‌ها بارگذاری نشد");
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "نشست‌ها بارگذاری نشد");
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(sessionId: string) {
    if (!confirm("این نشست حذف شود؟")) return;
    const res = await fetch("/api/auth/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "include",
      body: JSON.stringify({ sessionId }),
    });
    if (res.ok) load();
    else setError("حذف نشست انجام نشد");
  }

  async function revokeOthers() {
    if (!confirm("همه دستگاه‌های دیگر خارج شوند؟")) return;
    const res = await fetch("/api/auth/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "include",
      body: JSON.stringify({ allOthers: true }),
    });
    if (res.ok) load();
    else setError("خروج از دستگاه‌های دیگر انجام نشد");
  }

  if (loading || busy) return <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center"><div className="text-4xl animate-neon-pulse">🔐</div></div>;

  if (!user) {
    return <div className="min-h-screen bg-dark-900 text-white"><Navbar /><div className="max-w-md mx-auto px-4 py-20 text-center"><div className="gaming-card p-8"><h1 className="text-xl font-black mb-4">برای امنیت حساب وارد شو</h1><Link href="/login" className="gaming-btn w-full">ورود</Link></div></div></div>;
  }

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "var(--bottom-nav-space)" }}>
        <Link href="/profile" className="text-gray-500 hover:text-white text-sm">← بازگشت به پروفایل</Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-5 mb-6">
          <div>
            <h1 className="text-3xl font-black neon-text-purple">🔐 امنیت حساب</h1>
            <p className="text-gray-500 text-sm mt-2">نشست‌های فعال، دستگاه‌ها و خروج از همه دستگاه‌های دیگر</p>
          </div>
          <button onClick={revokeOthers} className="gaming-btn text-sm">خروج از همه دستگاه‌های دیگر</button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}

        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className={`gaming-card p-4 ${session.isCurrent ? "border-neon-green/40" : ""}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="font-black flex items-center gap-2">
                    {session.device}
                    {session.isCurrent && <span className="text-[10px] text-neon-green bg-neon-green/10 border border-neon-green/30 rounded-full px-2 py-0.5">نشست فعلی</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-1" dir="ltr">IP: {session.ipAddress || "—"}</div>
                  <div className="text-xs text-gray-600 mt-1 truncate max-w-xl" dir="ltr">{session.userAgent || "—"}</div>
                  <div className="text-xs text-gray-500 mt-2">ایجاد: {new Date(session.createdAt).toLocaleString("fa-IR")} • انقضا: {new Date(session.expiresAt).toLocaleString("fa-IR")}</div>
                </div>
                {!session.isCurrent && <button onClick={() => revoke(session.id)} className="px-4 py-2 rounded-xl bg-red-500/10 text-red-300 text-xs font-black hover:bg-red-500/20">حذف نشست</button>}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
