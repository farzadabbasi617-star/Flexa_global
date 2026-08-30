// Gathers comparable account/price listings from multiple Iranian sources.
// Each source is best-effort and isolated so one failing site never breaks the
// rest. Easy to extend: add an entry to SOURCES.

import {
  scrapeDivarCity,
  scrapeSheypoorCity,
  fetchHtml,
  type ScrapedAd,
} from "@/lib/classified-scraper";
import logger from "@/lib/logger";

export interface Comparable {
  source: string;
  title: string;
  price?: string;
  snippet?: string;
  url?: string;
}

export type EstimatorGame = "cod_mobile" | "clash_royale" | "fortnite";

const SEARCH_TERMS: Record<EstimatorGame, string> = {
  cod_mobile: "اکانت کالاف دیوتی موبایل",
  clash_royale: "اکانت کلش رویال",
  fortnite: "اکانت فورتنایت",
};

function adToComparable(a: ScrapedAd, source: string): Comparable {
  return { source, title: a.title, price: a.price, snippet: a.description?.slice(0, 160), url: a.url };
}

// Generic Torob search (price-aggregator). Best-effort HTML parsing.
async function fetchTorob(game: EstimatorGame, limit: number): Promise<Comparable[]> {
  const q = encodeURIComponent(SEARCH_TERMS[game]);
  const html = await fetchHtml(`https://torob.com/search/?query=${q}`).catch(() => null);
  if (!html) return [];
  const out: Comparable[] = [];
  // Torob renders product cards with names and Toman prices; grab visible pairs.
  const priceMatches = Array.from(
    html.matchAll(/([\u0600-\u06FF\w\s\-]{6,80}?)[^<]{0,40}?(\d{1,3}(?:,\d{3})+)\s*USDT/g)
  );
  const seen = new Set<string>();
  for (const m of priceMatches) {
    const title = m[1].trim().replace(/\s+/g, " ");
    if (!title || seen.has(title)) continue;
    seen.add(title);
    out.push({ source: "torob", title, price: `${m[2]} USDT` });
    if (out.length >= limit) break;
  }
  return out;
}

// A couple of well-known Iranian game-account shops can be probed generically.
// We only parse public search/category HTML for title+price text.
// These Iranian shops are reachable from foreign hosts (unlike Divar/Sheypoor),
// though some render prices via JS so results may be partial.
const SHOP_SOURCES: Array<{ name: string; url: (q: string) => string }> = [
  { name: "arzangem", url: (q) => `https://arzangem.com/?s=${q}` },
  { name: "subgame", url: (q) => `https://subgame.ir/?s=${q}` },
  { name: "teleplayer", url: (q) => `https://teleplayer.org/?s=${q}` },
  { name: "getgame", url: (q) => `https://getgame.ir/?s=${q}` },
];

async function fetchShop(name: string, url: string, limit: number): Promise<Comparable[]> {
  const html = await fetchHtml(url).catch(() => null);
  if (!html) return [];
  const out: Comparable[] = [];
  const priceMatches = Array.from(
    html.matchAll(/([\u0600-\u06FF\w\s\-]{6,80}?)[^<]{0,40}?(\d{1,3}(?:,\d{3})+)\s*USDT/g)
  );
  const seen = new Set<string>();
  for (const m of priceMatches) {
    const title = m[1].trim().replace(/\s+/g, " ");
    if (!title || seen.has(title)) continue;
    seen.add(title);
    out.push({ source: name, title, price: `${m[2]} USDT` });
    if (out.length >= limit) break;
  }
  return out;
}

/**
/** Wrap a promise with a hard timeout so one slow/blocked source can't stall us. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(fallback);
      }
    }, ms);
    p.then((v) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(v);
      }
    }).catch(() => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(fallback);
      }
    });
  });
}

/**
 * Collect comparables from all sources in parallel. Returns a flat, de-duplicated
 * list capped at `max`. Never throws and never blocks longer than `perSourceMs`.
 *
 * NOTE: Divar/Sheypoor geo-block non-Iran servers, so from a foreign host these
 * will simply time out and return []. The estimator then relies on the AI model's
 * market knowledge. Set CLASSIFIED_PROXY_URL (Iran proxy) to enable live scraping.
 */
export async function gatherComparables(game: EstimatorGame, max = 18, perSourceMs = 6000): Promise<Comparable[]> {
  const term = SEARCH_TERMS[game];
  const per = 8;

  const tasks: Array<Promise<Comparable[]>> = [
    withTimeout(
      scrapeDivarCity("tehran", { limit: per, query: term }).then((ads) => ads.map((a) => adToComparable(a, "divar"))),
      perSourceMs,
      []
    ),
    withTimeout(
      scrapeSheypoorCity("tehran", { limit: per, query: term }).then((ads) => ads.map((a) => adToComparable(a, "sheypoor"))),
      perSourceMs,
      []
    ),
    withTimeout(fetchTorob(game, per), perSourceMs, []),
    ...SHOP_SOURCES.map((s) =>
      withTimeout(fetchShop(s.name, s.url(encodeURIComponent(term)), 6), perSourceMs, [])
    ),
  ];

  const results = await Promise.allSettled(tasks);
  const flat: Comparable[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") flat.push(...r.value);
  }

  // Keep only entries with a price, de-dupe by title, cap the total.
  const seen = new Set<string>();
  const withPrice = flat.filter((c) => {
    if (!c.price) return false;
    const key = c.title.slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return withPrice.slice(0, max);
}

export function comparablesToText(items: Comparable[]): string {
  if (!items.length) return "هیچ آگهی مشابهی در حال حاضر یافت نشد.";
  return items
    .map((c, i) => `${i + 1}. [${c.source}] ${c.title}${c.price ? ` — ${c.price}` : ""}${c.snippet ? `\n   ${c.snippet}` : ""}`)
    .join("\n");
}
