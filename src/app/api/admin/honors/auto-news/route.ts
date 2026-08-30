import { NextRequest, NextResponse } from "next/server";
import { validateAdmin } from "@/lib/auth";
import { generateDailyGamingNews } from "@/lib/gaming-news-generator";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await validateAdmin(request);
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json().catch(() => ({}));
    const result = await generateDailyGamingNews({ force: body.force === true });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err, adminId: auth.user.id }, "Admin auto honors news failed");
    return NextResponse.json({
      error: "ساخت خبر خودکار انجام نشد",
      details: err instanceof Error ? err.message : "خطای ناشناخته تولید خبر",
    }, { status: 500 });
  }
}
