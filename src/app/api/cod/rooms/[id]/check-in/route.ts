import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { checkInCodRoom } from "@/lib/cod-room-service";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "روم پیدا نشد" }, { status: 404 });
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const limited = await rateLimit(`cod:checkin:${auth.user.id}:${id}`, 8, 60_000);
    if (!limited.success) return NextResponse.json({ error: "تعداد تلاش‌ها زیاد است" }, { status: 429 });
    const entry = await checkInCodRoom(id, auth.user.id);
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "COD_ROOM_NOT_FOUND" || code === "COD_ENTRY_NOT_FOUND") return NextResponse.json({ error: "ثبت‌نام فعال برای این روم پیدا نشد", code }, { status: 404 });
    if (code === "COD_ENTRY_NOT_PAID") return NextResponse.json({ error: "پرداخت ورودی این روم ثبت نشده است؛ تا تأیید پرداخت امکان Check-in و دریافت کد روم وجود ندارد", code }, { status: 402 });
    if (code === "COD_CHECKIN_NOT_OPEN") return NextResponse.json({ error: "زمان Check-in هنوز شروع نشده است", code }, { status: 409 });
    if (code === "COD_CHECKIN_CLOSED") return NextResponse.json({ error: "زمان Check-in تمام شده است", code }, { status: 409 });
    logger.error({ error, roomId: id }, "COD room check-in failed");
    return NextResponse.json({ error: "تأیید حضور انجام نشد" }, { status: 500 });
  }
}
