import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession } from "@/lib/auth";
import { getCodRoomDetail, codArenaFinanceState } from "@/lib/cod-room-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "روم پیدا نشد" }, { status: 404 });
  try {
    const token = request.cookies.get("session")?.value;
    const viewer = token ? await validateSession(
      token,
      request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown",
      request.headers.get("user-agent") || "unknown",
      request,
    ) : null;
    const detail = await getCodRoomDetail(id, viewer?.id, viewer?.role === "admin" || viewer?.role === "super_admin");
    if (!detail || "forbidden" in detail) return NextResponse.json({ error: "روم پیدا نشد" }, { status: 404 });
    const finance = codArenaFinanceState();
    return NextResponse.json({ room: detail, live: finance.live, finance }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error({ error, roomId: id }, "COD room detail failed");
    return NextResponse.json({ error: "دریافت اطلاعات روم انجام نشد" }, { status: 500 });
  }
}
