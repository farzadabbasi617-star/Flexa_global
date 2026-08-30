"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

export default function AdminSetupPage() {
  const { user, loading, refreshUser } = useAuth();
  const [setupSecret, setSetupSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function setupAdmin() {
    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ setupSecret: setupSecret.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "راه‌اندازی مدیر انجام نشد.");
        return;
      }
      await refreshUser();
      setMessage("حساب شما به مدیر اصلی ارتقا پیدا کرد.");
    } catch {
      setError("خطای ارتباط با سرور.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="gaming-card p-8 text-center">
          <div className="text-6xl mb-5">👑</div>
          <h1 className="text-2xl font-black neon-text-purple mb-3">راه‌اندازی مدیر اصلی</h1>
          <p className="text-gray-400 text-sm leading-7 mb-6">
            اگر هنوز مدیر اصلی برای Flexa ساخته نشده باشد، با این دکمه حساب فعلی به مدیر اصلی تبدیل می‌شود. در محیط production وارد کردن کد امن راه‌اندازی الزامی است.
          </p>

          {loading ? (
            <div className="text-3xl animate-neon-pulse">⚡</div>
          ) : !user ? (
            <Link href="/login" className="gaming-btn w-full">اول وارد شوید</Link>
          ) : user.role === "super_admin" ? (
            <Link href="/admin" className="gaming-btn w-full">ورود به پنل مدیریت</Link>
          ) : (
            <div className="space-y-4">
              <input
                type="password"
                value={setupSecret}
                onChange={(e) => setSetupSecret(e.target.value)}
                placeholder="کد امن راه‌اندازی (ADMIN_SETUP_SECRET)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-400"
                autoComplete="off"
              />
              <button onClick={setupAdmin} disabled={submitting} className="gaming-btn w-full disabled:opacity-50">
                {submitting ? "در حال بررسی..." : "تبدیل حساب من به مدیر اصلی"}
              </button>
            </div>
          )}

          {message && <div className="mt-5 bg-green-500/10 border border-green-500/30 text-green-300 rounded-xl p-3 text-sm">{message}</div>}
          {error && <div className="mt-5 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 text-sm leading-6">{error}</div>}
        </div>
      </div>
    </div>
  );
}
