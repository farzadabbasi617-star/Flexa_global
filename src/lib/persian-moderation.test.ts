import { describe, expect, it } from "vitest";
import {
  detectPersianProfanity,
  normalizePersianForModeration,
} from "@/lib/persian-moderation";

describe("Persian moderation", () => {
  it("normalizes Arabic characters, zero-width characters and diacritics", () => {
    expect(normalizePersianForModeration("بِي‌ شُعور كَثيف")).toBe("بی شعور کثیف");
  });

  it("detects a high-confidence Persian insult", () => {
    const result = detectPersianProfanity("تو خیلی احمق هستی");
    expect(result.detected).toBe(true);
    expect(result.matches).toContain("احمق");
  });

  it("detects multi-word insults after normalization", () => {
    const result = detectPersianProfanity("واقعاً بی‌شعور هستی");
    expect(result.detected).toBe(true);
    expect(result.matches).toContain("بی شعور");
  });

  it("does not block identity or ordinary contextual phrases", () => {
    expect(detectPersianProfanity("من فارس هستم").detected).toBe(false);
    expect(detectPersianProfanity("دوست دختر من در مسابقه شرکت کرد").detected).toBe(false);
    expect(detectPersianProfanity("برای ثبت نام باید این کار را کردن اشتباه است").detected).toBe(false);
  });

  it("does not flag normal tournament chat", () => {
    expect(detectPersianProfanity("بازی خوبی بود، موفق باشی قهرمان").detected).toBe(false);
  });
});
