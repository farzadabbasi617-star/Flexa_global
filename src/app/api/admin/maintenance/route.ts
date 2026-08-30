import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs, rateLimits, sessions } from "@/db/schema";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { cleanupRateLimits } from "@/lib/rate-limit";
import { desc, sql } from "drizzle-orm";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

type MaintenanceAction = "all" | "sessions" | "rate_limits" | "audit";

async function getMaintenanceStats() {
  const [sessionsTotal] = await db.select({ value: sql<number>`count(*)` }).from(sessions);
  const [expiredSessions] = await db
    .select({ value: sql<number>`count(*)` })
    .from(sessions)
    .where(sql`${sessions.expiresAt} < now()`);

  const [rateLimitsTotal] = await db.select({ value: sql<number>`count(*)` }).from(rateLimits);
  const [expiredRateLimits] = await db
    .select({ value: sql<number>`count(*)` })
    .from(rateLimits)
    .where(sql`${rateLimits.resetAt} < now()`);

  const [auditTotal] = await db.select({ value: sql<number>`count(*)` }).from(adminAuditLogs);
  const [oldAuditLogs] = await db
    .select({ value: sql<number>`count(*)` })
    .from(adminAuditLogs)
    .where(sql`${adminAuditLogs.createdAt} < now() - interval '180 days'`);

  return {
    sessionsTotal: Number(sessionsTotal.value || 0),
    expiredSessions: Number(expiredSessions.value || 0),
    rateLimitsTotal: Number(rateLimitsTotal.value || 0),
    expiredRateLimits: Number(expiredRateLimits.value || 0),
    auditTotal: Number(auditTotal.value || 0),
    oldAuditLogs: Number(oldAuditLogs.value || 0),
  };
}

async function cleanupExpiredSessions() {
  const deleted = await db.delete(sessions).where(sql`${sessions.expiresAt} < now()`).returning({ id: sessions.id });
  return deleted.length;
}

async function cleanupOldAuditLogs() {
  const deleted = await db
    .delete(adminAuditLogs)
    .where(sql`${adminAuditLogs.createdAt} < now() - interval '180 days'`)
    .returning({ id: adminAuditLogs.id });
  return deleted.length;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "maintenance");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    return NextResponse.json({ stats: await getMaintenanceStats() });
  } catch (err) {
    logger.error({ err }, "Admin maintenance GET failed");
    return NextResponse.json({ error: "Failed to load maintenance stats" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "maintenance");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "all") as MaintenanceAction;
    const result: Record<string, number> = {};

    if (action === "all" || action === "sessions") result.expiredSessionsDeleted = await cleanupExpiredSessions();
    if (action === "all" || action === "rate_limits") {
      const before = (await getMaintenanceStats()).expiredRateLimits;
      await cleanupRateLimits();
      result.expiredRateLimitsDeleted = before;
    }
    if (action === "all" || action === "audit") result.oldAuditLogsDeleted = await cleanupOldAuditLogs();

    await logAdminAction({
      adminId: auth.user.id,
      action: "maintenance_cleanup",
      entityType: "system",
      metadata: { action, result },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true, result, stats: await getMaintenanceStats() });
  } catch (err) {
    logger.error({ err }, "Admin maintenance POST failed");
    return NextResponse.json({ error: "Maintenance cleanup failed" }, { status: 500 });
  }
}
