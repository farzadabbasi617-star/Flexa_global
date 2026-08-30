import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { kycProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { KycSubmitSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET: current user's KYC status.
export async function GET(request: NextRequest) {
  const { user, error, status } = await requireUser(request);
  if (!user) return NextResponse.json({ error }, { status });

  const [kyc] = await db
    .select({
      id: kycProfiles.id,
      status: kycProfiles.status,
      fullName: kycProfiles.fullName,
      rejectionReason: kycProfiles.rejectionReason,
      submittedAt: kycProfiles.submittedAt,
      reviewedAt: kycProfiles.reviewedAt,
    })
    .from(kycProfiles)
    .where(eq(kycProfiles.userId, user.id))
    .limit(1);

  return NextResponse.json({ kyc: kyc ?? null, canSell: kyc?.status === "verified" });
}

// POST: submit (or resubmit after rejection) a KYC profile.
export async function POST(request: NextRequest) {
  try {
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`kyc:submit:${user.id}:${ip}`, 5, 60 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: "تعداد دفعات ارسال زیاد است. بعداً تلاش کنید." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = KycSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "اطلاعات نامعتبر" }, { status: 400 });
    }
    const data = parsed.data;

    const [existing] = await db
      .select({ id: kycProfiles.id, status: kycProfiles.status })
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, user.id))
      .limit(1);

    if (existing) {
      if (existing.status === "verified") {
        return NextResponse.json({ error: "هویت شما قبلاً تأیید شده است" }, { status: 409 });
      }
      if (existing.status === "pending") {
        return NextResponse.json({ error: "درخواست شما در حال بررسی است" }, { status: 409 });
      }
      // status === 'rejected' or 'none' -> allow resubmit
      const [updated] = await db
        .update(kycProfiles)
        .set({
          fullName: data.fullName,
          nationalId: data.nationalId,
          birthDate: data.birthDate ?? null,
          idCardImageUrl: data.idCardImageUrl,
          // Selfie is no longer collected; clear any value from an older
          // submission so a resubmit does not silently keep stale face data.
          selfieImageUrl: null,
          status: "pending",
          rejectionReason: null,
          reviewedBy: null,
          reviewedAt: null,
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(kycProfiles.id, existing.id))
        .returning({ id: kycProfiles.id, status: kycProfiles.status });
      return NextResponse.json({ kyc: updated });
    }

    const [created] = await db
      .insert(kycProfiles)
      .values({
        userId: user.id,
        fullName: data.fullName,
        nationalId: data.nationalId,
        birthDate: data.birthDate ?? null,
        idCardImageUrl: data.idCardImageUrl,
        status: "pending",
      })
      .returning({ id: kycProfiles.id, status: kycProfiles.status });

    return NextResponse.json({ kyc: created }, { status: 201 });
  } catch (err) {
    // Log enough to identify a schema/constraint problem without putting any
    // of it in the response. The previous generic 500 hid a
    // "value too long for type character varying(500)" for months: with
    // Cloudinary unconfigured the uploader returns a base64 data URL, which
    // overflowed the old column width on every real photo.
    const code = (err as { code?: string })?.code;
    logger.error(
      { err, code, constraint: (err as { constraint?: string })?.constraint },
      "KYC submit error"
    );

    // 22001 = string_data_right_truncation. Tell the user something they can
    // act on instead of a dead end.
    if (code === "22001") {
      return NextResponse.json(
        { error: "حجم تصویر بارگذاری‌شده زیاد است. لطفاً تصویر کوچک‌تری انتخاب کنید." },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "خطا در ثبت درخواست احراز هویت" }, { status: 500 });
  }
}
