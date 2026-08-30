"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import AutoNewsButton from "@/components/admin/AutoNewsButton";


interface Honor {
  id: string;
  type: "winner" | "levelup" | "news" | string;
  title: string;
  description: string;
  time: string;
  prize?: string;
  username?: string;
  level?: number;
  highlight: boolean;
  status: "pending" | "approved" | "rejected";
  image?: string;
  summary?: string;
  createdAt?: string;
  publishedAt?: string | null;
  likesCount?: number;
  viewsCount?: number;
}

export default function AdminHonorsPage() {
  const [honors, setHonors] = useState<Honor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; details?: string } | null>(null);
  const [telegramDraft, setTelegramDraft] = useState("");

  const [newHonor, setNewHonor] = useState({
    type: "news" as const,
    title: "",
    description: "",
    prize: "",
    username: "",
    level: "",
    game: "",
    highlight: false,
    image: "",
    imageAlt: "",
    summary: "",
    seoKeywords: "",
    readTimeMinutes: "4",
    galleryImages: "",
    sourceTitle: "",
    sourceLink: "",
    sourceName: "",
  });

  const fetchHonors = async () => {
    try {
      const res = await fetch("/api/admin/honors", { cache: "no-store", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "دریافت محتوای تالار انجام نشد");
      setHonors(Array.isArray(data) ? data : []);
    } catch (error) {
      setHonors([]);
      setFeedback({ ok: false, text: error instanceof Error ? error.message : "دریافت محتوای تالار انجام نشد" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHonors();
  }, []);

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    try {
      const response = await fetch("/api/admin/honors", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ id, status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "تغییر وضعیت انجام نشد");
      setFeedback({ ok: true, text: status === "approved" ? "محتوا منتشر شد." : "محتوا رد شد." });
      await fetchHonors();
    } catch (error) {
      setFeedback({ ok: false, text: error instanceof Error ? error.message : "تغییر وضعیت انجام نشد" });
    }
  };

  const deleteHonor = async (id: string) => {
    if (!confirm("حذف شود؟")) return;
    try {
      const response = await fetch("/api/admin/honors", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "حذف انجام نشد");
      setFeedback({ ok: true, text: "محتوا حذف شد." });
      await fetchHonors();
    } catch (error) {
      setFeedback({ ok: false, text: error instanceof Error ? error.message : "حذف انجام نشد" });
    }
  };

  const generateAiDraft = async () => {
    if (newHonor.type === "news") {
      setFeedback({ ok: false, text: "برای جلوگیری از خبرسازی، تولید متن AI روی خبر دستی غیرفعال است. از «بررسی و ساخت خبر معتبر» استفاده کن یا ترجمه وفادار، لینک منبع و تصویر همان منبع را وارد کن." });
      return;
    }
    setAiDraftLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/honors/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(newHonor),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ساخت متن انجام نشد");
      setNewHonor((prev) => ({ ...prev, title: data.title || prev.title, description: data.description || prev.description }));
      setTelegramDraft(data.telegramPost || "");
      setFeedback({ ok: true, text: `متن پیشنهادی با موفقیت ساخته شد (${data.provider || "local"}). قبل از انتشار آن را بررسی کن.` });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : "ساخت متن انجام نشد" });
    } finally {
      setAiDraftLoading(false);
    }
  };


  const createHonor = async () => {
    if (!newHonor.title.trim() || !newHonor.description.trim()) {
      setFeedback({ ok: false, text: "عنوان و توضیحات برای ایجاد محتوا الزامی است." });
      return;
    }
    if (newHonor.type === "news" && !newHonor.game) {
      setFeedback({ ok: false, text: "برای انتشار خبر، ابتدا بازی را انتخاب کن." });
      return;
    }
    if (newHonor.type === "news" && (!newHonor.sourceLink.trim() || !newHonor.image.trim())) {
      setFeedback({ ok: false, text: "برای انتشار خبر، لینک منبع رسمی و تصویر اصلی همان ناشر الزامی است." });
      return;
    }
    setCreating(true);
    setFeedback(null);

    const payload = {
      ...newHonor,
      level: newHonor.level ? parseInt(newHonor.level) : undefined,
      time: "همین الان",
      status: "approved",
    };

    try {
      const response = await fetch("/api/admin/honors", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "ایجاد محتوا انجام نشد");

      setNewHonor({
        type: "news",
        title: "",
        description: "",
        prize: "",
        username: "",
        level: "",
        game: "",
        highlight: false,
        image: "",
        imageAlt: "",
        summary: "",
        seoKeywords: "",
        readTimeMinutes: "4",
        galleryImages: "",
        sourceTitle: "",
        sourceLink: "",
        sourceName: "",
      });
      setTelegramDraft("");
      setFeedback({ ok: true, text: `«${result.honor?.title || payload.title}» با موفقیت ایجاد و منتشر شد.` });
      await fetchHonors();
    } catch (error) {
      setFeedback({ ok: false, text: error instanceof Error ? error.message : "ایجاد محتوا انجام نشد" });
    } finally {
      setCreating(false);
    }
  };

  // شروع ویرایش
  const startEdit = (honor: Honor) => {
    setEditingId(honor.id);
    setEditData({ ...honor });
  };

  // ذخیره تغییرات
  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const response = await fetch("/api/admin/honors", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ id: editingId, ...editData }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "ذخیره تغییرات انجام نشد");
      setEditingId(null);
      setEditData({});
      setFeedback({ ok: true, text: "تغییرات محتوا ذخیره شد." });
      await fetchHonors();
    } catch (error) {
      setFeedback({ ok: false, text: error instanceof Error ? error.message : "ذخیره تغییرات انجام نشد" });
    }
  };

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black">مدیریت تالار افتخارات</h1>
            <p className="text-sm text-gray-400 mt-1">ایجاد، ویرایش، تأیید و حذف محتوا</p>
          </div>
          <div className="flex items-center gap-3">
            <AutoNewsButton
              onCreated={fetchHonors}
              showResult={false}
              onOutcome={(outcome) => setFeedback({ ok: outcome.ok, text: outcome.text, details: outcome.details })}
            />
            <Link href="/admin" className="text-sm text-purple-400">← بازگشت به پنل</Link>
          </div>
        </div>

        {feedback && (
          <div className={`mb-6 rounded-2xl border p-4 ${feedback.ok ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-amber-400/25 bg-amber-500/10 text-amber-100"}`}>
            <div className="text-sm font-black leading-7">{feedback.text}</div>
            {feedback.details && <div className="mt-1 text-[11px] text-white/55">{feedback.details}</div>}
          </div>
        )}

        {/* فرم ایجاد */}
        <div className="glass-panel p-4 sm:p-6 rounded-3xl mb-10 border border-white/10">
          <h3 className="font-black mb-5 text-lg">ایجاد محتوای جدید</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <select 
              value={newHonor.type} 
              onChange={(e) => setNewHonor({...newHonor, type: e.target.value as any})}
              className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm"
            >
              <option value="news">خبر</option>
              <option value="winner">قهرمان</option>
              <option value="levelup">لول‌آپ</option>
            </select>

            <input 
              placeholder="عنوان" 
              value={newHonor.title}
              onChange={(e) => setNewHonor({...newHonor, title: e.target.value})}
              className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm"
            />
          </div>

          <textarea 
            placeholder="توضیحات" 
            value={newHonor.description}
            onChange={(e) => setNewHonor({...newHonor, description: e.target.value})}
            className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm mb-4 h-24 resize-y"
          />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <input placeholder="نام کاربری" value={newHonor.username} onChange={(e) => setNewHonor({...newHonor, username: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
            <input placeholder="جایزه (اختیاری)" value={newHonor.prize} onChange={(e) => setNewHonor({...newHonor, prize: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
            <input placeholder="لول (اختیاری)" value={newHonor.level} onChange={(e) => setNewHonor({...newHonor, level: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
            <select value={newHonor.game} onChange={(e) => setNewHonor({...newHonor, game: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm">
              <option value="">همه بازی‌ها</option>
              <option value="clash_royale">کلش رویال</option>
              <option value="cod_mobile">کالاف موبایل</option>
              <option value="fortnite">فورتنایت</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <input 
              placeholder="لینک تصویر اصلی (URL)" 
              value={newHonor.image}
              onChange={(e) => setNewHonor({...newHonor, image: e.target.value})}
              className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm"
            />
            <input 
              placeholder="متن جایگزین تصویر / Alt" 
              value={newHonor.imageAlt}
              onChange={(e) => setNewHonor({...newHonor, imageAlt: e.target.value})}
              className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm"
            />
          </div>

          <textarea
            placeholder="خلاصه کوتاه خبر برای کارت‌ها و SEO"
            value={newHonor.summary}
            onChange={(e) => setNewHonor({...newHonor, summary: e.target.value})}
            className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm mb-4 min-h-20 resize-y"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <input placeholder="کلمات کلیدی SEO با کاما" value={newHonor.seoKeywords} onChange={(e) => setNewHonor({...newHonor, seoKeywords: e.target.value})} className="md:col-span-2 bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
            <input placeholder="زمان مطالعه" type="number" value={newHonor.readTimeMinutes} onChange={(e) => setNewHonor({...newHonor, readTimeMinutes: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
          </div>

          <textarea
            placeholder="گالری تصاویر؛ هر لینک در یک خط"
            value={newHonor.galleryImages}
            onChange={(e) => setNewHonor({...newHonor, galleryImages: e.target.value})}
            className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm mb-4 min-h-20 resize-y"
          />

          {newHonor.type === "news" && (
            <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-[11px] leading-6 text-amber-100">
              خبر دستی فقط با انتخاب بازی، ترجمه وفادار، لینک رسمی ناشر و تصویر رسمی همان ناشر منتشر می‌شود. Flexa متن خبری از خودش نمی‌سازد.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <input placeholder="عنوان منبع" value={newHonor.sourceTitle} onChange={(e) => setNewHonor({...newHonor, sourceTitle: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
            <input placeholder="لینک منبع / لینک خارجی" value={newHonor.sourceLink} onChange={(e) => setNewHonor({...newHonor, sourceLink: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
            <input placeholder="نام منبع مثل Activision" value={newHonor.sourceName} onChange={(e) => setNewHonor({...newHonor, sourceName: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 text-sm" />
          </div>

          <div className="flex items-center gap-3 mb-5">
            <label className="flex items-center gap-2 text-sm">
              <input 
                type="checkbox" 
                checked={newHonor.highlight} 
                onChange={(e) => setNewHonor({...newHonor, highlight: e.target.checked})} 
              />
              محتوای ویژه (Featured)
            </label>
          </div>

          {telegramDraft && (
            <div className="bg-black/25 border border-white/10 rounded-2xl p-4 mb-4">
              <div className="text-xs font-black text-cyan-300 mb-2">متن پیشنهادی تلگرام</div>
              <pre className="whitespace-pre-wrap text-[11px] leading-6 text-gray-300 font-sans">{telegramDraft}</pre>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={generateAiDraft}
              disabled={aiDraftLoading}
              className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 px-8 py-3 rounded-2xl text-sm font-black transition-all"
            >
              {aiDraftLoading ? "در حال ساخت..." : "✨ ساخت متن با AI"}
            </button>
            <button
              onClick={createHonor}
              disabled={creating}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-8 py-3 rounded-2xl text-sm font-black transition-all"
            >
              {creating ? "در حال ذخیره و انتشار..." : "ایجاد و انتشار محتوا"}
            </button>
          </div>
        </div>

        {/* لیست محتواها */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">در حال بارگذاری...</div>
          ) : honors.length === 0 ? (
            <div className="text-center py-12 text-gray-500">هنوز محتوایی ثبت نشده است.</div>
          ) : (
            honors.map((honor) => (
              <div key={honor.id} className="glass-panel p-6 rounded-3xl border border-white/10">
                {editingId === honor.id ? (
                  // فرم ویرایش
                  <div className="space-y-4">
                    <input 
                      value={editData.title} 
                      onChange={(e) => setEditData({...editData, title: e.target.value})}
                      className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3"
                    />
                    <textarea 
                      value={editData.description} 
                      onChange={(e) => setEditData({...editData, description: e.target.value})}
                      className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 h-24"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input 
                        placeholder="لینک تصویر" 
                        value={editData.image || ""} 
                        onChange={(e) => setEditData({...editData, image: e.target.value})}
                        className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3"
                      />
                      <input 
                        placeholder="Alt تصویر" 
                        value={editData.imageAlt || ""} 
                        onChange={(e) => setEditData({...editData, imageAlt: e.target.value})}
                        className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3"
                      />
                    </div>
                    <textarea placeholder="خلاصه SEO" value={editData.summary || ""} onChange={(e) => setEditData({...editData, summary: e.target.value})} className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 h-20" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input placeholder="کلمات کلیدی" value={Array.isArray(editData.seoKeywords) ? editData.seoKeywords.join(", ") : editData.seoKeywords || ""} onChange={(e) => setEditData({...editData, seoKeywords: e.target.value})} className="md:col-span-2 bg-[#111114] border border-white/10 rounded-2xl px-4 py-3" />
                      <input placeholder="زمان مطالعه" type="number" value={editData.readTimeMinutes || ""} onChange={(e) => setEditData({...editData, readTimeMinutes: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3" />
                    </div>
                    <textarea placeholder="گالری تصاویر؛ هر لینک در یک خط" value={Array.isArray(editData.galleryImages) ? editData.galleryImages.map((x: any) => x.src || x.url || x).join("\n") : editData.galleryImages || ""} onChange={(e) => setEditData({...editData, galleryImages: e.target.value})} className="w-full bg-[#111114] border border-white/10 rounded-2xl px-4 py-3 h-20" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input placeholder="عنوان منبع" value={editData.sourceTitle || editData.sources?.[0]?.title || ""} onChange={(e) => setEditData({...editData, sourceTitle: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3" />
                      <input placeholder="لینک منبع" value={editData.sourceLink || editData.sources?.[0]?.link || ""} onChange={(e) => setEditData({...editData, sourceLink: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3" />
                      <input placeholder="نام منبع" value={editData.sourceName || editData.sources?.[0]?.source || ""} onChange={(e) => setEditData({...editData, sourceName: e.target.value})} className="bg-[#111114] border border-white/10 rounded-2xl px-4 py-3" />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button onClick={saveEdit} className="bg-green-600 px-6 py-2 rounded-xl text-sm">ذخیره</button>
                      <button onClick={() => setEditingId(null)} className="bg-gray-600 px-6 py-2 rounded-xl text-sm">انصراف</button>
                    </div>
                  </div>
                ) : (
                  // نمایش عادی
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-5">
                    <div className="flex-1">
                      <div className="font-black text-xl mb-1.5">{honor.title}</div>
                      <p className="text-sm text-white/80 mb-2 leading-relaxed line-clamp-3">{honor.description}</p>
                      {honor.summary && <p className="text-xs text-cyan-200 mb-4 leading-6">خلاصه: {honor.summary}</p>}
                      
                      <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                        {honor.username && <span>@{honor.username}</span>}
                        {honor.level && <span>سطح {honor.level}</span>}
                        {honor.prize && <span className="text-yellow-400">{honor.prize}</span>}
                        <span>{honor.time || (honor.publishedAt || honor.createdAt ? new Date(honor.publishedAt || honor.createdAt!).toLocaleString("fa-IR") : "—")}</span>
                        <span className="text-pink-300">لایک: {(honor.likesCount || 0).toLocaleString("fa-IR")}</span>
                        <span className="text-cyan-300">سین/بازدید: {(honor.viewsCount || 0).toLocaleString("fa-IR")}</span>
                      </div>
                    </div>

                    <div className="flex flex-row sm:flex-col flex-wrap items-start sm:items-end gap-2 sm:min-w-[150px]">
                      <div className={`text-xs px-3 py-1 rounded-full border text-center ${
                        honor.status === "approved" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                        honor.status === "rejected" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                        "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                      }`}>
                        {honor.status === "approved" ? "منتشر شده" : honor.status === "rejected" ? "رد شده" : "در انتظار تأیید"}
                      </div>

                      {honor.status === "pending" && (
                        <div className="flex gap-2">
                          <button onClick={() => updateStatus(honor.id, "approved")} className="text-xs px-4 py-2 bg-green-600 rounded-xl hover:bg-green-700">تأیید</button>
                          <button onClick={() => updateStatus(honor.id, "rejected")} className="text-xs px-4 py-2 bg-red-600 rounded-xl hover:bg-red-700">رد</button>
                        </div>
                      )}

                      <div className="flex gap-2 mt-2">
                        <button onClick={() => startEdit(honor)} className="text-xs px-4 py-1.5 bg-blue-600 rounded-xl">ویرایش</button>
                        <button onClick={() => deleteHonor(honor.id)} className="text-xs px-4 py-1.5 bg-red-600 rounded-xl">حذف</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
