import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, affiliatePayouts, mediaPartnerAgreements, mediaPartners, notifications } from "@/db/schema";
import { validateAdmin } from "@/lib/auth";
import { adminUpdateAffiliatePayout, adminUpdateMediaPartner, affiliateAdminOverview } from "@/lib/affiliate-service";
import { rateLimit } from "@/lib/rate-limit";
import { MEDIA_PARTNER_CONTRACT_HASH, MEDIA_PARTNER_CONTRACT_VERSION } from "@/lib/media-partner-contract";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await validateAdmin(request);
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json(await affiliateAdminOverview(), { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await validateAdmin(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const limited = await rateLimit(`admin-affiliate:${auth.user.id}`, 100, 60 * 60 * 1000);
    if (!limited.success) return NextResponse.json({ error: "تعداد عملیات زیاد است" }, { status: 429 });
    const body = await request.json().catch(() => ({}));
    const entity = String(body.entity || "");
    const action = String(body.action || "");
    const id = String(body.id || "");
    const reason = String(body.reason || "").slice(0, 1000);
    let result: unknown = null;
    if (entity === "partner" && ["approve", "suspend", "reject", "terminate"].includes(action)) {
      if (action === "approve") {
        const [partner] = await db.select({ id: mediaPartners.id, contractAcceptedAt: mediaPartners.contractAcceptedAt })
          .from(mediaPartners).where(eq(mediaPartners.id, id)).limit(1);
        const [agreement] = partner ? await db.select({ id: mediaPartnerAgreements.id, acceptedAt: mediaPartnerAgreements.acceptedAt }).from(mediaPartnerAgreements)
          .where(and(
            eq(mediaPartnerAgreements.partnerId, partner.id),
            eq(mediaPartnerAgreements.contractVersion, MEDIA_PARTNER_CONTRACT_VERSION),
            eq(mediaPartnerAgreements.contentHash, MEDIA_PARTNER_CONTRACT_HASH),
          )).orderBy(sql`${mediaPartnerAgreements.acceptedAt} DESC`).limit(1) : [];
        if (!partner?.contractAcceptedAt || !agreement || agreement.acceptedAt.getTime() < partner.contractAcceptedAt.getTime() - 1_000) return NextResponse.json({ error: "قرارداد OTPشده برای این رسانه ثبت نشده است" }, { status: 409 });
      }
      result = await adminUpdateMediaPartner({ partnerId: id, action: action as "approve" | "suspend" | "reject" | "terminate", adminId: auth.user.id, reason });
    } else if (entity === "payout" && ["approve", "paid", "reject"].includes(action)) {
      const reference = String(body.reference || "").slice(0, 120);
      if (action === "paid" && reference.length < 3) return NextResponse.json({ error: "شماره پیگیری پرداخت الزامی است" }, { status: 400 });
      result = await adminUpdateAffiliatePayout({ payoutId: id, action: action as "approve" | "paid" | "reject", adminId: auth.user.id, reference, note: reason });
    } else {
      return NextResponse.json({ error: "عملیات نامعتبر" }, { status: 400 });
    }
    if (!result) return NextResponse.json({ error: "رکورد پیدا نشد یا وضعیت آن تغییر کرده است" }, { status: 404 });
    await db.insert(adminAuditLogs).values({
      adminId: auth.user.id,
      action: `affiliate_${entity}_${action}`,
      entityType: entity === "partner" ? "media_partner" : "affiliate_payout",
      entityId: id,
      metadata: { reason, reference: body.reference || null },
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0] || null,
    });
    if (entity === "partner") {
      const partnerResult = result as { userId?: string; mediaName?: string; status?: string };
      if (partnerResult.userId) await db.insert(notifications).values({
        userId: partnerResult.userId,
        type: "media_partner_status",
        title: action === "approve" ? "همکاری رسانه‌ای فعال شد" : "وضعیت همکاری رسانه‌ای تغییر کرد",
        message: action === "approve" ? `رسانه ${partnerResult.mediaName || "شما"} تأیید شد و لینک معرفی فعال است.` : `وضعیت همکاری به ${partnerResult.status || action} تغییر کرد.${reason ? ` دلیل: ${reason}` : ""}`,
        link: "/media-partners",
      });
    } else {
      const [payoutOwner] = await db.select({ userId: mediaPartners.userId }).from(affiliatePayouts)
        .innerJoin(mediaPartners, eq(affiliatePayouts.partnerId, mediaPartners.id)).where(eq(affiliatePayouts.id, id)).limit(1);
      if (payoutOwner?.userId) await db.insert(notifications).values({
        userId: payoutOwner.userId,
        type: "affiliate_payout_status",
        title: "وضعیت تسویه همکاری رسانه‌ای",
        message: action === "paid" ? `تسویه با شماره پیگیری ${String(body.reference || "—")} پرداخت شد.` : `درخواست تسویه ${action === "approve" ? "تأیید" : "رد"} شد.`,
        link: "/media-partners",
      });
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    logger.error({ error }, "Admin media partner PATCH failed");
    return NextResponse.json({ error: "عملیات مدیریت رسانه انجام نشد" }, { status: 500 });
  }
}
