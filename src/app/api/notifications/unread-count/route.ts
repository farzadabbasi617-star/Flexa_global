import { NextRequest, NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { validateSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Just the unread badge number.
 *
 * The badge used to call GET /api/notifications?limit=1, which runs a total
 * count, an unread count and a page query, then serialises a notification row —
 * three queries and a payload to render one integer. Every signed-in client
 * does this once a minute, so it is the single most frequently executed query
 * in the app and worth its own endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    const user = await validateSession(token, ip, ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Served by notifications_user_read_created_idx (user_id, is_read, created_at).
    const [unread] = await db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

    return NextResponse.json(
      { unreadCount: Number(unread?.value || 0) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch unread count" }, { status: 500 });
  }
}
