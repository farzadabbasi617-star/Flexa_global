// Price memory: a learning cache that remembers what similar accounts were
// valued / sold at, so similar future accounts get a fast, grounded estimate.
//
// Idea: bucket each numeric stat into coarse ranges to build a "signature".
// Accounts with the same signature are considered similar. We also keep the raw
// stats to refine similarity (weighted distance) when several rows match.

import { db } from "@/db";
import { priceMemory } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { ESTIMATOR_FIELDS, type EstimatorGame } from "@/lib/price-estimator";
import logger from "@/lib/logger";

export interface MemoryHit {
  priceToman: number;
  minToman: number;
  maxToman: number;
  sampleCount: number;
  saleCount: number; // how many of the samples were real sales
}

// Bucket a value into a coarse band so "similar" accounts collide.
function bucket(value: number): number {
  if (value <= 0) return 0;
  if (value < 10) return value; // small counts: keep exact
  if (value < 100) return Math.round(value / 10) * 10; // nearest 10
  if (value < 1000) return Math.round(value / 50) * 50; // nearest 50
  if (value < 10000) return Math.round(value / 500) * 500;
  return Math.round(value / 5000) * 5000;
}

// Map a field value to a comparable number. For numeric fields this is the
// number itself; for choice fields it's the selected option index (so distinct
// regions / security states never collide in the signature).
function fieldNumeric(
  game: EstimatorGame,
  key: string,
  values: Record<string, number | string>
): number {
  const field = ESTIMATOR_FIELDS[game].find((f) => f.key === key);
  if (field?.kind === "choice" && field.options?.length) {
    const sel = values[key] ?? field.defaultValue;
    const idx = field.options.findIndex((o) => o.value === sel);
    return idx < 0 ? 0 : idx;
  }
  return Number(values[key]) || 0;
}

/** Build a stable signature string from the account stats for a given game. */
export function buildSignature(game: EstimatorGame, values: Record<string, number | string>): string {
  const parts: string[] = [];
  for (const field of ESTIMATOR_FIELDS[game]) {
    const v = fieldNumeric(game, field.key, values);
    // Choice fields keep their exact option index; numeric fields are bucketed.
    parts.push(`${field.key}:${field.kind === "choice" ? v : bucket(v)}`);
  }
  return parts.join("|");
}

/** Weighted similarity distance between two stat maps (lower = more similar). */
function distance(
  game: EstimatorGame,
  a: Record<string, number | string>,
  b: Record<string, number | string>
): number {
  let sum = 0;
  for (const field of ESTIMATOR_FIELDS[game]) {
    const av = fieldNumeric(game, field.key, a);
    const bv = fieldNumeric(game, field.key, b);
    if (field.kind === "choice") {
      sum += av === bv ? 0 : 1; // choice mismatch = maximally different on that axis
      continue;
    }
    const denom = Math.max(av, bv, 1);
    sum += Math.abs(av - bv) / denom; // 0 (identical) .. 1 (very different) per field
  }
  return sum / ESTIMATOR_FIELDS[game].length;
}

/**
 * Look up a fast estimate from memory for a similar account.
 * Returns null if not enough comparable history exists yet.
 */
export async function lookupMemory(
  game: EstimatorGame,
  values: Record<string, number | string>
): Promise<MemoryHit | null> {
  try {
    // Pull recent rows for this game (cap for performance), then rank by similarity.
    const rows = await db
      .select({
        priceToman: priceMemory.priceToman,
        stats: priceMemory.stats,
        origin: priceMemory.origin,
      })
      .from(priceMemory)
      .where(eq(priceMemory.game, game))
      .orderBy(desc(priceMemory.createdAt))
      .limit(400);

    if (!rows.length) return null;

    // Score each row by similarity; keep close matches.
    const scored = rows
      .map((r) => {
        const stats = (r.stats && typeof r.stats === "object" ? r.stats : {}) as Record<string, number | string>;
        return {
          price: Number(r.priceToman) || 0,
          origin: r.origin,
          dist: distance(game, values, stats),
        };
      })
      .filter((s) => s.price > 0 && s.dist <= 0.25) // within 25% average deviation
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 12);

    if (scored.length < 2) return null; // need a small consensus

    // Weight real sales more than AI estimates, and closer matches more.
    let weightSum = 0;
    let priceSum = 0;
    let saleCount = 0;
    const prices: number[] = [];
    for (const s of scored) {
      const originW = s.origin === "sale" ? 2 : 1;
      const closeW = 1 - s.dist; // 0.75..1
      const w = originW * closeW;
      weightSum += w;
      priceSum += s.price * w;
      prices.push(s.price);
      if (s.origin === "sale") saleCount += 1;
    }
    const priceToman = Math.round(priceSum / weightSum);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    return {
      priceToman,
      // Fair band: blend the consensus with the observed spread.
      minToman: Math.round(Math.min(priceToman * 0.9, min)),
      maxToman: Math.round(Math.max(priceToman * 1.1, max)),
      sampleCount: scored.length,
      saleCount,
    };
  } catch (err) {
    logger.warn({ err, game }, "price memory lookup failed");
    return null;
  }
}

/** Remember a valuation/sale so future similar accounts can be priced fast. */
export async function rememberPrice(params: {
  game: EstimatorGame;
  values: Record<string, number | string>;
  priceToman: number;
  origin: "ai" | "sale";
}): Promise<void> {
  const { game, values, priceToman, origin } = params;
  if (!Number.isFinite(priceToman) || priceToman <= 0) return;
  try {
    await db.insert(priceMemory).values({
      game,
      signature: buildSignature(game, values),
      stats: values,
      priceToman: String(Math.round(priceToman)),
      origin,
    });
  } catch (err) {
    logger.warn({ err, game }, "price memory write failed");
  }
}
