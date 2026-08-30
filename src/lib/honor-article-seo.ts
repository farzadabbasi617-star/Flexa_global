import { eq } from "drizzle-orm";
import { db } from "@/db";
import { honors } from "@/db/schema";
import { getStaticHonorById } from "@/lib/static-honors";

/**
 * Server-side article payload for search engines.
 *
 * The honour detail page is a client component: it fetches the article after
 * hydration, so the initial HTML carries the title and meta description but not
 * the body. Google indexes what it is handed first and only re-renders
 * JavaScript later, on a separate and much slower queue, so the actual article
 * text was effectively invisible.
 *
 * This reads the same record on the server so the page can emit the body in the
 * first response. The interactive parts (likes, view counting) stay on the
 * client where they belong.
 */
export interface HonorArticleSeo {
  id: string;
  title: string;
  summary: string | null;
  description: string;
  game: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  publishedAt: Date | string | null;
  sources: unknown;
  readTimeMinutes: number | null;
}

export async function getHonorArticleForSeo(id: string): Promise<HonorArticleSeo | null> {
  try {
    const [row] = await db
      .select({
        id: honors.id,
        title: honors.title,
        description: honors.description,
        game: honors.game,
        imageUrl: honors.imageUrl,
        publishedAt: honors.publishedAt,
        // summary, imageAlt, sources and readTimeMinutes are not columns; the
        // generator stores them inside the metadata jsonb blob.
        metadata: honors.metadata,
      })
      .from(honors)
      .where(eq(honors.id, id))
      .limit(1);
    if (row) {
      const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
      return {
        id: row.id,
        title: row.title,
        summary: typeof meta.summary === "string" ? meta.summary : null,
        description: row.description,
        game: row.game,
        imageUrl: row.imageUrl,
        imageAlt: typeof meta.imageAlt === "string" ? meta.imageAlt : null,
        publishedAt: row.publishedAt,
        sources: meta.sources ?? null,
        readTimeMinutes: typeof meta.readTimeMinutes === "number" ? meta.readTimeMinutes : null,
      };
    }
  } catch {
    // A database hiccup must not blank the page; fall through to static data.
  }

  const staticHonor = getStaticHonorById(id);
  if (!staticHonor) return null;
  return {
    id,
    title: staticHonor.title,
    summary: staticHonor.summary ?? null,
    description: staticHonor.description,
    game: staticHonor.game ?? null,
    imageUrl: staticHonor.image ?? null,
    imageAlt: staticHonor.title,
    publishedAt: staticHonor.publishedAt ?? null,
    sources: null,
    readTimeMinutes: null,
  };
}

/** Splits the stored body into paragraphs for real <p> elements. */
export function honorParagraphs(description: string) {
  return String(description || "")
    .split(/(?:\r?\n){2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isoDate(value: Date | string | null | undefined) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function sourceUrls(sources: unknown): string[] {
  if (!Array.isArray(sources)) return [];
  return sources
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return typeof record.url === "string" ? record.url : "";
      }
      return "";
    })
    .filter((url) => url.startsWith("https://"));
}

/**
 * schema.org NewsArticle for the article. Google uses this to understand that
 * the page is a news item rather than a generic page, which is what makes it
 * eligible for article rich results.
 */
export function honorNewsArticleJsonLd(article: HonorArticleSeo, baseUrl: string) {
  const url = `${baseUrl}/honors/${article.id}`;
  const published = isoDate(article.publishedAt);
  const citations = sourceUrls(article.sources);

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title.slice(0, 110),
    description: (article.summary || article.description).slice(0, 300),
    ...(article.imageUrl ? { image: [article.imageUrl] } : {}),
    ...(published ? { datePublished: published, dateModified: published } : {}),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: "Flexa", url: baseUrl },
    publisher: {
      "@type": "Organization",
      name: "Flexa",
      url: baseUrl,
      logo: { "@type": "ImageObject", url: `${baseUrl}/icons/icon-512.png` },
    },
    inLanguage: "fa-IR",
    ...(citations.length ? { citation: citations } : {}),
  };
}
