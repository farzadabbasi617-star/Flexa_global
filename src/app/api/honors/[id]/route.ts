import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { honorContentLikes, honorContentViews, honors } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import logger from "@/lib/logger";
import { getStaticHonorById } from "@/lib/static-honors";

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


async function engagementCount(honorId: string) {
  try {
    const [viewsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(honorContentViews).where(eq(honorContentViews.contentId, honorId));
    const [likesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(honorContentLikes).where(eq(honorContentLikes.contentId, honorId));
    return { viewsCount: Number(viewsRow?.count || 0), likesCount: Number(likesRow?.count || 0) };
  } catch (err) {
    logger.warn({ err, honorId }, "Honor engagement count unavailable");
    return { viewsCount: 0, likesCount: 0 };
  }
}

function newsExpired(date: Date | string | null | undefined) {
  const published = new Date(date || 0).getTime();
  return !Number.isFinite(published) || published < Date.now() - 7 * 24 * 60 * 60 * 1000;
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

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const staticHonor = getStaticHonorById(id);
    if (staticHonor) {
      if (staticHonor.type === "news" && newsExpired(staticHonor.publishedAt || staticHonor.createdAt)) {
        return NextResponse.json({ error: "Honor not found" }, { status: 404 });
      }
      const engagement = await engagementCount(staticHonor.id);
      return NextResponse.json({
        ...staticHonor,
        time: relativeTime(staticHonor.publishedAt || staticHonor.createdAt),
        ...engagement,
      });
    }

    const [row] = await db
      .select()
      .from(honors)
      .where(and(eq(honors.id, id), eq(honors.status, "approved")))
      .limit(1);

    if (!row) return NextResponse.json({ error: "Honor not found" }, { status: 404 });

    const engagement = await engagementCount(row.id);

    return NextResponse.json({
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
      createdAt: row.createdAt,
      ...engagement,
    });
  } catch (err) {
    logger.error({ err }, "Public honor detail GET failed");
    return NextResponse.json({ error: "Honor load failed" }, { status: 500 });
  }
}
