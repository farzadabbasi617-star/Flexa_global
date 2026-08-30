import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { listCodRoomReports, resolveCodRoomReport } from "@/lib/cod-room-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["in_review", "resolved", "rejected"]),
  resolution: z.string().trim().max(40).optional().nullable(),
  adminNote: z.string().trim().max(2000).optional().nullable(),
  penalty: z.object({
    type: z.enum(["warning", "fine", "temp_ban", "permanent_ban", "result_void"]),
    reason: z.string().trim().max(2000).optional().nullable(),
    fineRial: z.string().regex(/^\d+$/).optional().nullable(),
    durationHours: z.number().int().min(1).max(720).optional().nullable(),
  }).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const reports = await listCodRoomReports({
      status: request.nextUrl.searchParams.get("status"),
      roomId: request.nextUrl.searchParams.get("roomId"),
      limit: Number(request.nextUrl.searchParams.get("limit") || 150),
    });
    return NextResponse.json({ reports }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error({ error }, "Admin COD reports GET failed");
    return NextResponse.json({ error: "گزارش‌های COD دریافت نشد" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "درخواست معتبر نیست" }, { status: 400 });
    const result = await resolveCodRoomReport({
      reportId: parsed.data.id,
      adminId: auth.user.id,
      status: parsed.data.status,
      resolution: parsed.data.resolution,
      adminNote: parsed.data.adminNote,
      penalty: parsed.data.penalty,
    });
    await logAdminAction({
      adminId: auth.user.id,
      action: "resolve_report",
      entityType: "cod_room_report",
      entityId: parsed.data.id,
      metadata: { status: parsed.data.status, penaltyType: parsed.data.penalty?.type || null },
      ipAddress: getClientIp(request.headers),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const known: Record<string, { text: string; status: number }> = {
      COD_REPORT_NOT_FOUND: { text: "گزارش پیدا نشد", status: 404 },
      COD_REPORT_STATUS_INVALID: { text: "وضعیت گزارش معتبر نیست", status: 400 },
      COD_REPORT_ACCUSED_REQUIRED_FOR_PENALTY: { text: "برای اعمال جریمه باید بازیکن متخلف مشخص باشد", status: 409 },
      COD_PENALTY_TYPE_INVALID: { text: "نوع جریمه معتبر نیست", status: 400 },
      COD_PENALTY_FINE_ONLY_FOR_FINE: { text: "مبلغ جریمه فقط برای نوع Fine مجاز است", status: 400 },
      COD_PENALTY_REASON_INVALID: { text: "دلیل جریمه معتبر نیست", status: 400 },
    };
    if (known[code]) return NextResponse.json({ error: known[code].text, code }, { status: known[code].status });
    logger.error({ error }, "Admin COD report PATCH failed");
    return NextResponse.json({ error: code === "UNKNOWN" ? "رسیدگی به گزارش انجام نشد" : code }, { status: 500 });
  }
}
