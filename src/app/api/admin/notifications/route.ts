import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "notifications");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [recent, userRows] = await Promise.all([
      db
        .select({
          id: notifications.id,
          userId: notifications.userId,
          type: notifications.type,
          title: notifications.title,
          message: notifications.message,
          link: notifications.link,
          isRead: notifications.isRead,
          createdAt: notifications.createdAt,
          displayName: users.displayName,
          username: users.username,
        })
        .from(notifications)
        .leftJoin(users, eq(notifications.userId, users.id))
        .orderBy(desc(notifications.createdAt))
        .limit(200),
      db
        .select({ id: users.id, displayName: users.displayName, username: users.username, phoneNumber: users.phoneNumber })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(500),
    ]);

    return NextResponse.json({ notifications: recent, users: userRows });
  } catch (err) {
    logger.error({ err }, "Admin notifications GET failed");
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "notifications");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const target = String(body.target || "single");
    const userIds = Array.isArray(body.userIds) ? body.userIds.map(String).filter(Boolean) : [];
    const type = String(body.type || "system").slice(0, 50);
    const title = String(body.title || "").trim();
    const message = String(body.message || "").trim();
    const link = body.link ? String(body.link).trim() : null;

    if (!title || !message) return NextResponse.json({ error: "عنوان و پیام الزامی است" }, { status: 400 });

    let recipients: string[] = [];
    if (target === "all") {
      const rows = await db.select({ id: users.id }).from(users);
      recipients = rows.map((row) => row.id);
    } else {
      recipients = userIds;
    }

    recipients = [...new Set(recipients)];
    if (recipients.length === 0) return NextResponse.json({ error: "گیرنده‌ای انتخاب نشده است" }, { status: 400 });

    await db.insert(notifications).values(recipients.map((userId) => ({ userId, type, title, message, link })));

    await logAdminAction({
      adminId: auth.user.id,
      action: "send",
      entityType: "notification",
      metadata: { target, count: recipients.length, title, type },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true, count: recipients.length });
  } catch (err) {
    logger.error({ err }, "Admin notifications POST failed");
    return NextResponse.json({ error: "Failed to send notifications" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "notifications");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { ids } = await request.json();
    const notificationIds = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
    if (notificationIds.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });

    await db.delete(notifications).where(inArray(notifications.id, notificationIds));
    await logAdminAction({
      adminId: auth.user.id,
      action: "delete",
      entityType: "notification",
      metadata: { ids: notificationIds },
      ipAddress: getClientIp(request.headers),
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
