import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { eq, ilike } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { PasswordResetConfirmSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { EmailService, InvalidOtpError } from "@/lib/email-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function emailRateKey(email: string) {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ipLimit = await rateLimit(`reset-password:ip:${ip}`, 10, 15 * 60 * 1000);
    if (!ipLimit.success) {
      return NextResponse.json({ error: "تلاش‌های زیادی انجام شده است. کمی بعد دوباره امتحان کنید." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const validation = PasswordResetConfirmSchema.safeParse({
      email: body?.email,
      code: body?.code,
      password: body?.password ?? body?.newPassword,
    });
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0]?.message || "اطلاعات معتبر نیست" }, { status: 400 });
    }

    const { email, code, password } = validation.data;
    const accountLimit = await rateLimit(`reset-password:email:${emailRateKey(email)}`, 6, 15 * 60 * 1000);
    if (!accountLimit.success) {
      return NextResponse.json({ error: "تعداد تلاش‌های کد بازیابی زیاد است. کمی بعد دوباره امتحان کنید." }, { status: 429 });
    }

    // Hash before opening the transaction so the database lock is held only
    // for the short OTP-consume/update/session-revoke section.
    const passwordHash = await hashPassword(password);

    const result = await db.transaction(async (tx) => {
      await EmailService.consumePasswordResetCode(email, code, tx);
      const [user] = await tx
        .update(users)
        .set({ passwordHash })
        .where(ilike(users.email, email))
        .returning({ id: users.id, email: users.email });
      if (!user?.email) throw new InvalidOtpError("کد تایید نامعتبر یا منقضی شده است");

      // A password reset is a security event: revoke every browser/device
      // session so a previously stolen cookie can no longer access the account.
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
      return user;
    });

    EmailService.sendPasswordChangedNotice(result.email!).catch((err) => {
      logger.warn({ err, userId: result.id }, "Password changed notice email failed");
    });

    const response = NextResponse.json({ success: true, message: "رمز عبور با موفقیت تغییر کرد. اکنون وارد حساب شوید." });
    response.cookies.set("session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    logger.info({ userId: result.id }, "Password reset completed and sessions revoked");
    return response;
  } catch (err) {
    if (err instanceof InvalidOtpError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    logger.error({ err }, "Password reset failed");
    return NextResponse.json({ error: "بازیابی رمز عبور با خطا مواجه شد" }, { status: 500 });
  }
}
