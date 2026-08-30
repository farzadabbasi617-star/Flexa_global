import { describe, expect, it } from "vitest";
import { honorNewsArticleJsonLd, honorParagraphs, type HonorArticleSeo } from "./honor-article-seo";

const BASE = "https://www.flexa1.ir";

const article: HonorArticleSeo = {
  id: "04e5bbdf-b2c7-4e38-a054-28600fd30882",
  title: "لیل تکا به عنوان آیکون فصل ۱۵ فورت نایت فستیوال معرفی شد",
  summary: "لیل تکا با صدای منحصربفردش به فورت نایت فستیوال می‌آید.",
  description: "پاراگراف اول خبر.\n\nپاراگراف دوم خبر.\n\nپاراگراف سوم.",
  game: "fortnite",
  imageUrl: "https://cdn.example.com/a.jpg",
  imageAlt: "لیل تکا",
  publishedAt: new Date("2026-07-30T12:00:00.000Z"),
  sources: [{ url: "https://www.epicgames.com/news/x" }],
  readTimeMinutes: 3,
};

describe("article body for crawlers", () => {
  it("splits the stored text into real paragraphs", () => {
    // The body is one text column; without this it renders as a single blob.
    expect(honorParagraphs(article.description)).toEqual([
      "پاراگراف اول خبر.",
      "پاراگراف دوم خبر.",
      "پاراگراف سوم.",
    ]);
  });

  it("tolerates windows line endings and stray blank lines", () => {
    expect(honorParagraphs("یک\r\n\r\n\r\nدو\n\n\n\nسه")).toEqual(["یک", "دو", "سه"]);
  });

  it("returns nothing for an empty body rather than a blank paragraph", () => {
    expect(honorParagraphs("")).toEqual([]);
    expect(honorParagraphs("   \n\n  ")).toEqual([]);
  });

  it("keeps a single-paragraph article intact", () => {
    expect(honorParagraphs("فقط یک پاراگراف")).toEqual(["فقط یک پاراگراف"]);
  });
});

describe("NewsArticle structured data", () => {
  const jsonLd = honorNewsArticleJsonLd(article, BASE) as Record<string, unknown>;

  it("declares itself a news article, not a generic page", () => {
    // This is what makes the page eligible for article rich results.
    expect(jsonLd["@type"]).toBe("NewsArticle");
    expect(jsonLd["@context"]).toBe("https://schema.org");
  });

  it("points at its own canonical URL", () => {
    expect(jsonLd.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": `${BASE}/honors/${article.id}`,
    });
  });

  it("uses an ISO timestamp Google can parse", () => {
    expect(jsonLd.datePublished).toBe("2026-07-30T12:00:00.000Z");
  });

  it("truncates a long headline to the length Google will display", () => {
    const long = honorNewsArticleJsonLd({ ...article, title: "ا".repeat(200) }, BASE) as Record<string, unknown>;
    expect(String(long.headline).length).toBeLessThanOrEqual(110);
  });

  it("prefers the summary over the body for the description", () => {
    expect(jsonLd.description).toBe(article.summary);
  });

  it("falls back to the body when there is no summary", () => {
    const noSummary = honorNewsArticleJsonLd({ ...article, summary: null }, BASE) as Record<string, unknown>;
    expect(String(noSummary.description).startsWith("پاراگراف اول")).toBe(true);
  });

  it("credits the original publisher as a citation", () => {
    // Translated news must point back to the source; claiming it outright is
    // both dishonest and bad for search.
    expect(jsonLd.citation).toEqual(["https://www.epicgames.com/news/x"]);
  });

  it("drops non-HTTPS and malformed citations", () => {
    const dirty = honorNewsArticleJsonLd({
      ...article,
      sources: [{ url: "http://insecure.example.com" }, { nope: 1 }, "https://good.example.com", 42],
    }, BASE) as Record<string, unknown>;
    expect(dirty.citation).toEqual(["https://good.example.com"]);
  });

  it("omits optional fields instead of emitting nulls", () => {
    const bare = honorNewsArticleJsonLd({
      ...article, imageUrl: null, publishedAt: null, sources: null,
    }, BASE) as Record<string, unknown>;
    expect("image" in bare).toBe(false);
    expect("datePublished" in bare).toBe(false);
    expect("citation" in bare).toBe(false);
  });

  it("ignores an unparseable date rather than emitting garbage", () => {
    const bad = honorNewsArticleJsonLd({ ...article, publishedAt: "not a date" }, BASE) as Record<string, unknown>;
    expect("datePublished" in bad).toBe(false);
  });

  it("serialises without a closing tag that could break out of the script block", () => {
    const hostile = honorNewsArticleJsonLd({ ...article, title: 'x</script><script>alert(1)</script>' }, BASE);
    const escaped = JSON.stringify(hostile).replace(/</g, "\\u003c");
    expect(escaped).not.toContain("</script>");
  });
});
