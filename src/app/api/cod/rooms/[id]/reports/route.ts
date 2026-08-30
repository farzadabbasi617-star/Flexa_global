import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { reportCodRoomIssue } from "@/lib/cod-room-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const schema = z.object({
  category: z.enum(["cheat", "teaming", "no_recording", "banned_item", "toxic_behavior", "wrong_result", "no_show", "other"]),
  description: z.string().trim().min(10).max(2000),
  accusedEntryId: z.string().uuid().optional().nullable(),
  accusedCodUsername: z.string().trim().max(100).optional().nullable(),
  evidenceUrl: z.string().url().max(1500).optional().nullable(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "روم پیدا نشد" }, { status: 404 });
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const limited = await rateLimit(`cod:report:${auth.user.id}:${id}`, 8, 60 * 60_000);
    if (!limited.success) return NextResponse.json({ error: "سقف ثبت گزارش برای این روم پر شده است" }, { status: 429 });
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "گزارش معتبر نیست" }, { status: 400 });
    const report = await reportCodRoomIssue({
      roomId: id,
      reporterId: auth.user.id,
      isAdmin: auth.user.role === "admin" || auth.user.role === "super_admin",
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, report }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const known: Record<string, { text: string; status: number }> = {
      COD_ROOM_NOT_FOUND: { text: "روم پیدا نشد", status: 404 },
      COD_REPORT_FORBIDDEN: { text: "فقط شرکت‌کننده‌ها و عوامل این روم می‌توانند گزارش ثبت کنند", status: 403 },
      COD_REPORT_CATEGORY_INVALID: { text: "نوع گزارش معتبر نیست", status: 400 },
      COD_REPORT_DESCRIPTION_INVALID: { text: "توضیحات گزارش باید بین ۱۰ تا ۲۰۰۰ کاراکتر باشد", status: 400 },
      COD_REPORT_ACCUSED_INVALID: { text: "بازیکن گزارش‌شده در این روم پیدا نشد", status: 400 },
      COD_REPORT_EVIDENCE_URL_INVALID: { text: "لینک مدرک باید HTTPS و معتبر باشد", status: 400 },
    };
    if (known[code]) return NextResponse.json({ error: known[code].text, code }, { status: known[code].status });
    logger.error({ error, roomId: id }, "COD room report failed");
    return NextResponse.json({ error: "ثبت گزارش انجام نشد" }, { status: 500 });
  }
}
