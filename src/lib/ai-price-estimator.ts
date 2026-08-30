// AI-powered account price estimator.
//
// Strategy:
//  1. Build a human-readable description of the account from the entered stats.
//  2. Gather a few comparable reference prices for the same game (best-effort).
//  3. Ask the AI model to weigh the account's items/level/currency against those
//     references and return a fair price (in Toman) + a short rationale.
//  4. If AI is unavailable or returns nothing usable, fall back to the
//     deterministic formula (count * unit price).

import { fetchAIResponse } from "@/lib/ai-provider-manager";
import { gatherComparables, comparablesToText, type Comparable } from "@/lib/market-comparables";
import { lookupMemory, rememberPrice } from "@/lib/price-memory";
import {
  ESTIMATOR_FIELDS,
  computeEstimate,
  type EstimatorGame,
} from "@/lib/price-estimator";
import { buildEstimatorSystemPrompt } from "@/lib/price-estimator-knowledge";
import logger from "@/lib/logger";

const GAME_LABEL: Record<EstimatorGame, string> = {
  cod_mobile: "کالاف دیوتی موبایل (Call of Duty Mobile)",
  clash_royale: "کلش رویال (Clash Royale)",
  fortnite: "فورتنایت (Fortnite)",
};

export interface AiEstimateResult {
  priceToman: number;
  /** Fair range to display (min/max around the point estimate). */
  minToman: number;
  maxToman: number;
  rationale: string;
  /** "memory" = matched similar past valuations/sales, "ai" = model, "formula" = fallback. */
  source: "memory" | "ai" | "formula";
  comparablesCount: number;
  /** Distinct market sources the comparables came from (divar, sheypoor, torob, ...). */
  sources: string[];
  /** Which AI provider/model produced the price (for transparency). */
  aiModel?: string;
}

/** Turn the entered stats (numbers + selected options) into a readable Persian description. */
function describeAccount(game: EstimatorGame, values: Record<string, number | string>): string {
  const lines: string[] = [];
  for (const field of ESTIMATOR_FIELDS[game]) {
    const raw = values[field.key];
    if (field.kind === "choice") {
      const opt = field.options?.find((o) => o.value === raw) ?? field.options?.find((o) => o.value === field.defaultValue);
      if (opt) lines.push(`- ${field.label}: ${opt.label}`);
      continue;
    }
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      lines.push(`- ${field.label}: ${Math.floor(n).toLocaleString("fa-IR")}`);
    }
  }
  return lines.length ? lines.join("\n") : "- اطلاعاتی وارد نشده است";
}

/**
 * Remove any third-party source / shop names from the rationale shown to the
 * user, so the explanation never reveals where prices were referenced from.
 */
function sanitizeRationale(text: string): string {
  let out = text;
  // Known site/source names (and their Persian spellings) — never surfaced.
  const names = [
    /دیوار/g,
    /شیپور/g,
    /\bترب\b/g,
    /وی[‌ ]?جی[‌ ]?استور/g,
    /vg[- ]?store/gi,
    /arzangem|ارزان[‌ ]?جم/gi,
    /subgame|ساب[‌ ]?گیم/gi,
    /teleplayer|تله[‌ ]?پلیر/gi,
    /getgame|گت[‌ ]?گیم/gi,
    /divar|sheypoor|torob/gi,
  ];
  for (const re of names) out = out.replace(re, "بازار");
  // Collapse phrases like "بر اساس آگهی‌های بازار/بازار" left behind.
  out = out.replace(/(بازار)([،\s]+بازار)+/g, "$1");
  return out;
}

/**
 * Round a Toman amount to a "nice" human-friendly number so the displayed
 * range looks like a price (e.g. 2,350,000 not 2,347,812).
 */
function roundNice(n: number, dir: "down" | "up" | "near" = "near"): number {
  if (n <= 0) return 0;
  // Pick a rounding step based on magnitude.
  let step = 1000;
  if (n >= 50_000_000) step = 1_000_000;
  else if (n >= 10_000_000) step = 500_000;
  else if (n >= 2_000_000) step = 100_000;
  else if (n >= 500_000) step = 50_000;
  else if (n >= 100_000) step = 10_000;
  else step = 5_000;
  const q = n / step;
  const r = dir === "down" ? Math.floor(q) : dir === "up" ? Math.ceil(q) : Math.round(q);
  return Math.max(step, r * step) ;
}

/**
 * Build a fair price RANGE around a point estimate. We deliberately return a
 * range (not a single number) so the buyer can offer a price within it and the
 * seller can accept or reject. Range is ~15% below to ~20% above the midpoint,
 * snapped to nice round numbers.
 */
function priceRange(midToman: number): { minToman: number; maxToman: number } {
  const min = roundNice(midToman * 0.85, "down");
  const max = roundNice(midToman * 1.2, "up");
  // Guarantee min < max even for tiny numbers.
  return { minToman: Math.min(min, max), maxToman: Math.max(min, max, min + 1000) };
}

/** Extract the first integer Toman value from a free-form AI text. */
function parseTomanFromText(text: string): number | null {
  // Prefer an explicit JSON-ish "price": number
  const jsonMatch = text.match(/"?(?:price|قیمت|priceToman)"?\s*[:=]\s*"?([\d,]+)/i);
  const candidate = jsonMatch?.[1] || (text.match(/([\d]{1,3}(?:[,،]\d{3})+|\d{5,})/)?.[1] ?? "");
  const digits = candidate.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Main entry: returns a fair AI-backed estimate, or a formula-based fallback.
 * `unitPrices` is the resolved per-field RIAL map (admin overrides + defaults),
 * used both for the formula fallback and as a baseline hint to the AI.
 */
export async function estimateAccountPrice(params: {
  game: EstimatorGame;
  values: Record<string, number | string>;
  unitPrices: Record<string, bigint>;
}): Promise<AiEstimateResult> {
  const { game, values, unitPrices } = params;

  // Deterministic baseline (also the fallback).
  const formulaRial = computeEstimate(game, values, unitPrices);
  const formulaToman = Number(formulaRial / BigInt(10));

  const fallback = (extra?: Partial<AiEstimateResult>): AiEstimateResult => ({
    priceToman: formulaToman,
    ...priceRange(formulaToman),
    rationale: "این بازه بر اساس فرمول پایه‌ی پلتفرم محاسبه شده است (ارزیابی هوشمند در دسترس نبود).",
    source: "formula",
    comparablesCount: 0,
    sources: [],
    ...extra,
  });

  // 1) FAST PATH — learning memory: if we've valued/sold similar accounts before,
  //    return a grounded estimate instantly (no scraping, no model call).
  try {
    const hit = await lookupMemory(game, values);
    if (hit) {
      const rationale =
        hit.saleCount > 0
          ? `این بازه بر اساس ${hit.sampleCount.toLocaleString("fa-IR")} اکانت مشابه (شامل ${hit.saleCount.toLocaleString("fa-IR")} فروش واقعی) تخمین زده شده است.`
          : `این بازه بر اساس ${hit.sampleCount.toLocaleString("fa-IR")} اکانت مشابه که قبلاً ارزیابی شده‌اند تخمین زده شده است.`;
      return {
        priceToman: hit.priceToman,
        ...priceRange(hit.priceToman),
        rationale,
        source: "memory",
        comparablesCount: hit.sampleCount,
        sources: ["memory"],
      };
    }
  } catch {
    // ignore memory errors; fall through to AI
  }

  try {
    // 2) Gather comparables from reachable Iranian shops (best-effort).
    const comparables: Comparable[] = await gatherComparables(game).catch(() => []);
    const sources = [...new Set(comparables.map((c) => c.source))];
    const accountDesc = describeAccount(game, values);

    const hasMarketData = comparables.length > 0;

    // Full expert pricing knowledge (logic + per-game importance + few-shot examples).
    const systemPrompt = buildEstimatorSystemPrompt(game, hasMarketData);

    const marketBlock = hasMarketData
      ? `قیمت‌های مرجع روز بازار ایران برای اکانت‌های مشابه:\n${comparablesToText(comparables)}\n\n`
      : "";

    const userPrompt =
      `بازی: ${GAME_LABEL[game]}\n\n` +
      `مشخصات اکانت برای فروش:\n${accountDesc}\n\n` +
      `قیمت پایه‌ی تخمینی پلتفرم (صرفاً برای مرجع، نه لزوماً درست): ${formulaToman.toLocaleString("fa-IR")} USDT\n\n` +
      marketBlock +
      `یک قیمت منصفانه و دقیق و مطابق بازار روز ایران برای این اکانت تعیین کن.`;

    // Uses the project's multi-provider auto-switch (OpenRouter models -> Groq).
    const ai = await fetchAIResponse(userPrompt, systemPrompt);
    const aiText = ai?.content;
    if (!aiText) return fallback({ comparablesCount: comparables.length, sources });

    const aiModel = ai?.model ? `${ai.provider}/${ai.model}` : ai?.provider;
    const aiPrice = parseTomanFromText(aiText);
    if (!aiPrice) {
      return fallback({
        rationale: aiText.slice(0, 600),
        comparablesCount: comparables.length,
        sources,
        aiModel,
      });
    }

    // Strip the leading "PRICE: ..." line + any source/site names from the
    // rationale shown to users (we never reveal where prices are referenced from).
    const rationale =
      sanitizeRationale(aiText.replace(/^.*PRICE\s*[:=].*$/im, "")).trim().slice(0, 600) ||
      "قیمت بر اساس ارزش آیتم‌ها و وضعیت اکانت تعیین شد.";

    // Remember this AI valuation so similar future accounts get a fast estimate.
    void rememberPrice({ game, values, priceToman: aiPrice, origin: "ai" });

    return {
      priceToman: aiPrice,
      ...priceRange(aiPrice),
      rationale,
      source: "ai",
      comparablesCount: comparables.length,
      sources,
      aiModel,
    };
  } catch (err) {
    logger.error({ err, game }, "AI price estimation failed; using formula fallback");
    return fallback();
  }
}
