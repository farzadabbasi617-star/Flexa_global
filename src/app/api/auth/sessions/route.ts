import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function getClientMeta(request: NextRequest) {
  return {
    token: request.cookies.get("session")?.value || "",
    ip: request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown",
    ua: request.headers.get("user-agent") || "unknown",
  };
}

function deviceName(userAgent: string | null) {
  const ua = userAgent || "";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ios/i.test(ua)) return "iOS";
  if (/windows/i.test(ua)) return "Windows";
  if (/macintosh|mac os/i.test(ua)) return "Mac";
  if (/linux/i.test(ua)) return "Linux";
  return "Unknown device";
}

export async function GET(request: NextRequest) {
  try {
    const meta = getClientMeta(request);
    const user = await validateSession(meta.token, meta.ip, meta.ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));

    return NextResponse.json({
      sessions: rows
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((session) => ({
          id: session.id,
          isCurrent: session.token === meta.token,
          device: deviceName(session.userAgent),
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
        })),
    });
  } catch (err) {
    logger.error({ err }, "List sessions failed");
    return NextResponse.json({ error: "Failed to load sessions" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const meta = getClientMeta(request);
    const user = await validateSession(meta.token, meta.ip, meta.ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const sessionId = body.sessionId ? String(body.sessionId) : "";
    const allOthers = Boolean(body.allOthers);

    if (allOthers) {
      await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.token, meta.token)));
      return NextResponse.json({ success: true, scope: "others" });
    }

    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

    const [target] = await db.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id))).limit(1);
    if (!target) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (target.token === meta.token) return NextResponse.json({ error: "برای خروج از نشست فعلی از دکمه خروج استفاده کن." }, { status: 400 });

    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Delete session failed");
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
