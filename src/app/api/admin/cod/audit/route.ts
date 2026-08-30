import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { codRoomAuditEvents, adminAuditLogs, codRooms, users } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

// Combined operational audit feed for COD Arena:
// - room start/status changes performed with a lobby-check override
//   (from cod_room_audit_events)
// - settlements and settlement overrides (from admin_audit_logs)
export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, "tournaments");
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const overrideEvents = await db
      .select({
        id: codRoomAuditEvents.id,
        roomId: codRoomAuditEvents.roomId,
        actorId: codRoomAuditEvents.actorId,
        eventType: codRoomAuditEvents.eventType,
        payload: codRoomAuditEvents.payload,
        createdAt: codRoomAuditEvents.createdAt,
        roomTitle: codRooms.title,
        actorName: users.displayName,
      })
      .from(codRoomAuditEvents)
      .leftJoin(codRooms, eq(codRooms.id, codRoomAuditEvents.roomId))
      .leftJoin(users, eq(users.id, codRoomAuditEvents.actorId))
      .where(sql`${codRoomAuditEvents.payload} ->> 'lobbyOverrideConfirmed' = 'true'`)
      .orderBy(desc(codRoomAuditEvents.createdAt))
      .limit(40);

    const settleEvents = await db
      .select({
        id: adminAuditLogs.id,
        adminId: adminAuditLogs.adminId,
        action: adminAuditLogs.action,
        entityId: adminAuditLogs.entityId,
        metadata: adminAuditLogs.metadata,
        createdAt: adminAuditLogs.createdAt,
        adminName: users.displayName,
      })
      .from(adminAuditLogs)
      .leftJoin(users, eq(users.id, adminAuditLogs.adminId))
      .where(and(eq(adminAuditLogs.entityType, "cod_room"), inArray(adminAuditLogs.action, ["settle", "settle_override"])))
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(40);

    const feed = [
      ...overrideEvents.map((e) => {
        const p = (e.payload ?? {}) as Record<string, unknown>;
        return {
          kind: "start_override" as const,
          id: e.id,
          roomId: e.roomId,
          roomTitle: e.roomTitle,
          actorName: e.actorName,
          fromStatus: (p.fromStatus as string) || null,
          toStatus: (p.toStatus as string) || null,
          createdAt: e.createdAt,
        };
      }),
      ...settleEvents.map((e) => {
        const m = (e.metadata ?? {}) as Record<string, unknown>;
        return {
          kind: (e.action === "settle_override" ? "settle_override" : "settle") as "settle_override" | "settle",
          id: e.id,
          roomId: e.entityId,
          adminName: e.adminName,
          entryCount: (m.entryCount as number) ?? null,
          totalRewardRial: (m.totalRewardRial as string) ?? null,
          live: Boolean(m.live),
          lobbyOverride: Boolean(m.lobbyOverride),
          createdAt: e.createdAt,
        };
      }),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 60);

    return NextResponse.json({ feed });
  } catch (err) {
    return NextResponse.json({ error: "خطا در دریافت ممیزی عملیات" }, { status: 500 });
  }
}
