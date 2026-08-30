import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kycProfiles, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { KycReviewSchema } from "@/lib/validations";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET: list KYC profiles (default: pending) for admin review.
export async function GET(request: NextRequest) {
  const { user, error, status } = await requireAdminPermission(request, "store");
  if (!user) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("status") || "pending";

  const conditions = [];
  if (["none", "pending", "verified", "rejected"].includes(filter)) {
    conditions.push(eq(kycProfiles.status, filter as never));
  }

  const rows = await db
    .select({
      id: kycProfiles.id,
      userId: kycProfiles.userId,
      fullName: kycProfiles.fullName,
      nationalId: kycProfiles.nationalId,
      birthDate: kycProfiles.birthDate,
      idCardImageUrl: kycProfiles.idCardImageUrl,
      selfieImageUrl: kycProfiles.selfieImageUrl,
      status: kycProfiles.status,
      rejectionReason: kycProfiles.rejectionReason,
      submittedAt: kycProfiles.submittedAt,
      reviewedAt: kycProfiles.reviewedAt,
      displayName: users.displayName,
      phoneNumber: users.phoneNumber,
      flexaId: users.flexaId,
      // Reviewers need a way to contact the applicant and to see how
      // established the account is before approving a seller.
      email: users.email,
      username: users.username,
      userCreatedAt: users.createdAt,
    })
    .from(kycProfiles)
    .leftJoin(users, eq(users.id, kycProfiles.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(kycProfiles.submittedAt))
    .limit(100);

  return NextResponse.json({ items: rows });
}

// PATCH: approve or reject a KYC profile. Body: { id, decision, rejectionReason? }
export async function PATCH(request: NextRequest) {
  try {
    const { user, error, status } = await requireAdminPermission(request, "store");
    if (!user) return NextResponse.json({ error }, { status });

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    const parsed = KycReviewSchema.safeParse(body);
    if (!id || !parsed.success) {
      return NextResponse.json({ error: parsed.success ? "شناسه الزامی است" : parsed.error.issues[0]?.message }, { status: 400 });
    }
    const { decision, rejectionReason } = parsed.data;
    if (decision === "rejected" && !rejectionReason) {
      return NextResponse.json({ error: "دلیل رد الزامی است" }, { status: 400 });
    }

    const [target] = await db.select().from(kycProfiles).where(eq(kycProfiles.id, id)).limit(1);
    if (!target) return NextResponse.json({ error: "درخواست یافت نشد" }, { status: 404 });

    const [updated] = await db
      .update(kycProfiles)
      .set({
        status: decision,
        rejectionReason: decision === "rejected" ? rejectionReason ?? null : null,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(kycProfiles.id, id))
      .returning({ id: kycProfiles.id, status: kycProfiles.status });

    // Mark the user as verified when KYC passes.
    if (decision === "verified") {
      await db.update(users).set({ isVerified: true }).where(eq(users.id, target.userId));
    }

    await logAdminAction({
      adminId: user.id,
      action: `kyc_${decision}`,
      entityType: "kyc_profile",
      entityId: id,
      metadata: { userId: target.userId, rejectionReason },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ kyc: updated });
  } catch (err) {
    logger.error({ err }, "Admin KYC review error");
    return NextResponse.json({ error: "خطا در بررسی احراز هویت" }, { status: 500 });
  }
}
