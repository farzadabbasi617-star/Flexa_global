/**
 * Classified ads scraper for Divar and Sheypoor.
 *
 * IMPORTANT: This is a monitoring helper. Divar and Sheypoor do not provide a
 * public API for searching ads, so we parse their public HTML pages. Their
 * markup changes frequently, so the selectors below should be updated as needed.
 *
 * Rules:
 * - Respect robots.txt and rate limits.
 * - Only run from admin tools.
 * - Never send unsolicited automated messages; ads are presented for manual review.
 */

import { db } from "@/db";
import { classifiedAds, classifiedScrapeLogs } from "@/db/schema";
import { eq, and, sql, count } from "drizzle-orm";
import logger from "@/lib/logger";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
];

const REFERERS = [
  "https://www.google.com/",
  "https://www.bing.com/",
  "https://search.yahoo.com/",
  "https://www.divar.ir/",
  "https://www.sheypoor.com/",
];

const DEFAULT_DELAY_MS = 2_500;
const MIN_DELAY_MS = 1_500;
const MAX_DELAY_MS = 5_500;

export const GAMING_KEYWORDS = [
  "اکانت کالاف",
  "اکانت کلش رویال",
  "اکانت فورتنایت",
  "کالاف موبایل",
  "call of duty mobile",
  "کلش رویال",
  "clash royale",
  "فورتنایت",
  "fortnite",
  "جم کلش",
  "cp کالاف",
  "cp call of duty",
  "v-bucks",
  "سکو کلش",
  "لول کلش",
  "ایونت فورتنایت",
  "بتل پس",
  "battle pass",
  "گیمر",
  "گیمینگ",
  "psn",
  "اکانت ps4",
  "اکانت ps5",
  "xbox",
  "استیم",
  "steam",
  "ریجن ترکیه",
  "ریجن آرژانتین",
];

export const DIVAR_CITIES = [
  "tehran", "isfahan", "mashhad", "shiraz", "tabriz", "karaj", "ahvaz", "qom", "kermanshah", "rasht",
  "yazd", "kerman", "urmia", "zahedan", "bandar-abbas", "arak", "hamedan", "sari", "sanandaj", "gorgan",
];

export const SHEYPOOR_CITIES = [
  "tehran", "isfahan", "mashhad", "shiraz", "tabriz", "karaj", "ahvaz", "qom",
];

export interface ScrapedAd {
  externalId: string;
  title: string;
  description?: string;
  url: string;
  price?: string;
  city?: string;
  district?: string;
  category?: string;
  imageUrl?: string;
  keywords: string[];
  rawPayload: Record<string, unknown>;
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function containsGamingKeyword(text: string): string[] {
  const lower = text.toLowerCase();
  return GAMING_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
}

function getWhitelist(): string[] {
  const raw = process.env.CLASSIFIED_WHITELIST_KEYWORDS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function getBlacklist(): string[] {
  const raw = process.env.CLASSIFIED_BLACKLIST_KEYWORDS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function passesKeywordFilters(text: string): { ok: boolean; matchedKeywords: string[]; blockedKeyword?: string } {
  const lower = text.toLowerCase();
  const matchedKeywords = containsGamingKeyword(text);

  const blacklist = getBlacklist();
  for (const kw of blacklist) {
    if (lower.includes(kw)) return { ok: false, matchedKeywords, blockedKeyword: kw };
  }

  const whitelist = getWhitelist();
  if (whitelist.length) {
    const hasWhitelist = whitelist.some((kw) => lower.includes(kw));
    if (!hasWhitelist) return { ok: false, matchedKeywords, blockedKeyword: undefined };
  }

  return { ok: true, matchedKeywords };
}

function normalizeUrl(base: string, href: string) {
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return new URL(href, base).toString();
  return new URL(href, base).toString();
}

function getProxyUrl() {
  return process.env.CLASSIFIED_PROXY_URL?.trim() || null;
}

export async function fetchHtml(url: string, retries = 2): Promise<string | null> {
  const proxyUrl = getProxyUrl();
  const finalUrl = proxyUrl ? `${proxyUrl}?url=${encodeURIComponent(url)}` : url;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) await sleep(randomDelay() * attempt);
      const response = await fetch(finalUrl, {
        headers: {
          "User-Agent": randomItem(USER_AGENTS),
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
          "Referer": randomItem(REFERERS),
          "DNT": "1",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        },
        cache: "no-store",
      });
      if (!response.ok) {
        logger.warn({ url, status: response.status, attempt }, "Classified fetch failed");
        if (response.status === 403 || response.status === 429) {
          await sleep(randomDelay() * 3);
          continue;
        }
        return null;
      }
      return await response.text();
    } catch (err) {
      lastError = err;
      logger.warn({ err, url, attempt }, "Classified fetch error");
      await sleep(randomDelay());
    }
  }
  logger.warn({ err: lastError, url }, "Classified fetch exhausted retries");
  return null;
}

// ─────────────────────────────────────────────────────────────
// Divar scraper
// ─────────────────────────────────────────────────────────────

export async function scrapeDivarCity(city: string, options: { limit?: number; query?: string } = {}): Promise<ScrapedAd[]> {
  const query = encodeURIComponent(options.query || "کالاف کلش فورتنایت گیمینگ");
  const searchUrl = `https://divar.ir/s/${city}?q=${query}`;
  const html = await fetchHtml(searchUrl);
  if (!html) return [];

  const ads: ScrapedAd[] = [];
  const tokenMatches = html.matchAll(/href="\/v\/([^"\/]+)"/g);
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const match of tokenMatches) {
    const token = match[1];
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= (options.limit || 8)) break;
  }

  for (const token of tokens) {
    const url = `https://divar.ir/v/${token}`;
    const detailHtml = await fetchHtml(url);
    if (!detailHtml) continue;
    await sleep(randomDelay());

    const titleMatch = detailHtml.match(/<title>([^<]+)<\/title>/);
    const metaDescMatch = detailHtml.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);
    const title = (titleMatch?.[1] || "").replace(" - دیوار", "").trim();
    const description = metaDescMatch?.[1] || "";
    const fullText = `${title} ${description}`;
    const filter = passesKeywordFilters(fullText);
    const keywords = filter.matchedKeywords;
    if (!filter.ok || !keywords.length) continue;

    const priceMatch = detailHtml.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*USDT/);
    const imageMatch = detailHtml.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i);

    ads.push({
      externalId: token,
      title: title || "آگهی دیوار",
      description: description.slice(0, 1000),
      url,
      price: priceMatch?.[0] || undefined,
      city,
      keywords,
      rawPayload: { source: "divar", token, snippet: description.slice(0, 500) },
      imageUrl: imageMatch?.[1] || undefined,
    });
  }

  return ads;
}

// ─────────────────────────────────────────────────────────────
// Sheypoor scraper
// ─────────────────────────────────────────────────────────────

export async function scrapeSheypoorCity(city: string, options: { limit?: number; query?: string } = {}): Promise<ScrapedAd[]> {
  const query = encodeURIComponent(options.query || "کالاف کلش فورتنایت گیمینگ");
  const searchUrl = `https://www.sheypoor.com/${city}?q=${query}`;
  const html = await fetchHtml(searchUrl);
  if (!html) return [];

  const ads: ScrapedAd[] = [];
  const tokenMatches = html.matchAll(/href="(\/item\/[^"]+)"/g);
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const match of tokenMatches) {
    const path = match[1].split("?")[0];
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
    if (paths.length >= (options.limit || 8)) break;
  }

  for (const path of paths) {
    const url = normalizeUrl("https://www.sheypoor.com", path);
    const detailHtml = await fetchHtml(url);
    if (!detailHtml) continue;
    await sleep(randomDelay());

    const titleMatch = detailHtml.match(/<title>([^<]+)<\/title>/);
    const metaDescMatch = detailHtml.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);
    const title = (titleMatch?.[1] || "").replace(" - شیپور", "").trim();
    const description = metaDescMatch?.[1] || "";
    const fullText = `${title} ${description}`;
    const filter = passesKeywordFilters(fullText);
    const keywords = filter.matchedKeywords;
    if (!filter.ok || !keywords.length) continue;

    const priceMatch = detailHtml.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*USDT/);
    const imageMatch = detailHtml.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i);

    ads.push({
      externalId: path.replace(/\//g, "_"),
      title: title || "آگهی شیپور",
      description: description.slice(0, 1000),
      url,
      price: priceMatch?.[0] || undefined,
      city,
      keywords,
      rawPayload: { source: "sheypoor", path, snippet: description.slice(0, 500) },
      imageUrl: imageMatch?.[1] || undefined,
    });
  }

  return ads;
}

// ─────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────

function normalizeForDuplicate(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s\-_،,]+/g, "")
    .replace(/\d{5,}/g, "")
    .trim();
}

function normalizeUrlForDuplicate(url: string) {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

export async function storeScrapedAds(ads: ScrapedAd[], platform: string) {
  let newCount = 0;

  // Fetch existing active ads for duplicate title/url detection.
  const existingAds = await db
    .select({ id: classifiedAds.id, externalId: classifiedAds.externalId, title: classifiedAds.title, url: classifiedAds.url, status: classifiedAds.status })
    .from(classifiedAds)
    .where(eq(classifiedAds.platform, platform));

  const existingByExternalId = new Map(existingAds.map((r) => [r.externalId, r]));
  const existingByUrl = new Map(existingAds.map((r) => [normalizeUrlForDuplicate(r.url), r]));
  const existingByTitle = new Map(existingAds.map((r) => [normalizeForDuplicate(r.title), r]));

  for (const ad of ads) {
    // Exact duplicate by externalId
    if (existingByExternalId.has(ad.externalId)) continue;

    // Duplicate by normalized URL (ignoring query params)
    const normalizedUrl = normalizeUrlForDuplicate(ad.url);
    if (existingByUrl.has(normalizedUrl)) continue;

    // Duplicate by very similar title (same normalized title)
    const normalizedTitle = normalizeForDuplicate(ad.title);
    if (normalizedTitle.length > 8 && existingByTitle.has(normalizedTitle)) continue;

    await db.insert(classifiedAds).values({
      platform,
      externalId: ad.externalId,
      title: ad.title,
      description: ad.description || null,
      url: ad.url,
      price: ad.price || null,
      city: ad.city || null,
      district: ad.district || null,
      category: ad.category || null,
      imageUrl: ad.imageUrl || null,
      keywords: ad.keywords,
      rawPayload: ad.rawPayload,
      status: "new",
    });
    newCount += 1;

    // Add to maps so we don't insert another duplicate in the same batch.
    existingByExternalId.set(ad.externalId, { id: "", externalId: ad.externalId, title: ad.title, url: ad.url, status: "new" });
    existingByUrl.set(normalizedUrl, { id: "", externalId: ad.externalId, title: ad.title, url: ad.url, status: "new" });
    existingByTitle.set(normalizedTitle, { id: "", externalId: ad.externalId, title: ad.title, url: ad.url, status: "new" });
  }
  return newCount;
}

export async function logScrape(platform: string, status: string, itemsFound: number, itemsNew: number, errorMessage?: string) {
  await db.insert(classifiedScrapeLogs).values({ platform, status, itemsFound, itemsNew, errorMessage: errorMessage || null });
}

export async function cleanupOldClassifiedAds() {
  const maxAgeDays = Math.max(1, Math.min(Number(process.env.CLASSIFIED_ADS_MAX_AGE_DAYS || "7"), 90));
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const [countRow] = await db.select({ value: count() }).from(classifiedAds).where(sql`${classifiedAds.createdAt} < ${cutoff}`);
  const deletedCount = countRow?.value || 0;
  await db.delete(classifiedAds).where(sql`${classifiedAds.createdAt} < ${cutoff}`);
  return { deleted: deletedCount, maxAgeDays, cutoff };
}

// ─────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────

export interface ScrapeOptions {
  platforms?: ("divar" | "sheypoor")[];
  cities?: string[];
  limitPerCity?: number;
  allCities?: boolean;
}

export async function runClassifiedScrape(options: ScrapeOptions = {}) {
  const platforms = options.platforms || ["divar", "sheypoor"];
  const results: { platform: string; city: string; found: number; new: number; status: string; error?: string }[] = [];

  for (const platform of platforms) {
    const cities = options.allCities
      ? platform === "divar"
        ? DIVAR_CITIES
        : SHEYPOOR_CITIES
      : (options.cities || [platform === "divar" ? "tehran" : "tehran"]);

    for (const city of cities) {
      try {
        let ads: ScrapedAd[] = [];
        if (platform === "divar") ads = await scrapeDivarCity(city, { limit: options.limitPerCity || 5 });
        if (platform === "sheypoor") ads = await scrapeSheypoorCity(city, { limit: options.limitPerCity || 5 });
        const newCount = await storeScrapedAds(ads, platform);
        results.push({ platform, city, found: ads.length, new: newCount, status: "success" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ platform, city, found: 0, new: 0, status: "error", error: message });
        logger.error({ err, platform, city }, "Classified city scrape failed");
      }
    }
  }

  // Aggregate logs per platform
  const byPlatform: Record<string, { found: number; new: number; errors: string[] }> = {};
  for (const r of results) {
    if (!byPlatform[r.platform]) byPlatform[r.platform] = { found: 0, new: 0, errors: [] };
    byPlatform[r.platform].found += r.found;
    byPlatform[r.platform].new += r.new;
    if (r.error) byPlatform[r.platform].errors.push(`${r.city}: ${r.error}`);
  }
  for (const platform of Object.keys(byPlatform)) {
    const p = byPlatform[platform];
    await logScrape(platform, p.errors.length ? "partial_error" : "success", p.found, p.new, p.errors.join("\n") || undefined);
  }

  return results;
}
