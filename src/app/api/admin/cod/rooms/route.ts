import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { createCodRoom, deleteCodRoom, listCodRooms, updateCodRoom, codArenaLive, codArenaFinanceState } from "@/lib/cod-room-service";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const rooms = await listCodRooms({ includeUnpublished: true, limit: 300, region: request.nextUrl.searchParams.get("region") });
    const finance = codArenaFinanceState();
    return NextResponse.json({ rooms, live: finance.live, finance }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error({ error }, "Admin COD rooms GET failed");
    return NextResponse.json({ error: "دریافت اتاق‌های COD Arena انجام نشد" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const room = await createCodRoom(await request.json().catch(() => ({})), auth.user.id);
    await logAdminAction({
      adminId: auth.user.id,
      action: "create",
      entityType: "cod_room",
      entityId: room.id,
      metadata: { title: room.title, region: room.region, status: room.status, live: codArenaLive() },
      ipAddress: getClientIp(request.headers),
    });
    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ساخت روم انجام نشد";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "شناسه روم معتبر نیست" }, { status: 400 });
    const room = await updateCodRoom(id, body, auth.user.id);
    await logAdminAction({
      adminId: auth.user.id,
      action: "update",
      entityType: "cod_room",
      entityId: room.id,
      metadata: { title: room.title, status: room.status, isPublished: room.isPublished },
      ipAddress: getClientIp(request.headers),
    });
    return NextResponse.json({ room });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const known: Record<string, { text: string; status: number }> = {
      COD_ROOM_NOT_FOUND: { text: "روم پیدا نشد", status: 404 },
      COD_STATUS_TRANSITION_INVALID: { text: "تغییر وضعیت روم خارج از چرخه امن است", status: 409 },
      COD_LOCKED_AFTER_REGISTRATION: { text: "پس از اولین ثبت‌نام، ریجن، مود، قوانین و تمام شرایط مالی/جایزه قفل می‌شوند", status: 409 },
      COD_CAPACITY_BELOW_REGISTRATIONS: { text: "ظرفیت نمی‌تواند کمتر از تعداد ثبت‌نام فعلی باشد", status: 409 },
      COD_LOBBY_START_CONFIRMATION_REQUIRED: { text: "برای شروع روم، آخرین بررسی Lobby باید verified باشد؛ در غیر این صورت override دستی ادمین لازم است", status: 409 },
    };
    if (known[code]) return NextResponse.json({ error: known[code].text, code }, { status: known[code].status });
    return NextResponse.json({ error: code === "UNKNOWN" ? "ویرایش روم انجام نشد" : code }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "شناسه روم معتبر نیست" }, { status: 400 });
    await deleteCodRoom(id, auth.user.id);
    await logAdminAction({ adminId: auth.user.id, action: "delete", entityType: "cod_room", entityId: id, ipAddress: getClientIp(request.headers) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "COD_ROOM_DELETE_FORBIDDEN") return NextResponse.json({ error: "فقط روم Draft بدون بازیکن قابل حذف است" }, { status: 409 });
    logger.error({ error }, "Admin COD room delete failed");
    return NextResponse.json({ error: "حذف روم انجام نشد" }, { status: 500 });
  }
}
