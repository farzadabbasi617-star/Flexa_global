import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeReports, users, storeListings } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  fraud: "کلاهبرداری",
  fake: "آگهی جعلی",
  wrong_price: "قیمت نادرست",
  inappropriate: "محتوای نامناسب",
  stolen_account: "اکانت سرقتی",
  other: "سایر",
};

export async function GET(request: NextRequest) {
  const { user, error, status } = await requireAdminPermission(request, "store");
  if (!user) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("status") || "open";

  const conditions = [];
  if (filter !== "all") conditions.push(eq(storeReports.status, filter as never));

  const rows = await db
    .select({
      id: storeReports.id,
      reason: storeReports.reason,
      details: storeReports.details,
      status: storeReports.status,
      listingId: storeReports.listingId,
      listingTitle: storeListings.title,
      reporterName: users.displayName,
      createdAt: storeReports.createdAt,
    })
    .from(storeReports)
    .leftJoin(users, eq(users.id, storeReports.reporterId))
    .leftJoin(storeListings, eq(storeListings.id, storeReports.listingId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(storeReports.createdAt))
    .limit(200);

  return NextResponse.json({
    items: rows.map((r) => ({ ...r, reasonLabel: REASON_LABELS[r.reason] || r.reason })),
  });
}

// PATCH: change a report status. Body: { id, status, adminNote? }
export async function PATCH(request: NextRequest) {
  try {
    const { user, error, status } = await requireAdminPermission(request, "store");
    if (!user) return NextResponse.json({ error }, { status });

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    const newStatus = String(body.status || "");
    if (!id || !["open", "reviewing", "resolved", "dismissed"].includes(newStatus)) {
      return NextResponse.json({ error: "اطلاعات نامعتبر" }, { status: 400 });
    }

    const [updated] = await db
      .update(storeReports)
      .set({
        status: newStatus as never,
        adminNote: body.adminNote ? String(body.adminNote).slice(0, 1000) : null,
        reviewedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(storeReports.id, id))
      .returning({ id: storeReports.id, status: storeReports.status });

    if (!updated) return NextResponse.json({ error: "گزارش یافت نشد" }, { status: 404 });

    await logAdminAction({
      adminId: user.id,
      action: `store_report_${newStatus}`,
      entityType: "store_report",
      entityId: id,
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ report: updated });
  } catch (err) {
    logger.error({ err }, "Admin report PATCH error");
    return NextResponse.json({ error: "خطا در پردازش گزارش" }, { status: 500 });
  }
}
