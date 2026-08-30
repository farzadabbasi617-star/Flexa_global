export type GamingNewsGame = "clash_royale" | "cod_mobile" | "fortnite";

export interface ParsedTrustedArticle {
  title: string;
  content: string;
  imageUrl: string;
  publishedAt: string | null;
}

const TRUSTED_ARTICLE_HOSTS: Record<GamingNewsGame, string[]> = {
  clash_royale: ["supercell.com", "clashroyale.com", "royaleapi.com"],
  cod_mobile: ["callofduty.com", "activision.com"],
  fortnite: ["fortnite.com", "epicgames.com"],
};

// Official publishers commonly serve article artwork from these first-party
// CDNs rather than from the exact article hostname.
const TRUSTED_IMAGE_HOSTS: Record<GamingNewsGame, string[]> = {
  clash_royale: ["supercell.com", "clashroyale.com", "royaleapi.com", "inbox.supercell.com"],
  cod_mobile: ["callofduty.com", "activision.com"],
  fortnite: ["fortnite.com", "epicgames.com", "unrealengine.com"],
};

function hostMatches(host: string, allowed: string[]) {
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

export function isTrustedArticleUrl(value: string, game: GamingNewsGame) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && hostMatches(url.hostname.toLowerCase(), TRUSTED_ARTICLE_HOSTS[game]);
  } catch {
    return false;
  }
}

export function isTrustedArticleImage(value: string | null | undefined, game: GamingNewsGame) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:"
      && hostMatches(url.hostname.toLowerCase(), TRUSTED_IMAGE_HOSTS[game])
      && !/googleusercontent\.com\/favicon/i.test(url.href);
  } catch {
    return false;
  }
}

export function decodeNewsHtml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
}

export function articleTextFromHtml(value: string) {
  return decodeNewsHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|h[1-6]|li|section|div)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
  );
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const first = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"));
  if (first?.[1]) return decodeNewsHtml(first[1]);
  const reversed = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"));
  return reversed?.[1] ? decodeNewsHtml(reversed[1]) : "";
}

function jsonLdCandidates(html: string) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const rows: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    rows.push(object);
    if (object["@graph"]) visit(object["@graph"]);
    if (object.mainEntity) visit(object.mainEntity);
  };
  for (const script of scripts) {
    try {
      visit(JSON.parse(decodeNewsHtml(script[1])));
    } catch {
      // Invalid analytics JSON-LD must not prevent parsing another valid block.
    }
  }
  return rows;
}

function firstString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstString(value[0]);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return firstString(object.url || object.contentUrl);
  }
  return "";
}

function absoluteHttpsUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(decodeNewsHtml(value), baseUrl);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function parseTrustedArticlePage(
  html: string,
  pageUrl: string,
  game: GamingNewsGame
): ParsedTrustedArticle | null {
  if (!isTrustedArticleUrl(pageUrl, game)) return null;
  const jsonLd = jsonLdCandidates(html);
  const articleLd = jsonLd.find((row) => {
    const type = String(row["@type"] || "").toLowerCase();
    return type.includes("article") || type.includes("blogposting") || Boolean(row.articleBody);
  });

  const h1 = articleTextFromHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const title = decodeNewsHtml(
    metaContent(html, "og:title")
      || firstString(articleLd?.headline)
      || h1
      || articleTextFromHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
  ).replace(/\s+/g, " ").trim();

  const publishedAt = metaContent(html, "article:published_time")
    || metaContent(html, "datePublished")
    || firstString(articleLd?.datePublished)
    || decodeNewsHtml(html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] || "")
    || decodeNewsHtml(html.match(/["'](?:publishDate|datePublished)["']\s*:\s*["']([^"']+)["']/i)?.[1] || "")
    || null;

  const imageCandidate = metaContent(html, "og:image")
    || metaContent(html, "twitter:image")
    || firstString(articleLd?.image);
  const imageUrl = absoluteHttpsUrl(imageCandidate, pageUrl);

  const articleBody = firstString(articleLd?.articleBody);
  const articleHtml = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || "";
  const extractedBody = articleTextFromHtml(articleHtml);
  const description = metaContent(html, "description") || metaContent(html, "og:description");
  const content = [articleBody, extractedBody, description]
    .map((item) => decodeNewsHtml(String(item || "")).trim())
    .sort((a, b) => b.length - a.length)[0]
    ?.slice(0, 14_000) || "";

  if (title.length < 8 || content.length < 250 || !publishedAt || !isTrustedArticleImage(imageUrl, game)) return null;
  const timestamp = new Date(publishedAt).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return { title: title.slice(0, 220), content, imageUrl, publishedAt: new Date(timestamp).toISOString() };
}

export function parseTrustedArticleMarkdown(
  markdown: string,
  pageUrl: string,
  game: GamingNewsGame
): ParsedTrustedArticle | null {
  if (!isTrustedArticleUrl(pageUrl, game)) return null;
  const declaredSource = markdown.match(/^URL Source:\s*(https:\/\/\S+)/im)?.[1] || pageUrl;
  if (!isTrustedArticleUrl(declaredSource, game)) return null;
  const title = decodeNewsHtml(markdown.match(/^Title:\s*(.+)$/im)?.[1] || "").replace(/\s+/g, " ").trim();
  const bodyStart = markdown.indexOf("Markdown Content:");
  const rawBody = bodyStart >= 0 ? markdown.slice(bodyStart + "Markdown Content:".length) : markdown;
  const withoutRelated = rawBody.split(/\\?##\s+More Like This/i)[0];
  const imageMatches = [...withoutRelated.matchAll(/!\\?\[[^\]]*\]\((https:\/\/[^)]+)\)/gi)];
  const imageUrl = imageMatches.map((match) => decodeNewsHtml(match[1])).find((image) => isTrustedArticleImage(image, game)) || "";
  const dateText = withoutRelated.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i)?.[0]
    || withoutRelated.match(/\b\d{4}-\d{2}-\d{2}(?:T[^\s]+)?\b/)?.[0]
    || "";
  const timestamp = new Date(dateText).getTime();
  const content = decodeNewsHtml(withoutRelated
    .replace(/!\\?\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\\?#{1,6}\s*/g, "")
    .replace(/\\?\*{1,3}/g, "")
    .replace(/`{1,3}/g, "")
    .replace(dateText, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()).slice(0, 14_000);
  if (title.length < 8 || !Number.isFinite(timestamp) || content.length < 250 || !imageUrl) return null;
  return { title: title.slice(0, 220), content, imageUrl, publishedAt: new Date(timestamp).toISOString() };
}

export function hasAcceptablePersianNewsQuality(input: {
  title: string;
  summary?: string | null;
  description: string;
}) {
  const combined = `${input.title}\n${input.summary || ""}\n${input.description}`.trim();
  if (input.title.trim().length < 8 || input.description.trim().length < 120) return false;
  // Reject provider leakage from unrelated writing systems. Proper English
  // game/item names remain allowed, but CJK/Hangul/Thai/Cyrillic fragments and
  // replacement characters indicate a broken translation.
  if (/[\u2E80-\u2EFF\u3040-\u30FF\u3400-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF\u0E00-\u0E7F\u0400-\u04FF\uFFFD]/u.test(combined)) return false;
  const extendedLatin = (combined.match(/\p{Script=Latin}/gu) || [])
    .filter((character) => (character.codePointAt(0) || 0) > 127).length;
  if (extendedLatin > 1) return false;
  const letters = combined.match(/\p{L}/gu) || [];
  const persian = combined.match(/[\u0600-\u06FF]/g) || [];
  if (persian.length < 60) return false;
  return letters.length > 0 && persian.length / letters.length >= 0.42;
}

export function extractOfficialArticleLinks(html: string, indexUrl: string, game: GamingNewsGame) {
  const links: string[] = [];
  const candidates = [
    ...[...html.matchAll(/<a\b[^>]+href=["']([^"'#]+)["']/gi)].map((match) => match[1]),
    ...[...html.matchAll(/\]\((https:\/\/[^)\s]+)\)/gi)].map((match) => match[1]),
  ];
  for (const candidate of candidates) {
    const href = absoluteHttpsUrl(candidate, indexUrl);
    if (!href || !isTrustedArticleUrl(href, game)) continue;
    const url = new URL(href);
    const path = url.pathname.replace(/\/+$/, "/");
    let accepted = false;
    if (game === "clash_royale") {
      accepted = /^\/en\/games\/clashroyale\/blog\/(?:news|release-notes)\/[^/]+\/$/i.test(path);
    } else if (game === "fortnite") {
      accepted = /^\/news\/[^/]+\/?$/i.test(path) && !path.startsWith("/news/tag/");
    } else {
      accepted = /^\/blog\/\d{4}\/\d{2}\/[^/]+\/?$/i.test(path)
        && /(?:call-of-duty-mobile|cod-mobile)/i.test(path);
    }
    if (accepted && !links.includes(url.href)) links.push(url.href);
  }
  return links;
}
