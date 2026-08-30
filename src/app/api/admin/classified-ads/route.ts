import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classifiedAds } from "@/db/schema";
import { runClassifiedScrape } from "@/lib/classified-scraper";
import { requireRole } from "@/lib/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireRole(request, ["admin", "super_admin"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") || "new";
  const platform = searchParams.get("platform") || undefined;
  const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
  const offset = Math.max(Number(searchParams.get("offset") || "0"), 0);

  const where = [];
  if (status !== "all") where.push(eq(classifiedAds.status, status));
  if (platform) where.push(eq(classifiedAds.platform, platform));

  const rows = await db
    .select()
    .from(classifiedAds)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(classifiedAds.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ ok: true, data: rows, count: rows.length, limit, offset });
}

export async function POST(request: NextRequest) {
  const user = await requireRole(request, ["admin", "super_admin"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => ({}))) as {
      platforms?: ("divar" | "sheypoor")[];
      cities?: string[];
      limitPerCity?: number;
      allCities?: boolean;
    };
    const results = await runClassifiedScrape({
      platforms: body.platforms,
      cities: body.cities,
      limitPerCity: Math.min(body.limitPerCity || 5, 10),
      allCities: body.allCities,
    });
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    logger.error({ err }, "Classified ads scrape failed");
    return NextResponse.json({ error: "Scrape failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireRole(request, ["admin", "super_admin"]);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { id?: string; status?: string; adminNote?: string };
  if (!body.id || !body.status) return NextResponse.json({ error: "id and status required" }, { status: 400 });

  await db
    .update(classifiedAds)
    .set({ status: body.status, adminNote: body.adminNote || null, updatedAt: new Date() })
    .where(eq(classifiedAds.id, body.id));

  return NextResponse.json({ ok: true });
}
