import { describe, expect, it } from "vitest";
import {
  getBuyPage,
  getNewsPage,
  getTournamentPage,
  pseoBuyPages,
  pseoNewsPages,
  pseoTournamentPages,
  pseoLinksForGame,
} from "./pseo-content";

// سلامت محتوای صفحات Programmatic SEO — چون صفحات، sitemap و اسکیما به این داده وابسته‌اند.
describe("pseo content integrity", () => {
  const all = [...pseoBuyPages, ...pseoTournamentPages, ...pseoNewsPages];

  it("هر صفحه فیلدهای ضروری کامل دارد", () => {
    for (const page of all) {
      expect(page.slug, `${page.slug}: slug`).toBeTruthy();
      expect(page.metaTitle.length, `${page.slug}: metaTitle`).toBeGreaterThan(10);
      expect(page.metaTitle.length, `${page.slug}: metaTitle خیلی بلند`).toBeLessThanOrEqual(75);
      expect(page.metaDescription.length, `${page.slug}: metaDescription`).toBeGreaterThan(70);
      expect(page.metaDescription.length, `${page.slug}: metaDescription خیلی بلند`).toBeLessThanOrEqual(180);
      expect(page.h1, `${page.slug}: h1`).toBeTruthy();
      expect(page.intro.length, `${page.slug}: intro`).toBeGreaterThanOrEqual(2);
      expect(page.sections.length, `${page.slug}: sections`).toBeGreaterThanOrEqual(3);
      expect(page.faqs.length, `${page.slug}: faqs`).toBeGreaterThanOrEqual(4);
      for (const faq of page.faqs) {
        expect(faq.q.length, `${page.slug}: faq q`).toBeGreaterThan(8);
        expect(faq.a.length, `${page.slug}: faq a`).toBeGreaterThan(30);
      }
      for (const section of page.sections) {
        expect(section.h2.length, `${page.slug}: section h2`).toBeGreaterThan(5);
        expect(section.paragraphs.length, `${page.slug}: ${section.h2} paragraphs`).toBeGreaterThan(0);
      }
    }
  });

  it("اسلاگ‌ها در کل خانواده‌ها یکتا هستند", () => {
    const slugs = all.map((page) => `${page.constructor.name}:${page.slug}`);
    // چون دو خانواده می‌توانند اسلاگ مشترک داشته باشند (news/clash-royale و tournament/clash-royale)،
    // یکتایی «در هر خانواده» و یکتایی «مسیر نهایی» را جدا چک می‌کنیم.
    expect(new Set(pseoBuyPages.map((p) => p.slug)).size).toBe(pseoBuyPages.length);
    expect(new Set(pseoTournamentPages.map((p) => p.slug)).size).toBe(pseoTournamentPages.length);
    expect(new Set(pseoNewsPages.map((p) => p.slug)).size).toBe(pseoNewsPages.length);
    expect(slugs.length).toBeGreaterThan(0);
  });

  it("getterها درست کار می‌کنند", () => {
    expect(getBuyPage("cp-cod-mobile")?.keyword).toContain("CP");
    expect(getBuyPage("نا-موجود")).toBeUndefined();
    expect(getTournamentPage("free")).toBeTruthy();
    expect(getTournamentPage("na")).toBeUndefined();
    expect(getNewsPage("clash-royale")).toBeTruthy();
    expect(getNewsPage("na")).toBeUndefined();
  });

  it("صفحات خرید به فروشگاه با کوئری معتبر وصل هستند", () => {
    for (const page of pseoBuyPages) {
      expect(["currency", "account", "item"]).toContain(page.query.kind);
      if (page.query.game) {
        expect(["clash_royale", "cod_mobile", "fortnite"]).toContain(page.query.game);
      }
    }
  });

  it("لینک‌های مرتبط هر بازی ساخته می‌شود", () => {
    for (const gameId of ["clash_royale", "cod_mobile", "fortnite"] as const) {
      const links = pseoLinksForGame(gameId);
      expect(links.length).toBeGreaterThanOrEqual(2);
      for (const link of links) {
        expect(link.href.startsWith("/")).toBe(true);
        expect(link.label.length).toBeGreaterThan(2);
      }
    }
  });
});
