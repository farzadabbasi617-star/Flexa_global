/**
 * Turns an /api/admin/honors/auto-news response into the message an operator
 * reads.
 *
 * Kept pure and shared so the honors page and the settings page cannot drift
 * into explaining the same outcome differently, and so the wording — which is
 * the only feedback an admin gets after pressing the button — is testable.
 */
const REASON_LABELS: Record<string, string> = {
  no_recent_complete_sources: "در بازه زمانی تعیین‌شده خبر کامل و معتبری همراه تصویر رسمی پیدا نشد.",
  no_new_trusted_sources: "همه خبرهای معتبر فعلی قبلاً منتشر شده‌اند؛ خبر تکراری ساخته نشد.",
  ai_provider_not_configured: "سرویس ترجمه هوش مصنوعی تنظیم نشده است.",
  ai_provider_unavailable: "سرویس ترجمه هوش مصنوعی موقتاً پاسخ نداد.",
  all_source_translations_rejected: "منبع پیدا شد اما ترجمه‌ها کنترل کیفیت فارسی را پاس نکردند.",
  source_translation_rejected: "ترجمه وفادار به منبع نبود و برای جلوگیری از خبرسازی رد شد.",
  persian_quality_rejected: "کیفیت متن فارسی کافی نبود و خبر منتشر نشد.",
  missing_trusted_source_image: "تصویر رسمی همان منبع پیدا نشد.",
};

export function autoNewsReasonLabel(value: unknown) {
  const key = String(value || "");
  return REASON_LABELS[key] || key || "منبع تازه‌ای برای انتشار وجود ندارد.";
}

export interface AutoNewsOutcome {
  ok: boolean;
  /** True when at least one honor was actually created. */
  created: boolean;
  text: string;
  details: string;
  titles: string[];
}

interface AutoNewsResponse {
  generated?: boolean;
  generatedCount?: number;
  reason?: unknown;
  items?: Array<{ generated?: boolean; title?: string }>;
  diagnostics?: { discovered?: number; recent?: number; accepted?: number };
}

export function describeAutoNewsResult(payload: unknown): AutoNewsOutcome {
  const data = (payload && typeof payload === "object" ? payload : {}) as AutoNewsResponse;
  const diagnostics = data.diagnostics || {};
  const details = [
    `کشف‌شده: ${Number(diagnostics.discovered || 0).toLocaleString("fa-IR")}`,
    `تازه: ${Number(diagnostics.recent || 0).toLocaleString("fa-IR")}`,
    `کامل و قابل‌اعتماد: ${Number(diagnostics.accepted || 0).toLocaleString("fa-IR")}`,
  ].join(" · ");

  if (!data.generated) {
    // Nothing published is a normal outcome, not a failure: it usually means
    // every trusted source has already been covered.
    return { ok: false, created: false, text: autoNewsReasonLabel(data.reason), details, titles: [] };
  }

  const titles = Array.isArray(data.items)
    ? data.items.filter((item) => item?.generated).map((item) => String(item?.title || "").trim()).filter(Boolean)
    : [];
  const count = Number(data.generatedCount || titles.length || 1);
  const suffix = titles.length ? `: ${titles.join("، ")}` : "";

  return {
    ok: true,
    created: true,
    text: `${count.toLocaleString("fa-IR")} خبر معتبر ساخته و منتشر شد${suffix}`,
    details,
    titles,
  };
}
