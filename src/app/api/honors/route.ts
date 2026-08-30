import { NextResponse } from "next/server";
import { db } from "@/db";
import { honorContentLikes, honorContentViews, honors } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import logger from "@/lib/logger";
import { STATIC_HONORS } from "@/lib/static-honors";
import { publicCacheHeaders, ttlCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

function iconForType(type: string) {
  if (type === "winner" || type === "runner_up" || type === "record") return "🏆";
  if (type === "levelup" || type === "rankup") return "⚡";
  if (type === "fairplay") return "🤝";
  if (type === "team") return "🛡️";
  if (type === "event") return "🎉";
  return "📰";
}

function metadataObject(metadata: unknown): Record<string, any> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, any> : {};
}


async function engagementCounts(honorIds: string[]) {
  if (!honorIds.length) return new Map<string, { likes: number; views: number }>();
  try {
    const [viewRows, likeRows] = await Promise.all([
      db.select({ honorId: honorContentViews.contentId, count: sql<number>`count(*)::int` }).from(honorContentViews).where(inArray(honorContentViews.contentId, honorIds)).groupBy(honorContentViews.contentId),
      db.select({ honorId: honorContentLikes.contentId, count: sql<number>`count(*)::int` }).from(honorContentLikes).where(inArray(honorContentLikes.contentId, honorIds)).groupBy(honorContentLikes.contentId),
    ]);
    const map = new Map<string, { likes: number; views: number }>();
    for (const id of honorIds) map.set(id, { likes: 0, views: 0 });
    for (const row of viewRows) map.set(row.honorId, { ...(map.get(row.honorId) || { likes: 0, views: 0 }), views: Number(row.count || 0) });
    for (const row of likeRows) map.set(row.honorId, { ...(map.get(row.honorId) || { likes: 0, views: 0 }), likes: Number(row.count || 0) });
    return map;
  } catch (err) {
    logger.warn({ err }, "Honor engagement counts unavailable");
    return new Map<string, { likes: number; views: number }>();
  }
}

function activeStaticHonors() {
  const newsThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return STATIC_HONORS.filter((item) => {
    if (item.type !== "news") return true;
    const published = new Date(item.publishedAt || item.createdAt || 0).getTime();
    return Number.isFinite(published) && published >= newsThreshold;
  });
}

function relativeTime(date: Date | string | null | undefined) {
  if (!date) return "به‌تازگی";
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `${minutes.toLocaleString("fa-IR")} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours.toLocaleString("fa-IR")} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days.toLocaleString("fa-IR")} روز پیش`;
  return new Date(date).toLocaleDateString("fa-IR");
}

export async function GET() {
  try {
    const payload = await ttlCache("public-honors", 60_000, async () => {
      const currentStaticHonors = activeStaticHonors();
      const staticCounts = await engagementCounts(currentStaticHonors.map((item) => item.id));
      const staticRows = currentStaticHonors.map((item) => ({
        ...item,
        time: relativeTime(item.publishedAt || item.createdAt),
        likesCount: staticCounts.get(item.id)?.likes || 0,
        viewsCount: staticCounts.get(item.id)?.views || 0,
      }));

      // مدت نمایش خبر در تالار افتخارات — پیش‌فرض ۳۰ روز، با GAMING_NEWS_RETENTION_DAYS قابل تنظیم
      const newsRetentionDays = Math.max(1, Math.floor(Number(process.env.GAMING_NEWS_RETENTION_DAYS) || 30));
      const rows = await db
        .select()
        .from(honors)
        .where(and(
          eq(honors.status, "approved"),
          sql`(${honors.source} <> 'ai_news' OR COALESCE(${honors.publishedAt}, ${honors.createdAt}) >= NOW() - (${newsRetentionDays}::int * INTERVAL '1 day'))`,
        ))
        .orderBy(desc(honors.publishedAt), desc(honors.createdAt))
        .limit(100);

      const counts = await engagementCounts(rows.map((row) => row.id));

      const dbRows = rows.map((row) => ({
        id: row.id,
        type: row.type,
        icon: row.icon || iconForType(row.type),
        title: row.title,
        description: row.description,
        time: relativeTime(row.publishedAt || row.createdAt),
        prize: row.prize || undefined,
        username: row.username || undefined,
        level: row.level || undefined,
        highlight: row.highlight,
        image: row.imageUrl || undefined,
        imageAlt: metadataObject(row.metadata).imageAlt || row.title,
        summary: metadataObject(row.metadata).summary || undefined,
        seoKeywords: metadataObject(row.metadata).seoKeywords || [],
        readTimeMinutes: metadataObject(row.metadata).readTimeMinutes || undefined,
        sources: metadataObject(row.metadata).sources || [],
        galleryImages: metadataObject(row.metadata).galleryImages || [],
        game: row.game || undefined,
        publishedAt: row.publishedAt,
        likesCount: counts.get(row.id)?.likes || 0,
        viewsCount: counts.get(row.id)?.views || 0,
      }));

      return [...staticRows, ...dbRows].sort((a, b) => {
        const aTime = new Date(a.publishedAt || 0).getTime();
        const bTime = new Date(b.publishedAt || 0).getTime();
        return bTime - aTime;
      });
    });

    return NextResponse.json(payload, { headers: publicCacheHeaders(60, 300) });
  } catch (err) {
    logger.error({ err }, "Public honors GET failed");
    return NextResponse.json(activeStaticHonors().map((item) => ({ ...item, time: relativeTime(item.publishedAt || item.createdAt), likesCount: 0, viewsCount: 0 })), { status: 200, headers: publicCacheHeaders(30, 120) });
  }
}
