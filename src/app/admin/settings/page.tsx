"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import AutoNewsButton from "@/components/admin/AutoNewsButton";

export default function AdminSettingsPage() {
  const { lang } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    site_title_fa: "Flexa",
    site_title_en: "Flexa",
    site_subtitle_fa: "پلتفرم تورنومنت گیمینگ",
    site_subtitle_en: "Gaming Tournament Platform",
    contact_email: "",
    contact_telegram: "",
    contact_instagram: "",
    min_players_tournament: "4",
    max_players_tournament: "64",
    prize_delivery_hours: "48",
    ai_auto_judge: "true",
    ai_min_confidence: "70",
    registration_open: "true",
    maintenance_mode: "false",
    announcement_fa: "",
    announcement_en: "",
  });

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      setSettings((prev) => ({ ...prev, ...data }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!loading && (!user || (user.role !== "admin" && user.role !== "super_admin"))) router.push("/");
  }, [loading, user, router]);

  useEffect(() => {
    if ((user?.role === "admin" || user?.role === "super_admin")) fetchSettings();
  }, [user, fetchSettings]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    setSaving(false);
  }

  if (loading || !user || (user.role !== "admin" && user.role !== "super_admin")) return null;

  const sections = [
    {
      title: lang === "fa" ? "🌐 اطلاعات سایت" : "🌐 Site Info",
      fields: [
        { key: "site_title_fa", label: lang === "fa" ? "عنوان سایت (فارسی)" : "Site Title (FA)", type: "text" },
        { key: "site_title_en", label: lang === "fa" ? "عنوان سایت (انگلیسی)" : "Site Title (EN)", type: "text" },
        { key: "site_subtitle_fa", label: lang === "fa" ? "زیرعنوان (فارسی)" : "Subtitle (FA)", type: "text" },
        { key: "site_subtitle_en", label: lang === "fa" ? "زیرعنوان (انگلیسی)" : "Subtitle (EN)", type: "text" },
      ],
    },
    {
      title: lang === "fa" ? "📞 اطلاعات تماس" : "📞 Contact Info",
      fields: [
        { key: "contact_email", label: lang === "fa" ? "ایمیل" : "Email", type: "email" },
        { key: "contact_telegram", label: lang === "fa" ? "تلگرام" : "Telegram", type: "text" },
        { key: "contact_instagram", label: lang === "fa" ? "اینستاگرام" : "Instagram", type: "text" },
      ],
    },
    {
      title: lang === "fa" ? "🏆 تنظیمات تورنومنت" : "🏆 Tournament Settings",
      fields: [
        { key: "min_players_tournament", label: lang === "fa" ? "حداقل بازیکن" : "Min Players", type: "number" },
        { key: "max_players_tournament", label: lang === "fa" ? "حداکثر بازیکن" : "Max Players", type: "number" },
        { key: "prize_delivery_hours", label: lang === "fa" ? "زمان ارسال جایزه (ساعت)" : "Prize Delivery (hrs)", type: "number" },
      ],
    },
    {
      title: lang === "fa" ? "🤖 تنظیمات AI" : "🤖 AI Settings",
      fields: [
        { key: "ai_auto_judge", label: lang === "fa" ? "داوری خودکار AI" : "AI Auto Judge", type: "toggle" },
        { key: "ai_min_confidence", label: lang === "fa" ? "حداقل اطمینان AI (%)" : "AI Min Confidence (%)", type: "number" },
      ],
    },
    {
      title: lang === "fa" ? "⚙️ سیستم" : "⚙️ System",
      fields: [
        { key: "registration_open", label: lang === "fa" ? "ثبت‌نام باز" : "Registration Open", type: "toggle" },
        { key: "maintenance_mode", label: lang === "fa" ? "حالت تعمیرات" : "Maintenance Mode", type: "toggle" },
        { key: "announcement_fa", label: lang === "fa" ? "اطلاعیه (فارسی)" : "Announcement (FA)", type: "textarea" },
        { key: "announcement_en", label: lang === "fa" ? "اطلاعیه (انگلیسی)" : "Announcement (EN)", type: "textarea" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white">←</button>
            <h1 className="text-2xl font-bold">
              ⚙️ <span className="neon-text-purple">{lang === "fa" ? "تنظیمات سایت" : "Site Settings"}</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-neon-green text-sm animate-slide-up">
                ✓ {lang === "fa" ? "ذخیره شد" : "Saved"}
              </span>
            )}
            <button onClick={handleSave} disabled={saving} className="gaming-btn text-sm disabled:opacity-50">
              {saving ? (lang === "fa" ? "⏳ ذخیره..." : "⏳ Saving...") : (lang === "fa" ? "💾 ذخیره" : "💾 Save")}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* An action, not a stored setting, so it sits above the fields and
              away from the save button. */}
          <div className="gaming-card border-emerald-500/25 p-6">
            <h2 className="font-bold text-emerald-300 mb-1">
              {lang === "fa" ? "📰 جستجو و ساخت خبر تالار افتخارات" : "📰 Honors News Sweep"}
            </h2>
            <p className="text-xs leading-6 text-gray-400 mb-3">
              {lang === "fa"
                ? "این دکمه خبر را بدون بازبینی مستقیم منتشر می‌کند. اگر می‌خواهی قبل از انتشار خبرها را بخوانی و تأیید کنی، از تب «📰 اخبار» در پنل مدیریت استفاده کن."
                : "This publishes immediately, without review. To read and approve stories before they go live, use the 📰 News tab in the admin panel."}
            </p>
            <a href="/admin?tab=news" className="mb-4 inline-block text-[11px] font-black text-cyan-300 hover:text-cyan-200">
              {lang === "fa" ? "رفتن به تب اخبار با بازبینی ←" : "Go to the reviewed News tab →"}
            </a>
            <AutoNewsButton />
          </div>

          {sections.map((section) => (
            <div key={section.title} className="gaming-card p-6">
              <h2 className="font-bold text-neon-blue mb-4">{section.title}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {section.fields.map((field) => (
                  <div key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : ""}>
                    <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                    {field.type === "toggle" ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            [field.key]: settings[field.key as keyof typeof settings] === "true" ? "false" : "true",
                          })
                        }
                        className={`w-14 h-7 rounded-full relative transition-colors ${
                          settings[field.key as keyof typeof settings] === "true"
                            ? "bg-neon-green/30"
                            : "bg-dark-600"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-6 h-6 rounded-full transition-all ${
                            settings[field.key as keyof typeof settings] === "true"
                              ? "end-0.5 bg-neon-green"
                              : "start-0.5 bg-gray-500"
                          }`}
                        />
                      </button>
                    ) : field.type === "textarea" ? (
                      <textarea
                        className="gaming-input text-sm min-h-[60px] resize-y"
                        value={settings[field.key as keyof typeof settings] || ""}
                        onChange={(e) =>
                          setSettings({ ...settings, [field.key]: e.target.value })
                        }
                      />
                    ) : (
                      <input
                        type={field.type}
                        className="gaming-input text-sm"
                        value={settings[field.key as keyof typeof settings] || ""}
                        onChange={(e) =>
                          setSettings({ ...settings, [field.key]: e.target.value })
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}
