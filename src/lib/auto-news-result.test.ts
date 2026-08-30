import { describe, expect, it } from "vitest";
import { autoNewsReasonLabel, describeAutoNewsResult } from "./auto-news-result";

describe("when the sweep publishes something", () => {
  it("reports the count and names the stories", () => {
    const outcome = describeAutoNewsResult({
      generated: true,
      generatedCount: 2,
      items: [
        { generated: true, title: "عنوان یک" },
        { generated: true, title: "عنوان دو" },
      ],
      diagnostics: { discovered: 30, recent: 8, accepted: 2 },
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.created).toBe(true);
    expect(outcome.titles).toEqual(["عنوان یک", "عنوان دو"]);
    expect(outcome.text).toContain("۲ خبر معتبر ساخته و منتشر شد");
    expect(outcome.text).toContain("عنوان یک، عنوان دو");
  });

  it("ignores items the run skipped", () => {
    const outcome = describeAutoNewsResult({
      generated: true,
      generatedCount: 1,
      items: [
        { generated: false, title: "رد شده" },
        { generated: true, title: "منتشر شده" },
      ],
    });
    expect(outcome.titles).toEqual(["منتشر شده"]);
    expect(outcome.text).not.toContain("رد شده");
  });

  it("still reads sensibly when titles are missing", () => {
    const outcome = describeAutoNewsResult({ generated: true, generatedCount: 1, items: [] });
    expect(outcome.created).toBe(true);
    expect(outcome.text).toBe("۱ خبر معتبر ساخته و منتشر شد");
  });

  it("falls back to counting the items when no count is given", () => {
    const outcome = describeAutoNewsResult({
      generated: true,
      items: [{ generated: true, title: "الف" }, { generated: true, title: "ب" }],
    });
    expect(outcome.text).toContain("۲ خبر");
  });
});

describe("when the sweep publishes nothing", () => {
  it("is not treated as an error", () => {
    // Finding nothing new is the normal outcome once sources are covered.
    const outcome = describeAutoNewsResult({ generated: false, reason: "no_new_trusted_sources" });
    expect(outcome.created).toBe(false);
    expect(outcome.text).toContain("قبلاً منتشر شده");
  });

  it("explains each known reason in Persian rather than echoing a code", () => {
    for (const reason of [
      "no_recent_complete_sources",
      "ai_provider_not_configured",
      "ai_provider_unavailable",
      "all_source_translations_rejected",
      "source_translation_rejected",
      "persian_quality_rejected",
      "missing_trusted_source_image",
    ]) {
      const label = autoNewsReasonLabel(reason);
      expect(label).not.toBe(reason);
      expect(label.length).toBeGreaterThan(10);
    }
  });

  it("shows an unknown reason instead of swallowing it", () => {
    // A new server-side reason must still surface, not vanish behind a default.
    expect(autoNewsReasonLabel("brand_new_reason")).toBe("brand_new_reason");
  });

  it("has a sensible default when no reason is supplied", () => {
    expect(autoNewsReasonLabel(undefined)).toContain("منبع تازه‌ای");
    expect(autoNewsReasonLabel("")).toContain("منبع تازه‌ای");
  });
});

describe("diagnostics line", () => {
  it("always reports the funnel so a quiet run is explainable", () => {
    const outcome = describeAutoNewsResult({
      generated: false,
      reason: "no_new_trusted_sources",
      diagnostics: { discovered: 41, recent: 12, accepted: 0 },
    });
    expect(outcome.details).toBe("کشف‌شده: ۴۱ · تازه: ۱۲ · کامل و قابل‌اعتماد: ۰");
  });

  it("renders zeros when diagnostics are absent", () => {
    expect(describeAutoNewsResult({ generated: false }).details)
      .toBe("کشف‌شده: ۰ · تازه: ۰ · کامل و قابل‌اعتماد: ۰");
  });
});

describe("malformed responses", () => {
  it("does not throw on junk", () => {
    for (const payload of [null, undefined, "nonsense", 42, []]) {
      expect(() => describeAutoNewsResult(payload)).not.toThrow();
      expect(describeAutoNewsResult(payload).created).toBe(false);
    }
  });
});
