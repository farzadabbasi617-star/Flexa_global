import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { priceEstimatorRates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import {
  ESTIMATOR_FIELDS,
  isEstimatorGame,
  getFieldDef,
  type EstimatorGame,
} from "@/lib/price-estimator";
import { parseTomanToRial, bigIntFromText } from "@/lib/money";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET: field definitions + current rates (toman) for admin editing.
export async function GET(request: NextRequest) {
  const { user, error, status } = await requireAdminPermission(request, "store");
  if (!user) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const game = searchParams.get("game") || "";
  if (!isEstimatorGame(game)) {
    return NextResponse.json({ error: "بازی نامعتبر است" }, { status: 400 });
  }

  const rows = await db
    .select({ fieldKey: priceEstimatorRates.fieldKey, unitPriceRial: priceEstimatorRates.unitPriceRial })
    .from(priceEstimatorRates)
    .where(eq(priceEstimatorRates.game, game as EstimatorGame));
  const stored: Record<string, bigint> = {};
  for (const r of rows) stored[r.fieldKey] = bigIntFromText(r.unitPriceRial);

  const fields = ESTIMATOR_FIELDS[game as EstimatorGame]
    .filter((f) => f.kind === "number") // only numeric fields have an editable unit price
    .map((f) => ({
      key: f.key,
      label: f.label,
      unitToman: Number((stored[f.key] ?? BigInt(f.defaultUnitRial ?? 0)) / BigInt(10)),
      isDefault: !(f.key in stored),
    }));

  return NextResponse.json({ game, fields });
}

// PUT: upsert rates. Body: { game, rates: { fieldKey: tomanNumber } }
export async function PUT(request: NextRequest) {
  try {
    const { user, error, status } = await requireAdminPermission(request, "store");
    if (!user) return NextResponse.json({ error }, { status });

    const body = await request.json().catch(() => ({}));
    const game = String(body.game || "");
    if (!isEstimatorGame(game)) {
      return NextResponse.json({ error: "بازی نامعتبر است" }, { status: 400 });
    }
    const rates = (body.rates && typeof body.rates === "object") ? body.rates : {};

    let updated = 0;
    for (const [fieldKey, tomanValue] of Object.entries(rates)) {
      const def = getFieldDef(game as EstimatorGame, fieldKey);
      if (!def || def.kind !== "number") continue; // ignore unknown / non-numeric fields
      const rial = parseTomanToRial(String(tomanValue));
      const value = rial < BigInt(0) ? "0" : rial.toString();

      const [existing] = await db
        .select({ id: priceEstimatorRates.id })
        .from(priceEstimatorRates)
        .where(and(eq(priceEstimatorRates.game, game as EstimatorGame), eq(priceEstimatorRates.fieldKey, fieldKey)))
        .limit(1);

      if (existing) {
        await db
          .update(priceEstimatorRates)
          .set({ unitPriceRial: value, updatedAt: new Date() })
          .where(eq(priceEstimatorRates.id, existing.id));
      } else {
        await db.insert(priceEstimatorRates).values({ game: game as EstimatorGame, fieldKey, unitPriceRial: value });
      }
      updated += 1;
    }

    await logAdminAction({
      adminId: user.id,
      action: "price_estimator_rates_update",
      entityType: "price_estimator",
      entityId: game,
      metadata: { updated },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    logger.error({ err }, "Estimator rates update error");
    return NextResponse.json({ error: "خطا در ذخیره نرخ‌ها" }, { status: 500 });
  }
}
