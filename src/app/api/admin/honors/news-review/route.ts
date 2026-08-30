import { NextRequest, NextResponse } from "next/server";
import { validateAdmin } from "@/lib/auth";
import { discoverGamingNewsDrafts, publishReviewedNewsDraft } from "@/lib/gaming-news-generator";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Search trusted sources and return translated drafts without publishing.
 *
 * Separate from /api/admin/honors/auto-news, which publishes immediately. This
 * is the reviewed path: nothing reaches the site until the operator approves an
 * individual draft via POST below.
 */
export async function GET(request: NextRequest) {
  const auth = await validateAdmin(request);
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") || "6");
    const result = await discoverGamingNewsDrafts({ limit });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ err, adminId: auth.user.id }, "News draft discovery failed");
    return NextResponse.json({
      error: "جستجوی خبر انجام نشد",
      details: err instanceof Error ? err.message : "خطای ناشناخته",
    }, { status: 500 });
  }
}

/** Publishes one reviewed draft. */
export async function POST(request: NextRequest) {
  const auth = await validateAdmin(request);
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json().catch(() => ({}));
    const sourceKey = String(body.sourceKey || "");
    const publishPayload = body.publishPayload;
    if (!sourceKey || !publishPayload || typeof publishPayload !== "object") {
      return NextResponse.json({ error: "پیش‌نویس نامعتبر است" }, { status: 400 });
    }

    const result = await publishReviewedNewsDraft({ sourceKey, publishPayload });
    if (!result.published) {
      return NextResponse.json({ error: "این خبر قبلاً منتشر شده است" }, { status: 409 });
    }

    await logAdminAction({
      adminId: auth.user.id,
      action: "publish",
      entityType: "honor_news",
      entityId: result.honorId,
      metadata: { title: result.title, reviewed: true },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ ok: true, honorId: result.honorId, title: result.title });
  } catch (err) {
    logger.error({ err, adminId: auth.user.id }, "Publishing reviewed news failed");
    return NextResponse.json({
      error: "انتشار خبر انجام نشد",
      details: err instanceof Error ? err.message : "خطای ناشناخته",
    }, { status: 500 });
  }
}
