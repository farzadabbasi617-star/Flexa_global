"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

export default function EditProfilePage() {
  const { t, lang } = useLanguage();
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({
    displayName: "",
    clashRoyaleId: "",
    clashRoyaleUsername: "",
    codMobileId: "",
    codMobileUsername: "",
    codMobileRegion: "global" as "global" | "garena",
    fortniteId: "",
    fortniteUsername: "",
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
    if (user) {
      setForm({
        displayName: user.displayName || "",
        clashRoyaleId: user.clashRoyaleId || "",
        clashRoyaleUsername: user.clashRoyaleUsername || "",
        codMobileId: user.codMobileId || "",
        codMobileUsername: user.codMobileUsername || "",
        codMobileRegion: user.codMobileRegion || "global",
        fortniteId: user.fortniteId || "",
        fortniteUsername: user.fortniteUsername || "",
      });
    }
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError("");

    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error || "ذخیره اطلاعات انجام نشد.");
      } else {
        await refreshUser();
        setForm((current) => ({
          ...current,
          clashRoyaleId: data.user?.clashRoyaleId || current.clashRoyaleId,
          clashRoyaleUsername: data.user?.clashRoyaleUsername || "",
        }));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setSaveError("ارتباط با سرور انجام نشد.");
    }
    setSaving(false);
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="text-4xl animate-neon-pulse">⚡</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">
          ✏️ <span className="neon-text-purple">{t.auth.editProfile}</span>
        </h1>
        <p className="text-gray-400 mb-8">
          {lang === "fa" ? "اطلاعات پروفایل و آیدی بازی‌ها" : "Profile info & game IDs"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <div className="gaming-card p-6">
            <h3 className="text-lg font-bold mb-4 neon-text-blue">
              {lang === "fa" ? "اطلاعات اصلی" : "Basic Info"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-2 font-bold">
                  {lang === "fa" ? "نام داخل Flexa و مسابقات (عمومی)" : "Public Flexa gamer name"}
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  dir="auto"
                  className="gaming-input"
                  placeholder={lang === "fa" ? "مثلاً Farzadov" : "e.g. Farzadov"}
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
                <p className="text-[11px] text-gray-500 mt-2 leading-5">
                  {lang === "fa" ? "این نام از نام و نام خانوادگی واقعی حساب جداست و در پروفایل، جدول‌ها و Matchها نمایش داده می‌شود." : "This is separate from your legal name and appears in profiles, leaderboards and matches."}
                </p>
              </div>
            </div>
          </div>

          {/* Game IDs */}
          <div className="gaming-card p-6">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-bold neon-text-purple">{t.auth.gameIds}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neon-orange/20 text-neon-orange">
                {t.auth.requiredForPrize}
              </span>
            </div>
            <p className="text-gray-400 text-sm mb-6">{t.auth.gameIdsDesc}</p>

            {/* Clash Royale */}
            <div className="mb-6 p-4 bg-dark-700 rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">⚔️</span>
                <span className="font-bold text-neon-blue">{t.games.clash_royale}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {t.auth.clashRoyaleId}
                  </label>
                  <input
                    type="text"
                    className="gaming-input text-sm"
                    placeholder={t.auth.clashRoyaleIdPlaceholder}
                    value={form.clashRoyaleId}
                    onChange={(e) => setForm({ ...form, clashRoyaleId: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {t.auth.clashRoyaleUsername}
                  </label>
                  <input
                    type="text"
                    className="gaming-input text-sm"
                    placeholder={lang === "fa" ? "نام کاربری شما" : "Your username"}
                    value={form.clashRoyaleUsername}
                    readOnly
                  />
                  <p className="text-[11px] text-cyan-300/80 mt-2">نام بازیکن بعد از ذخیره، مستقیماً از Supercell API دریافت می‌شود.</p>
                </div>
              </div>
            </div>

            {/* COD Mobile */}
            <div className="mb-6 p-4 bg-dark-700 rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">🎯</span>
                <span className="font-bold text-neon-orange">{t.games.cod_mobile}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {t.auth.codMobileId}
                  </label>
                  <input
                    type="text"
                    className="gaming-input text-sm"
                    placeholder={t.auth.codMobileIdPlaceholder}
                    value={form.codMobileId}
                    onChange={(e) => setForm({ ...form, codMobileId: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {t.auth.codMobileUsername}
                  </label>
                  <input
                    type="text"
                    className="gaming-input text-sm"
                    placeholder={lang === "fa" ? "نام داخل بازی" : "In-game name"}
                    value={form.codMobileUsername}
                    onChange={(e) => setForm({ ...form, codMobileUsername: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">ریجن COD Mobile</label>
                  <select
                    className="gaming-input text-sm"
                    value={form.codMobileRegion}
                    onChange={(e) => setForm({ ...form, codMobileRegion: e.target.value as "global" | "garena" })}
                  >
                    <option value="global">Global</option>
                    <option value="garena">Garena</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-orange-500/15 bg-orange-500/5 px-3 py-2 text-[11px] text-gray-400">
                <span>وضعیت مالکیت: {user.codMobileStatus === "verified" ? "✅ تأییدشده" : user.codMobileStatus === "pending" ? "⏳ در انتظار بررسی" : user.codMobileStatus === "rejected" ? "❌ رد شده؛ اطلاعات را اصلاح کن" : "ثبت‌نشده"}</span>
                <Link href="/cod-arena" className="font-black text-orange-300">ورود به COD Arena ←</Link>
              </div>
            </div>

            {/* Fortnite */}
            <div className="p-4 bg-dark-700 rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">🏗️</span>
                <span className="font-bold text-neon-purple">{t.games.fortnite}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {t.auth.fortniteId}
                  </label>
                  <input
                    type="text"
                    className="gaming-input text-sm"
                    placeholder={t.auth.fortniteIdPlaceholder}
                    value={form.fortniteId}
                    onChange={(e) => setForm({ ...form, fortniteId: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {t.auth.fortniteUsername}
                  </label>
                  <input
                    type="text"
                    className="gaming-input text-sm"
                    placeholder={lang === "fa" ? "نام کاربری شما" : "Your username"}
                    value={form.fortniteUsername}
                    onChange={(e) => setForm({ ...form, fortniteUsername: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {saveError && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {saveError}
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="gaming-btn py-3 px-8 disabled:opacity-50"
            >
              {saving ? t.auth.saving : t.auth.saveGameIds}
            </button>
            {saved && (
              <span className="text-neon-green text-sm animate-slide-up">
                ✓ {t.auth.saved}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
