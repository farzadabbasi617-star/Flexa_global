import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, isNotNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { notifyLinkedUserOnTelegram } from "@/lib/telegram";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const statuses = ["unlinked", "pending", "verified", "rejected"] as const;
type CodProfileStatus = (typeof statuses)[number];
const patchSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(statuses),
  note: z.string().trim().max(1200).optional().nullable(),
});

function publicMetadata(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function statusFa(status: string) {
  return status === "verified" ? "تأیید شد" : status === "rejected" ? "رد شد" : status === "pending" ? "در انتظار بررسی" : "ثبت‌نشده";
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "users");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const requestedStatus = request.nextUrl.searchParams.get("status") || "pending";
    const status: CodProfileStatus | "all" = (statuses as readonly string[]).includes(requestedStatus) ? requestedStatus as CodProfileStatus : "all";
    const query = (request.nextUrl.searchParams.get("q") || "").trim();
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 120), 1), 300);

    const conditions = [isNotNull(users.codMobileId), isNotNull(users.codMobileUsername)];
    if (status !== "all") conditions.push(eq(users.codMobileStatus, status));
    if (query) {
      const like = `%${query}%`;
      conditions.push(or(
        ilike(users.displayName, like),
        ilike(users.username, like),
        ilike(users.flexaId, like),
        ilike(users.email, like),
        ilike(users.codMobileId, like),
        ilike(users.codMobileUsername, like),
      )!);
    }

    const rows = await db.select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      flexaId: users.flexaId,
      email: users.email,
      phoneNumber: users.phoneNumber,
      avatarUrl: users.avatarUrl,
      codMobileId: users.codMobileId,
      codMobileUsername: users.codMobileUsername,
      codMobileRegion: users.codMobileRegion,
      codMobileStatus: users.codMobileStatus,
      birthDate: users.birthDate,
      nationalId: users.nationalId,
      createdAt: users.createdAt,
      metadata: users.metadata,
    }).from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(limit);

    return NextResponse.json({ profiles: rows, statuses }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error({ error }, "Admin COD profiles GET failed");
    return NextResponse.json({ error: "دریافت پروفایل‌های COD انجام نشد" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "users");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "درخواست معتبر نیست" }, { status: 400 });

    const result = await db.transaction(async (tx) => {
      const [target] = await tx.select().from(users).where(eq(users.id, parsed.data.userId)).for("update").limit(1);
      if (!target) throw new Error("COD_PROFILE_USER_NOT_FOUND");
      if (!target.codMobileId || !target.codMobileUsername) throw new Error("COD_PROFILE_EMPTY");

      if (parsed.data.status === "verified") {
        const [duplicate] = await tx.select({ id: users.id, displayName: users.displayName, flexaId: users.flexaId }).from(users).where(and(
          eq(users.codMobileId, target.codMobileId),
          eq(users.codMobileRegion, target.codMobileRegion),
          eq(users.codMobileStatus, "verified"),
          ne(users.id, target.id),
        )).limit(1);
        if (duplicate) throw new Error(`COD_PROFILE_DUPLICATE_VERIFIED:${duplicate.flexaId || duplicate.displayName}`);
      }

      const metadata = publicMetadata(target.metadata);
      metadata.codMobileVerification = {
        status: parsed.data.status,
        reviewedById: auth.user!.id,
        reviewedAt: new Date().toISOString(),
        note: parsed.data.note || null,
        codMobileId: target.codMobileId,
        codMobileUsername: target.codMobileUsername,
        codMobileRegion: target.codMobileRegion,
      };

      const [updated] = await tx.update(users).set({
        codMobileStatus: parsed.data.status,
        metadata,
      }).where(eq(users.id, target.id)).returning();

      return updated;
    });

    await logAdminAction({
      adminId: auth.user.id,
      action: "cod_profile_review",
      entityType: "user",
      entityId: parsed.data.userId,
      metadata: { status: parsed.data.status, note: parsed.data.note || null },
      ipAddress: getClientIp(request.headers),
    });

    await notifyLinkedUserOnTelegram(parsed.data.userId, [
      "🎯 <b>وضعیت پروفایل Call of Duty Mobile شما بروزرسانی شد</b>",
      "",
      `وضعیت جدید: <b>${statusFa(parsed.data.status)}</b>`,
      parsed.data.note ? `یادداشت ادمین: ${parsed.data.note}` : "",
    ].filter(Boolean).join("\n")).catch(() => undefined);

    return NextResponse.json({ ok: true, profile: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "COD_PROFILE_USER_NOT_FOUND") return NextResponse.json({ error: "کاربر پیدا نشد" }, { status: 404 });
    if (code === "COD_PROFILE_EMPTY") return NextResponse.json({ error: "UID و Username کالاف برای این کاربر ثبت نشده است" }, { status: 409 });
    if (code.startsWith("COD_PROFILE_DUPLICATE_VERIFIED:")) {
      return NextResponse.json({ error: `این UID قبلاً برای حساب ${code.split(":").slice(1).join(":")} تأیید شده است` }, { status: 409 });
    }
    logger.error({ error }, "Admin COD profile PATCH failed");
    return NextResponse.json({ error: code === "UNKNOWN" ? "بررسی پروفایل COD انجام نشد" : code }, { status: 500 });
  }
}
