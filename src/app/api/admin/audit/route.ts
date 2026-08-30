import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "audit");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || 150), 500);
    const rows = await db
      .select({
        id: adminAuditLogs.id,
        action: adminAuditLogs.action,
        entityType: adminAuditLogs.entityType,
        entityId: adminAuditLogs.entityId,
        metadata: adminAuditLogs.metadata,
        ipAddress: adminAuditLogs.ipAddress,
        createdAt: adminAuditLogs.createdAt,
        adminId: users.id,
        adminName: users.displayName,
        adminUsername: users.username,
      })
      .from(adminAuditLogs)
      .leftJoin(users, eq(adminAuditLogs.adminId, users.id))
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(limit);

    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "Failed to load audit logs" }, { status: 500 });
  }
}
