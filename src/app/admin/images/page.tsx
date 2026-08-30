"use client";

/* Admin image manager previews arbitrary remote URLs, so a plain <img> is
 * intentional here (next/image domain allow-listing isn't a fit). */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface SiteImage {
  id: string;
  slug: string;
  title: string;
  url: string;
  altText: string | null;
  category: string;
  sortOrder: number;
  isActive: boolean;
}

const CATEGORIES = [
  { value: "hero", label: { fa: "هیرو / بنر اصلی", en: "Hero / Main Banner" } },
  { value: "background", label: { fa: "پس‌زمینه اپ", en: "App Background" } },
  { value: "icon", label: { fa: "آیکون‌ها", en: "Icons" } },
  { value: "clash_royale", label: { fa: "کارت بازی کلش رویال", en: "Clash Royale Card" } },
  { value: "cod_mobile", label: { fa: "کارت بازی کالاف موبایل", en: "COD Mobile Card" } },
  { value: "fortnite", label: { fa: "کارت بازی فورتنایت", en: "Fortnite Card" } },
  { value: "tournament", label: { fa: "تورنومنت", en: "Tournament" } },
  { value: "general", label: { fa: "عمومی", en: "General" } },
];

const COMMON_SLUGS = [
  // --- Global & Core ---
  { value: "home-hero", label: { fa: "بنر اصلی صفحه اول", en: "Homepage Hero" } },
  { value: "app-global-bg", label: { fa: "پس‌زمینه کلی اپلیکیشن", en: "App Global Background" } },
  { value: "logo-main", label: { fa: "لوگوی اصلی", en: "Main Logo" } },
  
  // --- Authentication ---
  { value: "login-bg", label: { fa: "پس‌زمینه صفحه ورود", en: "Login Background" } },
  { value: "register-bg", label: { fa: "پس‌زمینه صفحه ثبت‌نام", en: "Register Background" } },
  
  // --- User & Profile ---
  { value: "profile-bg", label: { fa: "پس‌زمینه پروفایل", en: "Profile Background" } },
  { value: "profile-banner", label: { fa: "بنر بالای پروفایل", en: "Profile Top Banner" } },
  { value: "wallet-bg", label: { fa: "پس‌زمینه کیف پول", en: "Wallet Background" } },
  
  // --- Gameplay & Tournaments ---
  { value: "tournaments-bg", label: { fa: "پس‌زمینه لیست تورنومنت‌ها", en: "Tournaments Background" } },
  { value: "tournament-detail-bg", label: { fa: "پس‌زمینه جزئیات تورنومنت", en: "Tournament Detail Background" } },
  { value: "leaderboard-bg", label: { fa: "پس‌زمینه لیدربورد", en: "Leaderboard Background" } },
  { value: "match-result-bg", label: { fa: "پس‌زمینه نتیجه مسابقه", en: "Match Result Background" } },
  
  // --- Support & Info ---
  { value: "faq-bg", label: { fa: "پس‌زمینه سوالات متداول", en: "FAQ Background" } },
  { value: "support-bg", label: { fa: "پس‌زمینه پشتیبانی", en: "Support Background" } },
  { value: "rules-bg", label: { fa: "پس‌زمینه قوانین", en: "Rules Background" } },
  { value: "about-bg", label: { fa: "پس‌زمینه درباره ما", en: "About Background" } },
  
  // --- Admin Panel ---
  { value: "admin-dashboard-bg", label: { fa: "پس‌زمینه داشبورد ادمین", en: "Admin Dashboard Background" } },
  { value: "admin-users-bg", label: { fa: "پس‌زمینه مدیریت کاربران", en: "Admin Users Background" } },
  
  // --- UI Elements (Icons/Decorative) ---
  { value: "icon-home", label: { fa: "آیکون خانه", en: "Home Icon" } },
  { value: "icon-wallet", label: { fa: "آیکون کیف پول", en: "Wallet Icon" } },
  { value: "icon-profile", label: { fa: "آیکون پروفایل", en: "Profile Icon" } },
  { value: "icon-tournament", label: { fa: "آیکون تورنومنت", en: "Tournament Icon" } },
  { value: "icon-notifications", label: { fa: "آیکون اعلان‌ها", en: "Notifications Icon" } },
  { value: "icon-settings", label: { fa: "آیکون تنظیمات", en: "Settings Icon" } },
  
  // --- Game Specific Slots ---
  { value: "bg-codm", label: { fa: "پس‌زمینه اختصاصی کالاف", en: "COD Mobile Specific BG" } },
  { value: "bg-fortnite", label: { fa: "پس‌زمینه اختصاصی فورتنایت", en: "Fortnite Specific BG" } },
  { value: "bg-clash", label: { fa: "پس‌زمینه اختصاصی کلش", en: "Clash Royale Specific BG" } },
  
  { value: "custom", label: { fa: "سایر (تایپ دستی)", en: "Custom (Manual Type)" } },
];

export default function AdminImagesPage() {
  const { lang } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [images, setImages] = useState<SiteImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [form, setForm] = useState({
    slug: "",
    title: "",
    url: "",
    altText: "",
    category: "general",
    sortOrder: 0,
  });

  const fetchImages = useCallback(async () => {
    setLoadingImages(true);
    try {
      const res = await fetch("/api/admin/images");
      const data = await res.json();
      setImages(Array.isArray(data) ? data : []);
    } catch { setImages([]); }
    setLoadingImages(false);
  }, []);

  useEffect(() => {
    if (!loading && (!user || (user.role !== "admin" && user.role !== "super_admin"))) router.push("/");
  }, [loading, user, router]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  function startEdit(img: SiteImage) {
    setEditingId(img.id);
    setForm({
      slug: img.slug,
      title: img.title,
      url: img.url,
      altText: img.altText || "",
      category: img.category,
      sortOrder: img.sortOrder,
    });
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setForm({ slug: "", title: "", url: "", altText: "", category: "general", sortOrder: 0 });
    setShowForm(true);
  }

  async function handleFileUpload(file: File | null) {
    setUploadError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("فقط فایل تصویر مجاز است.");
      return;
    }

    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("folder", "flexa-admin");
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        body: uploadForm,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "آپلود انجام نشد");
      setForm((prev) => ({ ...prev, url: data.url }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "آپلود انجام نشد");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingId) {
        await fetch("/api/admin/images", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({ id: editingId, ...form }),
        });
      } else {
        await fetch("/api/admin/images", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify(form),
        });
      }
      setShowForm(false);
      setEditingId(null);
      fetchImages();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm(lang === "fa" ? "آیا مطمئنید؟" : "Are you sure?")) return;
    try {
      await fetch("/api/admin/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ id }),
      });
      fetchImages();
    } catch { /* ignore */ }
  }

  async function toggleActive(img: SiteImage) {
    try {
      await fetch("/api/admin/images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ id: img.id, isActive: !img.isActive }),
      });
      fetchImages();
    } catch { /* ignore */ }
  }

  if (loading || !user || (user.role !== "admin" && user.role !== "super_admin")) return null;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white">←</button>
            <h1 className="text-2xl font-bold">
              🖼️ <span className="neon-text-purple">{lang === "fa" ? "مدیریت تصاویر" : "Image Manager"}</span>
            </h1>
          </div>
          <button onClick={startNew} className="gaming-btn text-sm">
            + {lang === "fa" ? "تصویر جدید" : "New Image"}
          </button>
        </div>

        {/* Helper */}
        <div className="gaming-card p-4 mb-6 border-neon-blue/30">
          <p className="text-sm text-gray-400">
            💡 {lang === "fa"
              ? "برای کنترل کامل ظاهر، تصویر را آپلود و لینک مستقیم را وارد کنید. دسته‌بندی hero برای بنر اصلی، background برای پس‌زمینه، icon برای آیکون‌ها و دسته هر بازی برای تصویر کارت همان بازی استفاده می‌شود. اسلاگ‌های پیشنهادی: home-hero، app-background، icon-home، icon-chat، icon-profile."
              : "Upload images and paste direct URLs. Use hero for main banner, background for app background, icon for icons, and each game category for game-card images."}
          </p>
        </div>

        {/* Form */}
        {showForm && (
          <div className="gaming-card p-4 sm:p-6 mb-6 animate-slide-up">
            <h3 className="text-lg font-bold mb-4 neon-text-blue">
              {editingId
                ? lang === "fa" ? "ویرایش تصویر" : "Edit Image"
                : lang === "fa" ? "تصویر جدید" : "New Image"}
            </h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {lang === "fa" ? "شناسه (انگلیسی)" : "Slug"} *
                </label>
                <div className="flex flex-col gap-2">
                  <select
                    className="gaming-select text-sm"
                    value={form.slug === "custom" ? "" : form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  >
                    <option value="" disabled>{lang === "fa" ? "انتخاب کنید..." : "Select..."}</option>
                    {COMMON_SLUGS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {lang === "fa" ? s.label.fa : s.label.en}
                      </option>
                    ))}
                  </select>
                  {form.slug === "custom" || (form.slug && !COMMON_SLUGS.some(s => s.value === form.slug)) ? (
                    <input
                      type="text"
                      required
                      className="gaming-input text-sm"
                      placeholder="hero-banner"
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value.replace(/\s/g, "-").toLowerCase() })}
                    />
                  ) : null}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {lang === "fa" ? "عنوان" : "Title"} *
                </label>
                <input
                  type="text"
                  required
                  className="gaming-input text-sm"
                  placeholder={lang === "fa" ? "بنر صفحه اصلی" : "Homepage banner"}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  {lang === "fa" ? "لینک تصویر" : "Image URL"} *
                </label>
                <input
                  type="text"
                  required
                  className="gaming-input text-sm"
                  placeholder="https://i.ibb.co/xxxxx/image.jpg یا انتخاب فایل از پایین"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                />
                <div className="mt-3 flex flex-col sm:flex-row gap-3 sm:items-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e.target.files?.[0] || null)}
                    className="text-xs text-gray-400 file:me-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-purple-600 file:text-white file:font-bold"
                  />
                  <span className="text-[11px] text-gray-500">اگر Cloudinary تنظیم باشد تصویر واقعی آپلود می‌شود؛ در غیر این صورت تصاویر سبک مستقیم در دیتابیس ذخیره می‌شوند.</span>
                </div>
                {uploadError && <p className="text-red-400 text-xs mt-2">{uploadError}</p>}
              </div>
              {form.url && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-gray-500 mb-1">{lang === "fa" ? "پیش‌نمایش:" : "Preview:"}</p>
                  <img src={form.url} alt="Preview" className="w-full max-h-48 rounded-lg object-cover border border-gaming-border" loading="lazy" decoding="async" />
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {lang === "fa" ? "متن جایگزین" : "Alt Text"}
                </label>
                <input
                  type="text"
                  className="gaming-input text-sm"
                  value={form.altText}
                  onChange={(e) => setForm({ ...form, altText: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {lang === "fa" ? "دسته‌بندی" : "Category"}
                </label>
                <select
                  className="gaming-select text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {lang === "fa" ? c.label.fa : c.label.en}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {lang === "fa" ? "ترتیب نمایش" : "Sort Order"}
                </label>
                <input
                  type="number"
                  className="gaming-input text-sm"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="sm:col-span-2 flex flex-col sm:flex-row gap-3">
                <button type="submit" disabled={saving} className="gaming-btn text-sm disabled:opacity-50">
                  {saving
                    ? lang === "fa" ? "در حال ذخیره..." : "Saving..."
                    : lang === "fa" ? "💾 ذخیره" : "💾 Save"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingId(null); }}
                  className="px-4 py-2 rounded-lg text-gray-500 hover:text-white transition-colors"
                >
                  {lang === "fa" ? "انصراف" : "Cancel"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Images List */}
        {loadingImages ? (
          <div className="text-center py-16">
            <div className="text-4xl animate-neon-pulse mb-4">🖼️</div>
            <p className="text-gray-400">{lang === "fa" ? "در حال بارگذاری..." : "Loading..."}</p>
          </div>
        ) : images.length === 0 ? (
          <div className="gaming-card p-12 text-center">
            <div className="text-5xl mb-4">🖼️</div>
            <h3 className="text-xl font-bold mb-2">{lang === "fa" ? "هنوز تصویری نیست" : "No images yet"}</h3>
            <p className="text-gray-400 mb-4">{lang === "fa" ? "اولین تصویر را اضافه کنید" : "Add your first image"}</p>
            <button onClick={startNew} className="gaming-btn text-sm">
              + {lang === "fa" ? "تصویر جدید" : "New Image"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {images.map((img) => (
              <div key={img.id} className={`gaming-card overflow-hidden ${!img.isActive ? "opacity-50" : ""}`}>
                {/* Image Preview */}
                <div className="h-40 bg-dark-700 relative">
                  <img src={img.url} alt={img.altText || img.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  <div className="absolute top-2 start-2 flex gap-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-dark-800/80 text-neon-purple font-bold">
                      {CATEGORIES.find((c) => c.value === img.category)?.label[lang === "fa" ? "fa" : "en"] || img.category}
                    </span>
                  </div>
                  {!img.isActive && (
                    <div className="absolute top-2 end-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/80 text-red-400">
                        {lang === "fa" ? "غیرفعال" : "Inactive"}
                      </span>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="p-4">
                  <h3 className="font-bold text-sm mb-1">{img.title}</h3>
                  <p className="text-xs text-gray-500 font-mono mb-3">{img.slug}</p>
                  {/* Actions */}
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(img)} className="text-xs px-3 py-1.5 rounded-lg bg-dark-600 text-neon-blue hover:bg-dark-500 transition-colors">
                      ✏️ {lang === "fa" ? "ویرایش" : "Edit"}
                    </button>
                    <button onClick={() => toggleActive(img)} className="text-xs px-3 py-1.5 rounded-lg bg-dark-600 text-neon-yellow hover:bg-dark-500 transition-colors">
                      {img.isActive ? "🔴" : "🟢"} {img.isActive ? (lang === "fa" ? "غیرفعال" : "Disable") : (lang === "fa" ? "فعال" : "Enable")}
                    </button>
                    <button onClick={() => handleDelete(img.id)} className="text-xs px-3 py-1.5 rounded-lg bg-dark-600 text-neon-pink hover:bg-dark-500 transition-colors">
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
