"use client";

import { useState } from "react";

interface NewsDraft {
  id: string;
  game: string;
  title: string;
  summary: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  icon: string;
  seoKeywords: string[];
  readTimeMinutes: number;
  sourceName: string;
  sourceLink: string;
  sourceKey: string;
  publishPayload: Record<string, unknown>;
}

const GAME_LABEL: Record<string, string> = {
  cod_mobile: "کالاف دیوتی موبایل",
  fortnite: "فورتنایت",
  clash_royale: "کلش رویال",
};

const REASON_LABEL: Record<string, string> = {
  no_recent_complete_sources: "در بازه زمانی تعیین‌شده خبر کامل و معتبری همراه تصویر رسمی پیدا نشد.",
  no_new_trusted_sources: "همه خبرهای معتبر فعلی قبلاً منتشر شده‌اند.",
  ai_provider_not_configured: "سرویس ترجمه هوش مصنوعی تنظیم نشده است.",
  ai_provider_unavailable: "سرویس ترجمه هوش مصنوعی موقتاً پاسخ نداد.",
  all_source_translations_rejected: "منبع پیدا شد اما ترجمه‌ها کنترل کیفیت فارسی را پاس نکردند.",
  source_translation_rejected: "ترجمه وفادار به منبع نبود و رد شد.",
  persian_quality_rejected: "کیفیت متن فارسی کافی نبود.",
  missing_trusted_source_image: "تصویر رسمی همان منبع پیدا نشد.",
};

/**
 * Search → read → approve, for gaming news.
 *
 * The existing sweep publishes as soon as it finds something, which gives the
 * operator no chance to read a machine translation before it appears on the
 * site. Here drafts are held in component state only: closing the page discards
 * them and the same sources will be found again next search, so an abandoned
 * review leaves nothing behind.
 */
export default function NewsReviewPanel() {
  const [drafts, setDrafts] = useState<NewsDraft[]>([]);
  const [searching, setSearching] = useState(false);
  const [publishing, setPublishing] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function search() {
    setSearching(true);
    setNotice(null);
    setDrafts([]);
    try {
      const response = await fetch("/api/admin/honors/news-review?limit=6", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.details || data.error || "جستجو انجام نشد");

      const found: NewsDraft[] = Array.isArray(data.drafts) ? data.drafts : [];
      setDrafts(found);
      setExpanded(found[0]?.id ?? null);

      const d = data.diagnostics || {};
      setDiagnostics(
        `کشف‌شده: ${Number(d.discovered || 0).toLocaleString("fa-IR")} · ` +
        `تازه: ${Number(d.recent || 0).toLocaleString("fa-IR")} · ` +
        `قابل‌اعتماد: ${Number(d.accepted || 0).toLocaleString("fa-IR")}`,
      );

      if (!found.length) {
        setNotice({ ok: false, text: REASON_LABEL[String(data.reason)] || "خبر تازه‌ای پیدا نشد." });
      }
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : "جستجو انجام نشد" });
    } finally {
      setSearching(false);
    }
  }

  async function publish(draft: NewsDraft) {
    setPublishing(draft.id);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/honors/news-review", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ sourceKey: draft.sourceKey, publishPayload: draft.publishPayload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "انتشار انجام نشد");
      // Drop the published draft so the list only ever shows pending work.
      setDrafts((current) => current.filter((item) => item.id !== draft.id));
      setNotice({ ok: true, text: `منتشر شد: ${draft.title}` });
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : "انتشار انجام نشد" });
    } finally {
      setPublishing("");
    }
  }

  function discard(id: string) {
    setDrafts((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-5">
      <div className="gaming-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-black text-emerald-300">📰 جستجوی خبر گیمینگ</h2>
            <p className="mt-1 text-xs leading-6 text-gray-400">
              منابع رسمی کالاف دیوتی موبایل، فورتنایت و کلش رویال از سراسر جهان بررسی می‌شوند.
              خبرها اینجا ترجمه و نمایش داده می‌شوند و <b>تا وقتی تأیید نکنی منتشر نمی‌شوند</b>.
            </p>
          </div>
          <button
            type="button"
            onClick={search}
            disabled={searching}
            className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {searching ? "در حال جستجو..." : "🔍 جستجوی خبر جدید"}
          </button>
        </div>
        {diagnostics && <div className="mt-3 text-[10px] text-gray-500">{diagnostics}</div>}
        {notice && (
          <div
            role="status"
            className={`mt-3 rounded-xl border p-3 text-xs font-black ${
              notice.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-amber-500/30 bg-amber-500/10 text-amber-200"
            }`}
          >
            {notice.text}
          </div>
        )}
      </div>

      {searching && (
        <div className="gaming-card p-10 text-center text-sm text-gray-500">
          در حال بررسی منابع رسمی و ترجمه...
        </div>
      )}

      {drafts.map((draft) => {
        const open = expanded === draft.id;
        return (
          <article key={draft.id} className="gaming-card overflow-hidden">
            {draft.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.imageUrl} alt={draft.imageAlt} width={800} height={280}
                   className="h-40 w-full object-cover" loading="lazy" />
            )}
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                <span className="rounded-full bg-purple-500/15 px-3 py-1 font-black text-purple-200">
                  {draft.icon} {GAME_LABEL[draft.game] || draft.game}
                </span>
                {draft.readTimeMinutes > 0 && (
                  <span className="rounded-full bg-white/5 px-3 py-1 text-gray-400">
                    {draft.readTimeMinutes.toLocaleString("fa-IR")} دقیقه مطالعه
                  </span>
                )}
                <a href={draft.sourceLink} target="_blank" rel="noopener noreferrer"
                   className="rounded-full bg-white/5 px-3 py-1 text-cyan-300 hover:bg-white/10">
                  منبع: {draft.sourceName} ↗
                </a>
              </div>

              <h3 className="mt-3 text-lg font-black leading-7">{draft.title}</h3>
              {draft.summary && <p className="mt-2 text-xs leading-6 text-gray-400">{draft.summary}</p>}

              <button
                type="button"
                onClick={() => setExpanded(open ? null : draft.id)}
                aria-expanded={open}
                className="mt-3 text-[11px] font-black text-cyan-300 hover:text-cyan-200"
              >
                {open ? "▲ بستن متن کامل" : "▼ خواندن متن کامل"}
              </button>

              {open && (
                <div className="mt-3 max-h-80 overflow-y-auto whitespace-pre-line rounded-xl bg-black/25 p-4 text-xs leading-7 text-gray-300">
                  {draft.description}
                </div>
              )}

              {draft.seoKeywords.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {draft.seoKeywords.map((keyword) => (
                    <span key={keyword} className="rounded-lg bg-white/5 px-2 py-1 text-[9px] text-gray-500">
                      {keyword}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => publish(draft)}
                  disabled={publishing === draft.id}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {publishing === draft.id ? "در حال انتشار..." : "✅ تأیید و انتشار"}
                </button>
                <button
                  type="button"
                  onClick={() => discard(draft.id)}
                  className="rounded-xl border border-white/10 px-5 py-2.5 text-xs font-black text-gray-400 hover:border-red-500/30 hover:text-red-300"
                >
                  رد کردن
                </button>
              </div>
            </div>
          </article>
        );
      })}

      {!searching && drafts.length === 0 && !notice && (
        <div className="gaming-card p-10 text-center text-sm text-gray-500">
          برای دیدن خبرهای تازه، دکمه «جستجوی خبر جدید» را بزن.
        </div>
      )}
    </div>
  );
}
