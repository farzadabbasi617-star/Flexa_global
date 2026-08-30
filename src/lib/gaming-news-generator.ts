import crypto from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { honorContentLikes, honorContentViews, honorLikes, honorViews, honors, telegramSentNotifications } from "@/db/schema";
import { fetchAIResponse, isUsableAISecret, normalizeAIEnvValue } from "@/lib/ai-provider-manager";
import { notifyAllUsersInApp } from "@/lib/app-notifications";
import { flexaSystemPrompt } from "@/lib/ai-prompts";
import { safeParseAIJson } from "@/lib/ai-utils";
import {
  extractOfficialArticleLinks,
  hasAcceptablePersianNewsQuality,
  isTrustedArticleImage,
  isTrustedArticleUrl,
  parseTrustedArticleMarkdown,
  parseTrustedArticlePage,
  type GamingNewsGame,
} from "@/lib/gaming-news-sources";
import logger from "@/lib/logger";

type NewsItem = {
  title: string;
  link: string;
  source: string;
  pubDate: string | null;
  game: GamingNewsGame;
  imageUrl?: string;
  content?: string;
};

type GeneratedNews = {
  reject?: boolean;
  title: string;
  summary: string;
  description: string;
  game: "clash_royale" | "cod_mobile" | "fortnite" | string;
  icon?: string;
  seoKeywords?: string[];
  imageAlt?: string;
};

const NEWS_QUERIES: Array<{ game: NewsItem["game"]; query: string }> = [
  { game: "clash_royale", query: "site:supercell.com/en/games/clashroyale/blog Clash Royale when:4d" },
  { game: "cod_mobile", query: "site:callofduty.com/blog Call of Duty Mobile when:4d" },
  { game: "fortnite", query: "site:fortnite.com/news Fortnite when:4d" },
];

const OFFICIAL_NEWS_INDEXES: Array<{ game: GamingNewsGame; url: string; source: string }> = [
  { game: "clash_royale", url: "https://supercell.com/en/games/clashroyale/blog/", source: "Supercell / Clash Royale" },
  { game: "cod_mobile", url: "https://www.callofduty.com/blog/mobile", source: "Call of Duty Mobile" },
  { game: "fortnite", url: "https://www.fortnite.com/news", source: "Fortnite / Epic Games" },
];

const GAME_BRAND: Record<string, { label: string; icon: string; from: string; to: string; accent: string }> = {
  clash_royale: { label: "کلش رویال", icon: "👑", from: "#083344", to: "#1d4ed8", accent: "#22d3ee" },
  cod_mobile: { label: "کالاف دیوتی موبایل", icon: "🎯", from: "#431407", to: "#991b1b", accent: "#fb923c" },
  fortnite: { label: "فورتنایت", icon: "🏗️", from: "#2e1065", to: "#9d174d", accent: "#d946ef" },
};

const GAME_SEO_KEYWORDS: Record<NewsItem["game"], string[]> = {
  clash_royale: ["اخبار کلش رویال", "آپدیت کلش رویال", "Clash Royale", "متای کلش رویال", "مسابقات کلش رویال Flexa"],
  cod_mobile: ["اخبار کالاف دیوتی موبایل", "آپدیت COD Mobile", "فصل جدید کالاف موبایل", "متای CODM", "مسابقات کالاف موبایل Flexa"],
  fortnite: ["اخبار فورتنایت", "آپدیت Fortnite", "فصل جدید فورتنایت", "متای فورتنایت", "مسابقات فورتنایت Flexa"],
};

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function shortText(value: string, max = 72) {
  const clean = stripHtml(value);
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function readingTimeMinutes(description: string) {
  const words = stripHtml(description).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function normalizeGoogleNewsUrl(value: string) {
  try {
    const url = new URL(value);
    const direct = url.searchParams.get("url");
    return direct || value;
  } catch {
    return value;
  }
}

async function fetchGoogleNewsItems(query: string, game: NewsItem["game"]): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

    return itemBlocks.slice(0, 5).map((block) => {
      const title = extractTag(block, "title");
      const link = normalizeGoogleNewsUrl(extractTag(block, "link"));
      const pubDate = extractTag(block, "pubDate") || null;
      const source = extractTag(block, "source") || "Google News";

      // بهبود استخراج تصویر از منابع مختلف
      let imageUrl = "";
      const description = extractTag(block, "description");
      const imgInDescription = description.match(/src="([^"]+)"/i) || description.match(/url="([^"]+)"/i);

      const imgMatch = block.match(/<media:content[^>]+url="([^"]+)"/i) ||
                       block.match(/<enclosure[^>]+url="([^"]+)"/i) ||
                       (imgInDescription ? imgInDescription : null);

      if (imgMatch) {
        imageUrl = imgMatch[1];
        if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
      }

      return { title, link, source, pubDate, game, imageUrl, content: stripHtml(description) };
    }).filter((item) => item.title && item.link);
  } catch (err) {
    logger.warn({ err, query, game }, "Failed to fetch Google News RSS");
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDiscordNewsItems(): Promise<NewsItem[]> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelIds = (process.env.DISCORD_CHANNEL_IDS || "").split(",").filter(Boolean);

  if (!token || channelIds.length === 0) return [];

  const allMessages: NewsItem[] = [];

  for (const channelId of channelIds) {
    try {
      const res = await fetch(`https://discord.com/api/v10/channels/${channelId.trim()}/messages?limit=5`, {
        headers: { Authorization: `Bot ${token}` },
        cache: "no-store",
      });

      if (!res.ok) continue;

      const messages = await res.json();
      for (const msg of messages) {
        if (!msg.content && (!msg.attachments || msg.attachments.length === 0)) continue;

        // تشخیص بازی بر اساس محتوای کانال یا کلمات کلیدی
        let game: NewsItem["game"] = "cod_mobile";
        const content = msg.content.toLowerCase();
        if (content.includes("royale") || content.includes("king")) game = "clash_royale";
        else if (content.includes("fortnite") || content.includes("build")) game = "fortnite";

        allMessages.push({
          title: msg.content.slice(0, 100),
          link: `https://discord.com/channels/${msg.guild_id}/${channelId}/${msg.id}`,
          source: "Discord Official",
          pubDate: msg.timestamp,
          game,
          imageUrl: msg.attachments?.[0]?.url || "",
          content: stripHtml(msg.content || ""),
        });
      }
    } catch (err) {
      logger.warn({ err, channelId }, "Failed to fetch Discord messages");
    }
  }

  return allMessages;
}

/**
 * How old an official post may be and still count as "news".
 *
 * This was hard-coded to 96 hours (4 days), which quietly starved the Hall of
 * Fame: first-party studios do not publish daily. Measured against the live
 * Supercell index, the six most recent Clash Royale posts were 293h, 486h,
 * 487h, 601h, 1323h and 1325h old — so every single candidate was discarded
 * and the cron reported success while publishing nothing.
 *
 * 14 days keeps posts genuinely current while surviving a normal quiet week.
 * Override with GAMING_NEWS_MAX_AGE_HOURS.
 */
export const DEFAULT_NEWS_MAX_AGE_HOURS = 336;

export function newsMaxAgeHours() {
  const raw = Number(process.env.GAMING_NEWS_MAX_AGE_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_NEWS_MAX_AGE_HOURS;
  // Clamp so a stray value cannot resurface year-old posts.
  return Math.min(Math.max(Math.floor(raw), 24), 2160);
}

export function isRecentNewsItem(item: NewsItem, maxAgeHours = newsMaxAgeHours()) {
  if (!item.pubDate) return false;
  const published = new Date(item.pubDate).getTime();
  return Number.isFinite(published) && published <= Date.now() + 60 * 60 * 1000 && published >= Date.now() - maxAgeHours * 60 * 60 * 1000;
}

function isTrustedNewsUrl(value: string, game: NewsItem["game"]) {
  return isTrustedArticleUrl(value, game);
}

async function fetchTrustedReaderCopy(item: NewsItem) {
  // Some publishers refuse server-side fetches outright: Fortnite answers 403
  // and Call of Duty simply never replies. Jina Reader is a transport of last
  // resort for those official URLs; the canonical source and every accepted
  // image are still revalidated against the per-game allowlist afterwards, so
  // the proxy cannot introduce an untrusted source.
  if (!isTrustedNewsUrl(item.link, item.game)) return null;
  try {
    const response = await fetch(`https://r.jina.ai/${item.link}`, {
      headers: { Accept: "text/plain", "User-Agent": "FlexaNewsReader/2.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return parseTrustedArticleMarkdown((await response.text()).slice(0, 500_000), item.link, item.game);
  } catch (error) {
    logger.warn({ error, link: item.link }, "Trusted Fortnite reader transport failed");
    return null;
  }
}

async function fetchTrustedArticleDetails(item: NewsItem) {
  if (!isTrustedNewsUrl(item.link, item.game)) {
    return {
      ...item,
      imageUrl: isTrustedArticleImage(item.imageUrl, item.game) ? item.imageUrl : "",
      content: item.content || "",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(item.link, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Identifying as a bot gets this request black-holed by
        // callofduty.com: the TLS handshake completes and the server then
        // never replies, so every article timed out. Publishers increasingly
        // treat an unknown bot UA as hostile; present as a browser and keep
        // the crawl polite instead (one request, no parallel hammering).
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    });
    const directAccepted = response.ok
      && isTrustedNewsUrl(response.url, item.game)
      && (response.headers.get("content-type") || "").includes("text/html");
    const directParsed = directAccepted
      ? parseTrustedArticlePage((await response.text()).slice(0, 1_500_000), response.url, item.game)
      : null;
    const parsed = directParsed || await fetchTrustedReaderCopy(item);
    if (!parsed) return { ...item, imageUrl: "", content: item.content || "" };
    return {
      ...item,
      title: parsed.title || item.title,
      link: directParsed ? response.url : item.link,
      pubDate: parsed.publishedAt || item.pubDate,
      imageUrl: parsed.imageUrl,
      content: parsed.content,
    };
  } catch (error) {
    logger.warn({ error, link: item.link, game: item.game }, "Failed to parse trusted gaming article");
    const parsed = await fetchTrustedReaderCopy(item);
    return parsed ? {
      ...item,
      title: parsed.title || item.title,
      pubDate: parsed.publishedAt || item.pubDate,
      imageUrl: parsed.imageUrl,
      content: parsed.content,
    } : { ...item, imageUrl: "", content: item.content || "" };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOfficialIndexItems(index: (typeof OFFICIAL_NEWS_INDEXES)[number]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    let indexBody = "";
    let indexBaseUrl = index.url;
    let transport = "direct";
    let directStatus: number | string = "error";

    // Publishers increasingly block datacentre IPs. Call of Duty hangs until
    // the timeout and Fortnite answers 403, so a direct failure is expected
    // rather than exceptional — fall through to the reader proxy for *any*
    // index, not just Fortnite (which was the only one handled before).
    try {
      const response = await fetch(index.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        cache: "no-store",
      });
      directStatus = response.status;
      if (response.ok) {
        indexBody = (await response.text()).slice(0, 1_500_000);
        indexBaseUrl = response.url || index.url;
      }
    } catch (error) {
      directStatus = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "fetch_failed";
    }

    if (!indexBody) {
      const reader = await fetch(`https://r.jina.ai/${index.url}`, {
        headers: { Accept: "text/plain", "User-Agent": "FlexaNewsReader/2.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
      if (reader?.ok) {
        indexBody = (await reader.text()).slice(0, 500_000);
        indexBaseUrl = index.url;
        transport = "reader";
      }
    }
    if (!indexBody) return { items: [] as NewsItem[], discovered: 0, error: `index_http_${directStatus}`, transport };
    const links = extractOfficialArticleLinks(indexBody, indexBaseUrl, index.game).slice(0, 6);
    const items = await Promise.all(links.map((link) => fetchTrustedArticleDetails({
      title: link.split("/").filter(Boolean).pop()?.replace(/-/g, " ") || index.source,
      link,
      source: index.source,
      pubDate: null,
      game: index.game,
    })));
    return {
      items: items.filter((item) => item.pubDate && item.content && item.imageUrl),
      discovered: links.length,
      error: links.length ? null : "no_article_links",
      transport,
    };
  } catch (error) {
    logger.warn({ error, index: index.url, game: index.game }, "Failed to fetch official gaming news index");
    return { items: [] as NewsItem[], discovered: 0, error: "index_fetch_failed", transport: "none" };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTelegramNewsItems(): Promise<NewsItem[]> {
  const configured = (process.env.GAMING_NEWS_TELEGRAM_CHANNELS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const rows: NewsItem[] = [];
  for (const entry of configured) {
    const [gameRaw, channelRaw] = entry.split(":");
    const game = gameRaw as NewsItem["game"];
    const channel = String(channelRaw || "").replace(/^@/, "");
    if (!GAME_BRAND[game] || !/^[A-Za-z0-9_]{5,64}$/.test(channel)) continue;
    try {
      const response = await fetch(`https://t.me/s/${channel}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FlexaNews/1.0)" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;
      const html = await response.text();
      const blocks = html.match(/<div class="tgme_widget_message_wrap[\s\S]*?<\/article>\s*<\/div>/gi) || [];
      for (const block of blocks.slice(-5)) {
        const content = stripHtml(block.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
        const link = block.match(/<a class="tgme_widget_message_date" href="([^"]+)"/i)?.[1] || "";
        const pubDate = block.match(/<time[^>]+datetime="([^"]+)"/i)?.[1] || null;
        const imageUrl = decodeXml(block.match(/background-image:url\(['"]?([^)'\"]+)/i)?.[1] || "");
        if (content.length < 120 || !link) continue;
        rows.push({ title: shortText(content, 100), content, link, source: `Telegram @${channel}`, pubDate, game, imageUrl });
      }
    } catch (error) {
      logger.warn({ error, channel, game }, "Failed to fetch configured Telegram news channel");
    }
  }
  return rows;
}

function isConfiguredFeed(item: NewsItem) {
  return item.source.startsWith("Discord") || item.source.startsWith("Telegram @");
}

function validConfiguredFeedImage(value?: string | null) {
  try {
    return new URL(String(value || "")).protocol === "https:";
  } catch {
    return false;
  }
}

function hasTrustedSourceImage(item: NewsItem) {
  return isConfiguredFeed(item)
    ? validConfiguredFeedImage(item.imageUrl)
    : isTrustedArticleImage(item.imageUrl, item.game);
}

async function collectGamingNewsItems() {
  const [discordResults, telegramResults, officialGroups, googleGroups] = await Promise.all([
    fetchDiscordNewsItems(),
    fetchTelegramNewsItems(),
    Promise.all(OFFICIAL_NEWS_INDEXES.map(fetchOfficialIndexItems)),
    Promise.all(NEWS_QUERIES.map((entry) => fetchGoogleNewsItems(entry.query, entry.game))),
  ]);
  const officialItems = officialGroups.flatMap((group) => group.items);
  const rawItems = [...officialItems, ...discordResults, ...telegramResults, ...googleGroups.flat()];
  const uniqueItems = [...new Map(rawItems.map((item) => [item.link, item])).values()].slice(0, 50);
  const maxAgeHours = newsMaxAgeHours();
  const recentItems = uniqueItems.filter((item) => isRecentNewsItem(item, maxAgeHours));

  // When discovery works but the freshness window rejects everything, the run
  // looks like a success that published nothing. Report how stale the best
  // candidate actually was so the cause is visible in the cron output instead
  // of having to reproduce it by hand.
  const ages = uniqueItems
    .map((item) => (item.pubDate ? (Date.now() - new Date(item.pubDate).getTime()) / 3_600_000 : null))
    .filter((value): value is number => Number.isFinite(value as number) && (value as number) >= 0)
    .sort((a, b) => a - b);
  const enriched = await Promise.all(recentItems.map(async (item) => {
    const enoughExistingText = isConfiguredFeed(item)
      ? stripHtml(item.content || "").length >= 120
      : stripHtml(item.content || "").length >= 250;
    if (enoughExistingText && hasTrustedSourceImage(item)) return item;
    return fetchTrustedArticleDetails(item);
  }));
  // A title alone is not enough to produce a faithful translation. Publish
  // only when a trusted article or configured feed contains both source text
  // and artwork coming from that same source.
  const accepted = enriched.filter((item) => {
    const length = stripHtml(item.content || "").length;
    const enoughText = isConfiguredFeed(item) ? length >= 120 : length >= 250;
    return enoughText
      && hasTrustedSourceImage(item)
      && (isConfiguredFeed(item) || isTrustedNewsUrl(item.link, item.game));
  });
  return {
    items: accepted,
    diagnostics: {
      officialIndexes: officialGroups.map((group, index) => ({
        game: OFFICIAL_NEWS_INDEXES[index].game,
        discovered: group.discovered,
        accepted: group.items.filter((item) => isRecentNewsItem(item, maxAgeHours)).length,
        transport: group.transport,
        error: group.error,
      })),
      discovered: uniqueItems.length,
      recent: recentItems.length,
      accepted: accepted.length,
      maxAgeHours,
      newestSourceAgeHours: ages.length ? Math.round(ages[0]) : null,
      itemsWithoutDate: uniqueItems.filter((item) => !item.pubDate).length,
      discord: discordResults.length,
      telegram: telegramResults.length,
      googleFallback: googleGroups.flat().length,
    },
  };
}

async function hasGenerated(dedupeKey: string) {
  try {
    const [row] = await db
      .select({ id: telegramSentNotifications.id })
      .from(telegramSentNotifications)
      .where(eq(telegramSentNotifications.dedupeKey, dedupeKey))
      .limit(1);
    return Boolean(row);
  } catch (err) {
    logger.warn({ err, dedupeKey }, "Failed to check hasGenerated, assuming false");
    return false;
  }
}

async function markGenerated(dedupeKey: string) {
  try {
    await db
      .insert(telegramSentNotifications)
      .values({ dedupeKey, type: "daily_gaming_news" })
      .onConflictDoNothing({ target: telegramSentNotifications.dedupeKey });
  } catch (err) {
    logger.error({ err, dedupeKey }, "Failed to markGenerated");
  }
}

/**
 * Removes news older than N days to keep the database lean.
 */
export async function cleanupOldNews(days = 7) {
  try {
    const threshold = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
    const rows = await db.select({
      id: honors.id,
      title: honors.title,
      description: honors.description,
      publishedAt: honors.publishedAt,
      createdAt: honors.createdAt,
      metadata: honors.metadata,
    }).from(honors).where(and(eq(honors.type, "news"), eq(honors.source, "ai_news")));
    const invalidFingerprints: string[] = [];
    const oldRows = rows.filter((row) => {
      const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {};
      const expired = new Date(row.publishedAt || row.createdAt).getTime() < threshold.getTime();
      const wrongFramework = String(metadata.contentFramework || "") !== "flexa_news_v4_source_translation";
      const badQuality = !hasAcceptablePersianNewsQuality({
        title: row.title,
        summary: String(metadata.summary || ""),
        description: row.description,
      });
      if (badQuality && typeof metadata.sourceFingerprint === "string") invalidFingerprints.push(metadata.sourceFingerprint);
      return expired || wrongFramework || badQuality;
    });
    const ids = oldRows.map((row) => row.id);
    if (!ids.length) return { deleted: 0 };

    await db.transaction(async (tx) => {
      await tx.delete(honorLikes).where(inArray(honorLikes.honorId, ids));
      await tx.delete(honorViews).where(inArray(honorViews.honorId, ids));
      await tx.delete(honorContentLikes).where(inArray(honorContentLikes.contentId, ids));
      await tx.delete(honorContentViews).where(inArray(honorContentViews.contentId, ids));
      await tx.delete(honors).where(inArray(honors.id, ids));
      const keys = [...new Set(invalidFingerprints.map((fingerprint) => `gaming-news-source:${fingerprint}`))];
      if (keys.length) await tx.delete(telegramSentNotifications).where(inArray(telegramSentNotifications.dedupeKey, keys));
    });
    logger.info({ days, deleted: ids.length, invalidQuality: invalidFingerprints.length }, "Cleaned up expired or invalid AI news from honors table");
    return { deleted: ids.length, invalidQuality: invalidFingerprints.length };
  } catch (err) {
    logger.error({ err }, "Failed to cleanup old news");
    return { deleted: 0, error: true };
  }
}

function sourceFingerprint(items: NewsItem[]) {
  return crypto.createHash("sha256")
    .update(items.map((item) => `${item.game}:${item.link}`).sort().join("|"))
    .digest("hex")
    .slice(0, 24);
}

/**
 * Translates one trusted source item.
 *
 * With `previewOnly` it stops short of writing anything: no honour row, no
 * dedupe marker, no notifications. That lets an operator read the translation
 * and decide, instead of the sweep publishing straight to the site. The
 * returned draft carries everything needed to publish it later unchanged.
 */
async function generateNewsFromItem(item: NewsItem, force: boolean, previewOnly = false) {
  const game = item.game;
  const items = [item];
  const fingerprint = sourceFingerprint(items);
  const sourceKey = `gaming-news-source:${fingerprint}`;
  if (!force && await hasGenerated(sourceKey)) return { generated: false as const, game, reason: "source_already_used" };

  const brand = GAME_BRAND[game];
  const sourcesText = items.map((item, index) =>
    `${index + 1}. عنوان: ${item.title}\nمنبع: ${item.source}\nتاریخ: ${item.pubDate || "نامشخص"}\nمتن منبع:\n${stripHtml(item.content || "").slice(0, 6000)}\nلینک: ${item.link}`
  ).join("\n\n");
  const seo = GAME_SEO_KEYWORDS[game].join("، ");
  const prompt = `متن معتبر زیر را بدون افزودن اطلاعات تازه به فارسی روان ترجمه و برای انتشار در Flexa ویرایش کن. موضوع فقط ${brand.label} است.

${sourcesText}

قواعد اجباری:
- فقط ترجمه و بازنویسی وفادار به متن منبع؛ هیچ خبر، عدد، توصیه، تحلیل یا ادعای جدید نساز.
- اگر متن منبع اطلاعات کافی ندارد، JSON با فیلد \"reject\":true برگردان.
- نام هیچ بازی دیگری را وارد نکن.
- طول متن متناسب با محتوای واقعی منبع باشد؛ برای بلندترشدن متن چیزی اضافه نکن.
- نام آیتم‌ها، فصل‌ها، مودها و تاریخ‌ها را دقیق حفظ کن.
- کلمات سئو را فقط جایی که طبیعی و مرتبط است استفاده کن: ${seo}.
- لینک منابع را داخل متن تکرار نکن؛ منابع جداگانه نمایش داده می‌شوند.

فقط JSON معتبر بده:
{
  "reject":false,
  "title":"ترجمه دقیق تیتر منبع بدون کلیک‌بیت",
  "summary":"خلاصه ۱۴۰ تا ۱۹۰ کاراکتری",
  "description":"متن کامل فارسی با پاراگراف‌بندی",
  "game":"${game}",
  "icon":"${brand.icon}",
  "imageAlt":"Alt فارسی دقیق برای تصویر خبر",
  "seoKeywords":["حداکثر ۸ عبارت مرتبط"]
}`;
  const systemPrompt = flexaSystemPrompt("honors", "You are a strict Persian translator of trusted gaming source text. Preserve facts exactly, add nothing, use Persian script only except exact game/item names, never output Chinese/CJK/Cyrillic/Thai/Korean fragments, and return valid JSON only. If the source lacks enough text, set reject=true.");
  let ai = await fetchAIResponse(prompt, systemPrompt).catch((error) => {
    logger.warn({ error, game }, "AI news generation failed");
    return null;
  });
  let parsed = ai ? safeParseAIJson<GeneratedNews>(ai.content) : null;
  if (!ai) return { generated: false as const, game, reason: "ai_provider_unavailable" };
  const structurallyValid = (value: GeneratedNews | null) => Boolean(
    value && !value.reject && value.title && value.description && value.game === game
  );
  const qualityValid = (value: GeneratedNews | null) => Boolean(
    structurallyValid(value) && hasAcceptablePersianNewsQuality({
      title: String(value!.title),
      summary: String(value!.summary || ""),
      description: String(value!.description),
    })
  );
  if (structurallyValid(parsed) && !qualityValid(parsed)) {
    const repairPrompt = `${prompt}\n\nخروجی قبلی به‌دلیل وجود نویسه‌های چینی/غیرفارسی یا کیفیت ترجمه رد شد. دوباره فقط از متن منبع بالا، فارسی روان و یکدست تولید کن. هیچ بخش خروجی قبلی را کپی نکن. شناسه تلاش: persian-quality-v2`;
    const repaired = await fetchAIResponse(repairPrompt, systemPrompt).catch(() => null);
    const repairedParsed = repaired ? safeParseAIJson<GeneratedNews>(repaired.content) : null;
    if (repaired && qualityValid(repairedParsed)) {
      ai = repaired;
      parsed = repairedParsed;
    }
  }
  if (!qualityValid(parsed)) {
    // "rejected" on its own gave no way to tell an AI refusal from unparseable
    // JSON from a game-tag mismatch, which made this failure mode opaque in
    // the cron output. Report which specific check failed.
    const rejectionDetail = !parsed
      ? "unparseable_json"
      : parsed.reject
        ? "ai_declared_insufficient_source"
        : !parsed.title
          ? "missing_title"
          : !parsed.description
            ? "missing_description"
            : parsed.game !== game
              ? `game_mismatch:${String(parsed.game).slice(0, 24)}`
              : "persian_quality";
    logger.warn(
      { game, rejectionDetail, provider: ai.provider, preview: String(ai.content || "").slice(0, 240) },
      "Source translation rejected"
    );
    return {
      generated: false as const,
      game,
      reason: structurallyValid(parsed) ? "persian_quality_rejected" : "source_translation_rejected",
      rejectionDetail,
    };
  }
  const news = parsed!;
  const title = shortText(String(news.title), 100);
  const description = String(news.description).trim();
  const summary = shortText(String(news.summary || description.split("\n")[0] || title), 190);
  const icon = String(news.icon || brand.icon).slice(0, 20);
  const sourceImage = items.find((source) => hasTrustedSourceImage(source))?.imageUrl || "";
  if (!sourceImage) return { generated: false as const, game, reason: "missing_trusted_source_image" };
  const imageUrl = sourceImage;
  const generatedKeywords = Array.isArray(news.seoKeywords)
    ? news.seoKeywords.map((keyword) => shortText(String(keyword), 50)).filter(Boolean)
    : [];
  const seoKeywords = [...new Set([...generatedKeywords, ...GAME_SEO_KEYWORDS[game]])].slice(0, 8);

  const draftValues = {
    type: "news" as const,
    title,
    description,
    icon,
    imageUrl,
    game,
    status: "approved",
    highlight: false,
    publishedAt: new Date(),
    source: "ai_news",
    metadata: {
      summary,
      imageAlt: news.imageAlt || title,
      readTimeMinutes: readingTimeMinutes(description),
      provider: ai.provider,
      model: ai.model || null,
      sources: items.map((source) => ({
        title: source.title,
        link: source.link,
        source: source.source,
        pubDate: source.pubDate,
        imageUrl: source.imageUrl,
      })),
      seoKeywords,
      sourceFingerprint: fingerprint,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      imageOrigin: "trusted_source_image",
      contentFramework: "flexa_news_v4_source_translation",
    },
  };

  if (previewOnly) {
    // Nothing is written. `sourceKey` travels with the draft so publishing it
    // later still records the dedupe marker against the same source.
    return {
      generated: false as const,
      preview: true as const,
      game,
      draft: { ...draftValues, sourceKey, sourceLink: item.link, sourceName: item.source },
    };
  }

  const [created] = await db.insert(honors).values(draftValues).returning();
  await markGenerated(sourceKey);
  await notifyAllUsersInApp({
    type: "news",
    title: "خبر جدید گیمینگ",
    message: title,
    link: `/honors/${created.id}`,
    dedupeKey: `app-news:${created.id}`,
  }).catch((err) => logger.warn({ err, honorId: created.id }, "Failed to create app notifications for generated news"));
  logger.info({ honorId: created.id, title, game, sources: items.length }, "Generated daily game news");
  return { generated: true as const, honorId: created.id, title, game, sources: items.length, provider: ai.provider };
}

export interface NewsDraft {
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

/**
 * Finds and translates new stories without publishing any of them.
 *
 * The scheduled sweep writes straight to the site; this is the manual path,
 * where an operator reads each translation first. Drafts are returned to the
 * caller and never stored, so abandoning the review leaves no trace and the
 * same source can be found again on the next search.
 */
export async function discoverGamingNewsDrafts({ limit = 6 } = {}) {
  const collection = await collectGamingNewsItems();
  const items = collection.items
    .sort((a, b) => new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime());
  const configuredProviders = [
    ["openrouter", process.env.OPENROUTER_API_KEY],
    ["groq", process.env.GROQ_API_KEY],
    ["huggingface", process.env.HUGGINGFACE_API_KEY],
  ].filter(([, value]) => isUsableAISecret(normalizeAIEnvValue(value))).map(([name]) => name);
  const diagnostics = { ...collection.diagnostics, configuredProviders };

  if (!items.length) return { drafts: [] as NewsDraft[], reason: "no_recent_complete_sources", diagnostics };
  if (!configuredProviders.length) return { drafts: [] as NewsDraft[], reason: "ai_provider_not_configured", diagnostics };

  const cap = Math.min(10, Math.max(1, Math.floor(limit) || 6));
  const candidates: NewsItem[] = [];
  for (const item of items) {
    if (candidates.length >= cap) break;
    // Skip anything already published, so review only ever shows genuinely new
    // stories.
    if (!(await hasGenerated(`gaming-news-source:${sourceFingerprint([item])}`))) candidates.push(item);
  }
  if (!candidates.length) return { drafts: [] as NewsDraft[], reason: "no_new_trusted_sources", diagnostics };

  const results: Awaited<ReturnType<typeof generateNewsFromItem>>[] = [];
  for (let index = 0; index < candidates.length; index += 2) {
    results.push(...await Promise.all(
      candidates.slice(index, index + 2).map((item) => generateNewsFromItem(item, false, true)),
    ));
  }

  const drafts: NewsDraft[] = [];
  const rejected: Array<{ game: string; reason: string }> = [];
  for (const result of results) {
    if ("preview" in result && result.preview && "draft" in result) {
      const draft = result.draft as Record<string, any>;
      const meta = (draft.metadata || {}) as Record<string, any>;
      drafts.push({
        id: String(draft.sourceKey),
        game: String(draft.game),
        title: String(draft.title),
        summary: String(meta.summary || ""),
        description: String(draft.description),
        imageUrl: String(draft.imageUrl || ""),
        imageAlt: String(meta.imageAlt || draft.title),
        icon: String(draft.icon || ""),
        seoKeywords: Array.isArray(meta.seoKeywords) ? meta.seoKeywords.map(String) : [],
        readTimeMinutes: Number(meta.readTimeMinutes || 0),
        sourceName: String(draft.sourceName || ""),
        sourceLink: String(draft.sourceLink || ""),
        sourceKey: String(draft.sourceKey),
        publishPayload: {
          type: draft.type, title: draft.title, description: draft.description,
          icon: draft.icon, imageUrl: draft.imageUrl, game: draft.game,
          source: draft.source, metadata: draft.metadata,
        },
      });
    } else if (!result.generated && "reason" in result) {
      rejected.push({ game: String(result.game), reason: String(result.reason) });
    }
  }

  return { drafts, rejected, diagnostics, reason: drafts.length ? null : "all_source_translations_rejected" };
}

/**
 * Publishes a draft the operator approved. Records the dedupe marker so the
 * same source is not offered again, and notifies users exactly as the
 * scheduled sweep does.
 */
export async function publishReviewedNewsDraft(draft: {
  sourceKey: string;
  publishPayload: Record<string, unknown>;
}) {
  const payload = draft.publishPayload as Record<string, any>;
  if (!payload?.title || !payload?.description) throw new Error("NEWS_DRAFT_INCOMPLETE");
  if (await hasGenerated(draft.sourceKey)) return { published: false as const, reason: "source_already_used" };

  const [created] = await db.insert(honors).values({
    type: "news",
    title: String(payload.title),
    description: String(payload.description),
    icon: String(payload.icon || ""),
    imageUrl: String(payload.imageUrl || ""),
    game: String(payload.game),
    status: "approved",
    highlight: false,
    publishedAt: new Date(),
    source: "ai_news",
    metadata: { ...(payload.metadata || {}), reviewedByAdmin: true },
  }).returning();

  await markGenerated(draft.sourceKey);
  await notifyAllUsersInApp({
    type: "news",
    title: "خبر جدید گیمینگ",
    message: String(payload.title),
    link: `/honors/${created.id}`,
    dedupeKey: `app-news:${created.id}`,
  }).catch((err) => logger.warn({ err, honorId: created.id }, "Failed to notify users about reviewed news"));

  return { published: true as const, honorId: created.id, title: created.title };
}

export async function generateDailyGamingNews({ force = false } = {}) {
  // مدت ماندگاری خبر در تالار افتخارات — پیش‌فرض ۳۰ روز، با GAMING_NEWS_RETENTION_DAYS قابل تنظیم
  const retentionDays = Math.max(1, Math.floor(Number(process.env.GAMING_NEWS_RETENTION_DAYS) || 30));
  const cleanup = await cleanupOldNews(retentionDays);
  const collection = await collectGamingNewsItems();
  const items = collection.items
    .sort((a, b) => new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime());
  const configuredProviders = [
    ["openrouter", process.env.OPENROUTER_API_KEY],
    ["groq", process.env.GROQ_API_KEY],
    ["huggingface", process.env.HUGGINGFACE_API_KEY],
  ].filter(([, value]) => isUsableAISecret(normalizeAIEnvValue(value))).map(([name]) => name);
  const diagnostics = { ...collection.diagnostics, configuredProviders };
  if (!items.length) {
    return { generated: false, generatedCount: 0, reason: "no_recent_complete_sources", diagnostics, cleanup };
  }
  if (!configuredProviders.length) {
    return { generated: false, generatedCount: 0, reason: "ai_provider_not_configured", diagnostics, cleanup };
  }

  // Publish every new trusted item, not one item per game/day. A small per-run
  // batch protects provider/runtime limits; later cron runs drain the rest.
  const configuredBatch = Number(process.env.GAMING_NEWS_MAX_PER_RUN || "4");
  const maxPerRun = Math.min(10, Math.max(1, Number.isFinite(configuredBatch) ? Math.floor(configuredBatch) : 4));
  const candidates: NewsItem[] = [];
  for (const item of items) {
    if (candidates.length >= maxPerRun) break;
    const sourceKey = `gaming-news-source:${sourceFingerprint([item])}`;
    if (force || !(await hasGenerated(sourceKey))) candidates.push(item);
  }
  if (!candidates.length) {
    return { generated: false, generatedCount: 0, reason: "no_new_trusted_sources", diagnostics, cleanup };
  }

  // Two translations at a time avoids provider bursts while keeping the
  // endpoint comfortably inside the scheduled workflow timeout.
  const results: Awaited<ReturnType<typeof generateNewsFromItem>>[] = [];
  for (let index = 0; index < candidates.length; index += 2) {
    results.push(...await Promise.all(candidates.slice(index, index + 2).map((item) => generateNewsFromItem(item, force))));
  }
  const generated = results.filter((result) => result.generated);
  if (generated.length > 0) {
    await db.update(honors).set({ highlight: false, updatedAt: new Date() })
      .where(and(eq(honors.type, "news"), eq(honors.source, "ai_news")));
    await db.update(honors).set({ highlight: true, updatedAt: new Date() })
      .where(eq(honors.id, generated[0].honorId));
  }
  return {
    generated: generated.length > 0,
    generatedCount: generated.length,
    reason: generated.length ? undefined : "all_source_translations_rejected",
    pendingSourceCount: Math.max(0, items.length - candidates.length),
    items: results,
    diagnostics,
    cleanup,
  };
}
