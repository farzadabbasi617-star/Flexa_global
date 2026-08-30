import { NextRequest, NextResponse } from "next/server";
import { listCodRooms, codArenaFinanceState } from "@/lib/cod-room-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const region = request.nextUrl.searchParams.get("region");
    const rooms = await listCodRooms({ region, limit: Number(request.nextUrl.searchParams.get("limit") || 100) });
    const finance = codArenaFinanceState();
    return NextResponse.json({
      rooms,
      arena: {
        ...finance,
        regions: ["global", "garena"],
        modes: ["solo", "duo", "squad"],
        referralModel: "service_fee_percentage",
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error({ error }, "COD room list failed");
    return NextResponse.json({ error: "دریافت روم‌های کالاف انجام نشد" }, { status: 500 });
  }
}
