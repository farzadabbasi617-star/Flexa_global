import { NextResponse } from "next/server";
import { db } from "@/db";
import { siteImages } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { publicCacheHeaders, ttlCache } from "@/lib/server-cache";
import logger from "@/lib/logger";

// Keep this route dynamic so `next build` never requires a live production
// database. The in-process TTL plus CDN response headers still prevent a DB
// round trip on every navigation.
export const dynamic = "force-dynamic";

async function loadBackground() {
  return ttlCache("public:app-background", 300_000, async () => {
    let images = await db
      .select()
      .from(siteImages)
      .where(and(
        sql`slug IN ('app-background', 'app-bg')`,
        eq(siteImages.isActive, true),
      ));

    if (images.length === 0) {
      images = await db
        .select()
        .from(siteImages)
        .where(and(
          eq(siteImages.slug, "background"),
          eq(siteImages.isActive, true),
        ));
    }

    const background = images[0];
    return background?.url
      ? { url: background.url, slug: background.slug, title: background.title }
      : { url: null };
  });
}

export async function GET() {
  try {
    const payload = await loadBackground();
    return NextResponse.json(payload, { headers: publicCacheHeaders(300, 600) });
  } catch (error) {
    // A custom background is decorative and must not break the whole app when
    // Postgres has a transient problem. `/api/health` remains the authoritative
    // database readiness signal.
    logger.error({ error }, "Public background lookup failed");
    return NextResponse.json(
      { url: null },
      { headers: publicCacheHeaders(30, 60) },
    );
  }
}
