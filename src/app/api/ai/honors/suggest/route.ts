import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { honors } from "@/db/schema";
import { normalizeAIEnvValue } from "@/lib/ai-provider-manager";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["winner", "runner_up", "levelup", "rankup", "record", "fairplay", "team", "news", "event"]);

function iconForType(type: string) {
  if (type === "winner" || type === "runner_up" || type === "record") return "🏆";
  if (type === "levelup" || type === "rankup") return "⚡";
  if (type === "fairplay") return "🤝";
  if (type === "team") return "🛡️";
  if (type === "event") return "🎉";
  return "📰";
}

function text(value: unknown, max = 255) {
  return String(value ?? "").trim().slice(0, max);
}

function isAuthorized(request: NextRequest) {
  const secret = normalizeAIEnvValue(process.env.HONORS_AI_SECRET || process.env.TELEGRAM_INTEGRATION_SECRET);
  if (!secret || secret.length < 12) return false;
  const auth = request.headers.get("authorization") || "";
  const headerSecret = request.headers.get("x-flexa-ai-secret") || "";
  return auth === `Bearer ${secret}` || headerSecret === secret;
}

// Internal endpoint for AI/automation to suggest a Hall of Fame item.
// Suggestions are always stored as pending and must be approved by an admin.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Every accepted call writes a pending row that a human then has to review.
  // A stuck or misconfigured automation loop would otherwise flood the admin
  // queue and the honors table unbounded. Generous enough for legitimate
  // batch runs, low enough to stop a runaway.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = await rateLimit(`ai-honor-suggest:${ip}`, 30, 60 * 1000);
  if (!limit.success) {
    return NextResponse.json(
      { error: "Too many honor suggestions. Try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const typeRaw = text(body.type || "news", 30);
    const type = ALLOWED_TYPES.has(typeRaw) ? typeRaw : "news";
    const title = text(body.title, 255);
    const description = text(body.description, 5000);
    if (!title || !description) return NextResponse.json({ error: "title and description required" }, { status: 400 });

    const level = body.level === undefined || body.level === null || body.level === "" ? null : Number(body.level);
    const [created] = await db
      .insert(honors)
      .values({
        type,
        title,
        description,
        status: "pending",
        icon: text(body.icon || iconForType(type), 20),
        imageUrl: text(body.imageUrl || body.image, 1000) || null,
        prize: text(body.prize, 120) || null,
        username: text(body.username, 100) || null,
        level: Number.isFinite(level) ? Math.max(0, Math.round(Number(level))) : null,
        highlight: Boolean(body.highlight),
        game: text(body.game, 50) || null,
        source: "ai_suggestion",
        metadata: { rawPayload: body },
      })
      .returning();

    return NextResponse.json({
      success: true,
      message: "پیشنهاد هوش مصنوعی ثبت شد و در انتظار تأیید مدیر است.",
      honor: { ...created, image: created.imageUrl },
    }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "AI honor suggestion failed");
    return NextResponse.json({ error: "Honor suggestion failed" }, { status: 500 });
  }
}
