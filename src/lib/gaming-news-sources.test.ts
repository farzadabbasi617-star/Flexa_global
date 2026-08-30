import { describe, expect, it } from "vitest";
import {
  articleTextFromHtml,
  extractOfficialArticleLinks,
  hasAcceptablePersianNewsQuality,
  isTrustedArticleImage,
  isTrustedArticleUrl,
  parseTrustedArticleMarkdown,
  parseTrustedArticlePage,
} from "./gaming-news-sources";

const ARTICLE_BODY = `
  <p>Fortnite has introduced a new limited-time Battle Royale event with a new point of interest and several quests.</p>
  <p>Players can complete the quests during the announced event window and unlock the rewards listed by Epic Games.</p>
  <p>The official article also explains the gameplay changes, item availability, and exact event schedule for players.</p>
`;

describe("trusted gaming news sources", () => {
  it("accepts official article and first-party image CDN hosts only", () => {
    expect(isTrustedArticleUrl("https://www.fortnite.com/news/a-real-update", "fortnite")).toBe(true);
    expect(isTrustedArticleUrl("https://example.com/news/a-real-update", "fortnite")).toBe(false);
    expect(isTrustedArticleImage("https://cms-assets.unrealengine.com/project/image", "fortnite")).toBe(true);
    expect(isTrustedArticleImage("https://images.example.com/copied.jpg", "fortnite")).toBe(false);
  });

  it("extracts only article links belonging to the selected official game index", () => {
    const html = `
      <a href="/news/real-fortnite-update">Article</a>
      <a href="/news/tag/battle-royale">Tag</a>
      <a href="https://evil.example/news/copied">Copied</a>
    `;
    expect(extractOfficialArticleLinks(html, "https://www.fortnite.com/news", "fortnite"))
      .toEqual(["https://www.fortnite.com/news/real-fortnite-update"]);
  });

  it("parses title, date, first-party image and source body from a trusted article", () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Official Fortnite Update">
      <meta property="article:published_time" content="2026-07-16T09:35:10Z">
      <meta property="og:image" content="https://cms-assets.unrealengine.com/project/official-image">
    </head><body><nav>Ignore navigation</nav><article>${ARTICLE_BODY}</article></body></html>`;
    const parsed = parseTrustedArticlePage(html, "https://www.fortnite.com/news/official-update", "fortnite");
    expect(parsed?.title).toBe("Official Fortnite Update");
    expect(parsed?.publishedAt).toBe("2026-07-16T09:35:10.000Z");
    expect(parsed?.imageUrl).toContain("cms-assets.unrealengine.com");
    expect(parsed?.content).toContain("limited-time Battle Royale event");
    expect(parsed?.content).not.toContain("Ignore navigation");
  });

  it("parses a reader copy only when its canonical URL and image remain official", () => {
    const markdown = `Title: DC Sirens Bring the Heat to Fortnite
URL Source: https://www.fortnite.com/news/dc-sirens-bring-the-heat-to-fortnite
Markdown Content:
Jul 16, 2026
![Image](https://cms-assets.unrealengine.com/project/official-image)
${ARTICLE_BODY.replace(/<[^>]+>/g, " ")}
## More Like This
Unrelated recommendations`;
    const parsed = parseTrustedArticleMarkdown(
      markdown,
      "https://www.fortnite.com/news/dc-sirens-bring-the-heat-to-fortnite",
      "fortnite"
    );
    expect(parsed?.title).toContain("DC Sirens");
    expect(parsed?.imageUrl).toContain("unrealengine.com");
    expect(parsed?.content).not.toContain("Unrelated recommendations");
  });

  it("rejects an article that uses an unrelated image host", () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Official Fortnite Update">
      <meta property="article:published_time" content="2026-07-16T09:35:10Z">
      <meta property="og:image" content="https://images.example.com/copied.jpg">
    </head><body><article>${ARTICLE_BODY}</article></body></html>`;
    expect(parseTrustedArticlePage(html, "https://www.fortnite.com/news/official-update", "fortnite")).toBeNull();
  });

  it("keeps article paragraph boundaries while stripping markup", () => {
    expect(articleTextFromHtml("<p>First paragraph</p><p>Second <b>paragraph</b></p>"))
      .toBe("First paragraph\nSecond paragraph");
  });

  it("rejects mixed-script provider leakage while allowing exact English game names", () => {
    const clean = {
      title: "تغییرات جدید فورتنایت منتشر شد",
      summary: "جزئیات رسمی این به‌روزرسانی از منبع Fortnite منتشر شده است.",
      description: "اپیک گیمز جزئیات به‌روزرسانی جدید فورتنایت را اعلام کرد. در این نسخه چند قابلیت تازه برای بازیکنان Battle Royale در دسترس قرار گرفته است و زمان شروع رویداد نیز در خبر رسمی توضیح داده شده است.",
    };
    expect(hasAcceptablePersianNewsQuality(clean)).toBe(true);
    expect(hasAcceptablePersianNewsQuality({ ...clean, description: `${clean.description} ماموریت‌های新的 را 完 کنید.` })).toBe(false);
    expect(hasAcceptablePersianNewsQuality({ ...clean, description: `${clean.description} phần thưởng riêng.` })).toBe(false);
  });
});
