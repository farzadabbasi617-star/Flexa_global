import { NextResponse } from "next/server";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { honors } from "@/db/schema";
import { isUsableAISecret, normalizeAIEnvValue } from "@/lib/ai-provider-manager";
import { newsMaxAgeHours } from "@/lib/gaming-news-generator";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const configuredProviders = [
      ["openrouter", process.env.OPENROUTER_API_KEY],
      ["groq", process.env.GROQ_API_KEY],
      ["huggingface", process.env.HUGGINGFACE_API_KEY],
    ].filter(([, value]) => isUsableAISecret(normalizeAIEnvValue(value))).map(([name]) => name);
    const [latestRows, activeRows] = await Promise.all([
      db.select({
        id: honors.id,
        title: honors.title,
        game: honors.game,
        publishedAt: honors.publishedAt,
      }).from(honors).where(and(
        eq(honors.type, "news"),
        eq(honors.source, "ai_news"),
        eq(honors.status, "approved"),
      )).orderBy(desc(honors.publishedAt), desc(honors.createdAt)).limit(1),
      db.select({ value: count() }).from(honors).where(and(
        eq(honors.type, "news"),
        eq(honors.source, "ai_news"),
        eq(honors.status, "approved"),
      )),
    ]);
    return NextResponse.json({
      ok: true,
      sourcePolicy: "official_source_text_and_first_party_image",
      sourceMaxAgeHours: newsMaxAgeHours(),
      retentionDays: 7,
      configuredProviders,
      aiConfigured: configuredProviders.length > 0,
      officialIndexes: ["supercell_clash_royale", "callofduty_mobile", "fortnite_epic"],
      configuredDiscord: Boolean(normalizeAIEnvValue(process.env.DISCORD_BOT_TOKEN) && process.env.DISCORD_CHANNEL_IDS),
      configuredTelegram: Boolean(process.env.GAMING_NEWS_TELEGRAM_CHANNELS?.trim()),
      activeAutoNews: Number(activeRows[0]?.value || 0),
      latest: latestRows[0] || null,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logger.error({ error }, "Gaming news status endpoint failed");
    return NextResponse.json({ ok: false, error: "status_unavailable" }, { status: 500 });
  }
}
