import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { codRoomStaff, users } from "@/db/schema";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { ensureCodArenaSchema } from "@/lib/cod-room-service";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";
const roles = ["roomer", "spectator", "judge"] as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdminPermission(request, "tournaments");
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await ensureCodArenaSchema();
  const staff = await db.select({ id: codRoomStaff.id, userId: users.id, displayName: users.displayName, username: users.username, flexaId: users.flexaId, role: codRoomStaff.role })
    .from(codRoomStaff).innerJoin(users, eq(codRoomStaff.userId, users.id)).where(eq(codRoomStaff.roomId, id));
  return NextResponse.json({ staff });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const parsed = z.object({ identifier: z.string().trim().min(2).max(120), role: z.enum(roles) }).safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "کاربر یا نقش معتبر نیست" }, { status: 400 });
    await ensureCodArenaSchema();
    const [user] = await db.select({ id: users.id, displayName: users.displayName }).from(users).where(or(
      ilike(users.username, parsed.data.identifier),
      ilike(users.flexaId, parsed.data.identifier),
      ilike(users.email, parsed.data.identifier),
    )).limit(1);
    if (!user) return NextResponse.json({ error: "کاربر پیدا نشد" }, { status: 404 });
    const [created] = await db.insert(codRoomStaff).values({ roomId: id, userId: user.id, role: parsed.data.role }).onConflictDoNothing().returning();
    await logAdminAction({ adminId: auth.user.id, action: "assign_staff", entityType: "cod_room", entityId: id, metadata: { userId: user.id, role: parsed.data.role }, ipAddress: getClientIp(request.headers) });
    return NextResponse.json({ ok: true, staff: created || { userId: user.id, role: parsed.data.role } });
  } catch (error) {
    logger.error({ error, roomId: id }, "Assign COD room staff failed");
    return NextResponse.json({ error: "تخصیص عوامل روم انجام نشد" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const parsed = z.object({ userId: z.string().uuid(), role: z.enum(roles) }).safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "درخواست معتبر نیست" }, { status: 400 });
    await ensureCodArenaSchema();
    await db.delete(codRoomStaff).where(and(eq(codRoomStaff.roomId, id), eq(codRoomStaff.userId, parsed.data.userId), eq(codRoomStaff.role, parsed.data.role)));
    await logAdminAction({ adminId: auth.user.id, action: "remove_staff", entityType: "cod_room", entityId: id, metadata: parsed.data, ipAddress: getClientIp(request.headers) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ error, roomId: id }, "Remove COD room staff failed");
    return NextResponse.json({ error: "حذف عوامل روم انجام نشد" }, { status: 500 });
  }
}
