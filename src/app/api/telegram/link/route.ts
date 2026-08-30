import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { telegramAccounts, telegramLinkCodes, telegramPreRegistrations, telegramReferrals, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { sendTelegramMessage } from "@/lib/telegram";
import { LevelingService } from "@/lib/leveling-service";
import logger from "@/lib/logger";
import { bindAffiliateAttribution } from "@/lib/affiliate-service";

export const dynamic = "force-dynamic";

function codeHash(code: string) {
  return crypto.createHash("sha256").update(code.trim()).digest("hex");
}

function normalizeCode(value: unknown) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function isAuthError(auth: { user: unknown; error: string | null | undefined; status?: number }) {
  return auth.error || !auth.user;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (isAuthError(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });

    const user = auth.user!;
    const [account] = await db
      .select({
        id: telegramAccounts.id,
        telegramId: telegramAccounts.telegramId,
        telegramUsername: telegramAccounts.telegramUsername,
        telegramFirstName: telegramAccounts.telegramFirstName,
        telegramLastName: telegramAccounts.telegramLastName,
        linkedAt: telegramAccounts.linkedAt,
        updatedAt: telegramAccounts.updatedAt,
      })
      .from(telegramAccounts)
      .where(eq(telegramAccounts.userId, user.id))
      .limit(1);

    return NextResponse.json({ linked: Boolean(account), account: account || null });
  } catch (err) {
    logger.error({ err }, "Telegram link GET failed");
    return NextResponse.json({ error: "وضعیت اتصال تلگرام دریافت نشد." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (isAuthError(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });

    const body = await request.json();
    const code = normalizeCode(body.code);
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "کد اتصال باید ۶ رقم باشد." }, { status: 400 });
    }

    const [linkCode] = await db
      .select()
      .from(telegramLinkCodes)
      .where(and(eq(telegramLinkCodes.codeHash, codeHash(code)), isNull(telegramLinkCodes.usedAt), gt(telegramLinkCodes.expiresAt, new Date())))
      .orderBy(telegramLinkCodes.createdAt)
      .limit(1);

    if (!linkCode) {
      return NextResponse.json({ error: "کد نامعتبر یا منقضی شده است. از ربات دوباره /link بگیر." }, { status: 404 });
    }

    const user = auth.user!;
    const account = await db.transaction(async (tx) => {
      // Keep Telegram account <-> Flexa account one-to-one.
      await tx
        .delete(telegramAccounts)
        .where(or(eq(telegramAccounts.userId, user.id), eq(telegramAccounts.telegramId, linkCode.telegramId)));

      const [created] = await tx
        .insert(telegramAccounts)
        .values({
          telegramId: linkCode.telegramId,
          telegramUsername: linkCode.telegramUsername,
          telegramFirstName: linkCode.telegramFirstName,
          telegramLastName: linkCode.telegramLastName,
          userId: user.id,
          linkedAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await tx
        .update(telegramLinkCodes)
        .set({ usedAt: new Date() })
        .where(eq(telegramLinkCodes.id, linkCode.id));

      await tx
        .update(telegramPreRegistrations)
        .set({ linkedUserId: user.id, flexaId: user.flexaId, updatedAt: new Date() })
        .where(eq(telegramPreRegistrations.telegramId, linkCode.telegramId));

      return created;
    });

    await bindAffiliateAttribution(linkCode.telegramId, user.id).catch((err) => {
      logger.warn({ err, userId: user.id, telegramId: linkCode.telegramId }, "Failed to bind affiliate attribution");
    });

    await db.transaction(async (tx) => {
      await LevelingService.addXP(tx, user.id, 50);
    }).catch((err) => logger.warn({ err, userId: user.id }, "Failed to reward Telegram link XP"));

    const [referral] = await db
      .select({ referrerTelegramId: telegramReferrals.referrerTelegramId })
      .from(telegramReferrals)
      .where(eq(telegramReferrals.referredTelegramId, linkCode.telegramId))
      .limit(1);
    if (referral?.referrerTelegramId) {
      const [referrer] = await db
        .select({ userId: telegramAccounts.userId })
        .from(telegramAccounts)
        .where(eq(telegramAccounts.telegramId, referral.referrerTelegramId))
        .limit(1);
      if (referrer?.userId) {
        await db.transaction(async (tx) => {
          await LevelingService.addXP(tx, referrer.userId, 50);
        }).catch((err) => logger.warn({ err, userId: referrer.userId }, "Failed to reward referral XP"));
        await sendTelegramMessage(referral.referrerTelegramId, `🎉 یک کاربر دعوتی شما حسابش را لینک کرد.\n🎁 +50 XP برای دعوت موفق!`).catch(() => undefined);
      }
    }

    await sendTelegramMessage(
      linkCode.telegramId,
      `✅ حساب تلگرام شما با موفقیت به حساب Flexa لینک شد.\n\n👤 ${user.displayName}\n🆔 <code>${user.flexaId}</code>\n🎁 +50 XP`
    ).catch((err) => logger.warn({ err, telegramId: linkCode.telegramId }, "Failed to notify linked Telegram user"));

    return NextResponse.json({ ok: true, linked: true, account });
  } catch (err) {
    logger.error({ err }, "Telegram link POST failed");
    return NextResponse.json({ error: "اتصال تلگرام انجام نشد." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (isAuthError(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });

    const user = auth.user!;
    const [account] = await db
      .select({ telegramId: telegramAccounts.telegramId })
      .from(telegramAccounts)
      .where(eq(telegramAccounts.userId, user.id))
      .limit(1);

    await db.transaction(async (tx) => {
      await tx.delete(telegramAccounts).where(eq(telegramAccounts.userId, user.id));
      if (account?.telegramId) {
        await tx
          .update(telegramPreRegistrations)
          .set({ linkedUserId: null, updatedAt: new Date() })
          .where(eq(telegramPreRegistrations.telegramId, account.telegramId));
      }
    });

    if (account?.telegramId) {
      await sendTelegramMessage(account.telegramId, "🔓 اتصال حساب تلگرام از حساب Flexa شما حذف شد.").catch(() => undefined);
    }

    return NextResponse.json({ ok: true, linked: false });
  } catch (err) {
    logger.error({ err }, "Telegram link DELETE failed");
    return NextResponse.json({ error: "حذف اتصال تلگرام انجام نشد." }, { status: 500 });
  }
}
