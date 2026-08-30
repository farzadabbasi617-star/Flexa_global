import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { parseBirthDate } from "@/lib/age-gate";
import { isValidIranianNationalId } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const FullIdentitySchema = z.object({
  firstName: z.string().trim().min(2, "نام معتبر وارد کنید").max(100),
  lastName: z.string().trim().min(2, "نام خانوادگی معتبر وارد کنید").max(100),
  birthDate: z.string().trim().refine((value) => Boolean(parseBirthDate(value)), "تاریخ تولد معتبر نیست"),
  nationalId: z.string().regex(/^\d{10}$/, "کد ملی باید ۱۰ رقم باشد").refine(isValidIranianNationalId, "کد ملی معتبر نیست"),
});
const IdentityInputSchema = z.object({
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  birthDate: z.string().trim().optional(),
  nationalId: z.string().trim().optional(),
});

function publicIdentity(user: typeof users.$inferSelect) {
  const complete = Boolean(user.firstName && user.lastName && user.birthDate && user.nationalId);
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    birthDate: user.birthDate,
    nationalIdMasked: user.nationalId ? `${user.nationalId.slice(0, 3)}••••${user.nationalId.slice(-3)}` : null,
    phoneNumber: user.phoneNumber,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    phoneVerified: Boolean(user.phoneVerifiedAt),
    complete,
    locked: {
      firstName: Boolean(user.firstName),
      lastName: Boolean(user.lastName),
      birthDate: Boolean(user.birthDate),
      nationalId: Boolean(user.nationalId),
    },
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const [user] = await db.select().from(users).where(eq(users.id, auth.user.id)).limit(1);
  if (!user) return NextResponse.json({ error: "کاربر پیدا نشد" }, { status: 404 });
  return NextResponse.json({ identity: publicIdentity(user) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limited = await rateLimit(`identity:complete:${auth.user.id}:${ip}`, 5, 60 * 60 * 1000);
    if (!limited.success) return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است" }, { status: 429 });
    const parsed = IdentityInputSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "اطلاعات نامعتبر" }, { status: 400 });
    const input = parsed.data;
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(users).where(eq(users.id, auth.user!.id)).for("update").limit(1);
      if (!current) return { kind: "missing" as const };
      const attemptedChange =
        (input.firstName !== undefined && current.firstName && current.firstName !== input.firstName) ||
        (input.lastName !== undefined && current.lastName && current.lastName !== input.lastName) ||
        (input.birthDate !== undefined && current.birthDate && current.birthDate !== input.birthDate) ||
        (input.nationalId !== undefined && current.nationalId && current.nationalId !== input.nationalId);
      if (attemptedChange) return { kind: "locked" as const, user: current };
      const candidate = FullIdentitySchema.safeParse({
        firstName: current.firstName || input.firstName,
        lastName: current.lastName || input.lastName,
        birthDate: current.birthDate || input.birthDate,
        nationalId: current.nationalId || input.nationalId,
      });
      if (!candidate.success) return { kind: "invalid" as const, error: candidate.error.issues[0]?.message || "اطلاعات هویتی ناقص است" };
      const verified = candidate.data;
      const [duplicate] = await tx.select({ id: users.id }).from(users).where(and(
        eq(users.nationalId, verified.nationalId), ne(users.id, current.id),
      )).limit(1);
      if (duplicate) return { kind: "duplicate" as const };
      const [updated] = await tx.update(users).set({
        firstName: verified.firstName,
        lastName: verified.lastName,
        birthDate: verified.birthDate,
        nationalId: verified.nationalId,
      }).where(eq(users.id, current.id)).returning();
      return { kind: "updated" as const, user: updated };
    });
    if (result.kind === "missing") return NextResponse.json({ error: "کاربر پیدا نشد" }, { status: 404 });
    if (result.kind === "invalid") return NextResponse.json({ error: result.error }, { status: 400 });
    if (result.kind === "duplicate") return NextResponse.json({ error: "این کد ملی قبلاً برای حساب دیگری ثبت شده است" }, { status: 409 });
    if (result.kind === "locked") return NextResponse.json({ error: "اطلاعات هویتی ثبت‌شده قفل است؛ برای اصلاح با پشتیبانی تماس بگیرید", identity: publicIdentity(result.user) }, { status: 409 });
    return NextResponse.json({ ok: true, identity: publicIdentity(result.user) });
  } catch (error) {
    logger.error({ error }, "Profile identity completion failed");
    return NextResponse.json({ error: "ثبت اطلاعات هویتی انجام نشد" }, { status: 500 });
  }
}
