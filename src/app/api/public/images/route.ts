import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteImages } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { publicCacheHeaders, ttlCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get("category");

    const conditions = [eq(siteImages.isActive, true)];
    if (category) {
      conditions.push(eq(siteImages.category, category));
    }

    const cacheKey = `public-images:${category || "all"}`;
    const images = await ttlCache(cacheKey, 60_000, () => db
      .select()
      .from(siteImages)
      .where(and(...conditions))
      .orderBy(asc(siteImages.sortOrder)));

    return NextResponse.json(images, { headers: publicCacheHeaders(60, 300) });
  } catch {
    return NextResponse.json([]);
  }
}
