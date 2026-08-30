import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { priceEstimatorRates } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  ESTIMATOR_FIELDS,
  computeEstimate,
  isEstimatorGame,
  type EstimatorGame,
} from "@/lib/price-estimator";
import { estimateAccountPrice } from "@/lib/ai-price-estimator";
import { bigIntFromText } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";
// AI + live scraping can take a while.
export const maxDuration = 60;

// Resolve effective unit prices (admin overrides on top of defaults).
async function resolveUnitPrices(game: EstimatorGame): Promise<Record<string, bigint>> {
  const map: Record<string, bigint> = {};
  for (const f of ESTIMATOR_FIELDS[game]) {
    if (f.kind === "number") map[f.key] = BigInt(f.defaultUnitRial ?? 0);
  }
  try {
    const rows = await db
      .select({ fieldKey: priceEstimatorRates.fieldKey, unitPriceRial: priceEstimatorRates.unitPriceRial })
      .from(priceEstimatorRates)
      .where(eq(priceEstimatorRates.game, game));
    for (const r of rows) map[r.fieldKey] = bigIntFromText(r.unitPriceRial);
  } catch (err) {
    logger.warn({ err, game }, "price estimator rates load failed; using defaults");
  }
  return map;
}

// GET: field definitions + current unit prices (toman) for a game.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const game = searchParams.get("game") || "";
  if (!isEstimatorGame(game)) {
    return NextResponse.json({ error: "بازی نامعتبر است" }, { status: 400 });
  }
  const unit = await resolveUnitPrices(game);
  const fields = ESTIMATOR_FIELDS[game].map((f) => ({
    key: f.key,
    label: f.label,
    kind: f.kind,
    min: f.min ?? 0,
    hint: f.hint ?? null,
    // Number fields: per-unit price (toman). Choice fields don't add value directly.
    unitToman: f.kind === "number" ? Number((unit[f.key] ?? BigInt(0)) / BigInt(10)) : 0,
    options: f.kind === "choice" ? (f.options ?? []) : undefined,
    defaultValue: f.kind === "choice" ? (f.defaultValue ?? f.options?.[0]?.value) : undefined,
  }));
  return NextResponse.json({ game, fields });
}

// POST: compute an estimate.
//   Body: { game, values: { fieldKey: count }, mode?: "formula" | "ai" }
//   - "formula" (default): instant deterministic sum.
//   - "ai": AI-backed fair price using live Divar/Sheypoor comparables.
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

    const body = await request.json().catch(() => ({}));
    const game = String(body.game || "");
    const mode = body.mode === "ai" ? "ai" : "formula";
    if (!isEstimatorGame(game)) {
      return NextResponse.json({ error: "بازی نامعتبر است" }, { status: 400 });
    }

    // Heavier limit for AI (scraping + model call); lighter for the formula.
    const limit =
      mode === "ai"
        ? await rateLimit(`price-estimate:ai:${ip}`, 8, 60 * 1000)
        : await rateLimit(`price-estimate:${ip}`, 60, 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است. کمی بعد دوباره امتحان کنید." }, { status: 429 });
    }

    const rawValues = (body.values && typeof body.values === "object") ? body.values : {};
    const values: Record<string, number | string> = {};
    for (const f of ESTIMATOR_FIELDS[game]) {
      if (f.kind === "choice") {
        // Validate the selected option; fall back to the default.
        const sel = String(rawValues[f.key] ?? "");
        const ok = f.options?.some((o) => o.value === sel);
        values[f.key] = ok ? sel : (f.defaultValue ?? f.options?.[0]?.value ?? "");
        continue;
      }
      const n = Number(rawValues[f.key]);
      values[f.key] = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 100_000_000) : 0;
    }

    const unit = await resolveUnitPrices(game);

    if (mode === "ai") {
      const result = await estimateAccountPrice({ game, values, unitPrices: unit });
      return NextResponse.json({
        game,
        priceToman: result.priceToman,
        minToman: result.minToman,
        maxToman: result.maxToman,
        rationale: result.rationale,
        source: result.source,
        comparablesCount: result.comparablesCount,
      });
    }

    const totalRial = computeEstimate(game, values, unit);
    return NextResponse.json({
      game,
      priceRial: totalRial.toString(),
      priceToman: Number(totalRial / BigInt(10)),
      source: "formula",
    });
  } catch (err) {
    logger.error({ err }, "Price estimate error");
    return NextResponse.json({ error: "خطا در محاسبه قیمت" }, { status: 500 });
  }
}
