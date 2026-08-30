import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { registrations, players, tournaments, transactions, wallets } from "@/db/schema";
import { and, eq, count, sql } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { checkAgeGate } from "@/lib/age-gate";
import { getEntryFeeRial } from "@/lib/tournament-finance";
import { evaluateUserAchievements } from "@/lib/achievement-service";
import { notifyLinkedUserOnTelegram } from "@/lib/telegram";
import { formatTomanFromRial, bigIntFromText } from "@/lib/money";
import logger from "@/lib/logger";
import { z } from "zod";
import { CLASH_1V1_CONFIG } from "@/lib/clash-1v1";
import { CLASH_PRIVATE_DRAFT_CATEGORY } from "@/lib/clash-private-tournament";
import { ensurePrivateTournamentAttendanceSchema } from "@/lib/private-tournament-attendance";
import { serverBotUsername } from "@/lib/telegram-bot-username";

export const dynamic = "force-dynamic";

const registrationSchema = z.object({
  tournamentId: z.string().uuid(),
  playerId: z.string().uuid(),
  policyAccepted: z.boolean().optional().default(false),
});

function isPgUniqueViolation(error: unknown) {
  const maybe = error as { code?: string; cause?: { code?: string } };
  return maybe?.code === "23505" || maybe?.cause?.code === "23505";
}

function telegramBotStartLink(payload: string) {
  const username = serverBotUsername();
  return `https://t.me/${username}?start=${encodeURIComponent(payload)}`;
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";

    if (!token) return NextResponse.json({ error: "برای ثبت‌نام باید وارد حساب شوی." }, { status: 401 });

    const user = await validateSession(token, ip, ua, request);
    if (!user) return NextResponse.json({ error: "نشست کاربری معتبر نیست. دوباره وارد شو." }, { status: 401 });

    const body = await request.json();
    const validation = registrationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "ورودی‌های ارسالی نامعتبر هستند.", details: validation.error.format() }, { status: 400 });
    }
    const { tournamentId, playerId, policyAccepted } = validation.data;

    const isAdmin = user.role === "admin" || user.role === "super_admin";
    await ensurePrivateTournamentAttendanceSchema();

    const result = await db.transaction(async (tx) => {
      const [player] = await tx
        .select({ id: players.id, ownerId: players.visibleUserId, displayName: players.displayName })
        .from(players)
        .where(eq(players.id, playerId));

      if (!player) throw new Error("PLAYER_NOT_FOUND");
      if (!isAdmin && player.ownerId !== user.id) throw new Error("PLAYER_FORBIDDEN");

      // Lock the tournament row for the rest of this transaction. This makes
      // capacity checks and paid registrations serial for the same tournament
      // and prevents overbooking under concurrent requests.
      await tx.execute(sql`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`);

      const [tournament] = await tx
        .select({
          id: tournaments.id,
          name: tournaments.name,
          game: tournaments.game,
          status: tournaments.status,
          maxPlayers: tournaments.maxPlayers,
          entryFee: tournaments.entryFee,
          categoryLabel: tournaments.categoryLabel,
        })
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId));

      if (!tournament) throw new Error("TOURNAMENT_NOT_FOUND");
      if (tournament.game === CLASH_1V1_CONFIG.game && tournament.categoryLabel === CLASH_1V1_CONFIG.categoryLabel) {
        throw new Error("CLASH_1V1_TELEGRAM_ONLY");
      }
      if (tournament.status !== "registration") throw new Error("REGISTRATION_CLOSED");
      if (
        tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY &&
        (!user.clashRoyaleId || user.clashRoyaleStatus !== "verified")
      ) throw new Error("CLASH_TAG_NOT_VERIFIED");
      if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY && !isAdmin && !policyAccepted) {
        throw new Error("PRIVATE_POLICY_REQUIRED");
      }

      const ownerId = player.ownerId ?? user.id;

      const [existing] = await tx
        .select({ id: registrations.id })
        .from(registrations)
        .where(and(eq(registrations.tournamentId, tournamentId), eq(registrations.playerId, playerId)));
      if (existing) throw new Error("DUPLICATE_REGISTRATION");

      const [existingUserRegistration] = await tx
        .select({ id: registrations.id })
        .from(registrations)
        .where(and(eq(registrations.tournamentId, tournamentId), eq(registrations.visibleUserId, ownerId)));
      if (existingUserRegistration) throw new Error("DUPLICATE_REGISTRATION");

      const [{ value: registeredCount }] = await tx
        .select({ value: count() })
        .from(registrations)
        .where(eq(registrations.tournamentId, tournamentId));

      if (registeredCount >= tournament.maxPlayers) throw new Error("TOURNAMENT_FULL");
      const entryFeeRial = getEntryFeeRial(tournament.entryFee);
      let paymentTransactionId: string | null = null;

      if (!isAdmin && entryFeeRial > BigInt(0)) {
        // Age-gate: paid tournaments are for adults only, and require a
        // registered national ID. Free tournaments are NOT affected by this
        // block — under-18s can still enjoy the free side of the app.
        const gate = checkAgeGate({ birthDate: user.birthDate, nationalId: user.nationalId });
        if (!gate.ok) {
          const err = new Error("AGE_GATE_BLOCKED");
          (err as Error & { details?: unknown }).details = { code: gate.code, message: gate.message };
          throw err;
        }

        let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, ownerId)).limit(1);
        if (!wallet) {
          [wallet] = await tx.insert(wallets).values({ userId: ownerId, balance: "0", currency: "RIAL" }).returning();
        }

        const updateResult = await tx.update(wallets)
          .set({ 
            balance: sql`${wallets.balance} - ${entryFeeRial.toString()}`, 
            updatedAt: new Date() 
          })
          .where(and(
            eq(wallets.id, wallet.id),
            sql`${wallets.balance} >= ${entryFeeRial.toString()}`
          ));

        if (updateResult.rowCount === 0) {
          const err = new Error("INSUFFICIENT_BALANCE");
          (err as Error & { details?: unknown }).details = {
            requiredToman: Number(entryFeeRial / BigInt(10)),
          };
          throw err;
        }

        const [paymentTx] = await tx
          .insert(transactions)
          .values({
            walletId: wallet.id,
            amount: entryFeeRial.toString(),
            type: "entry_fee",
            status: "completed",
            referenceId: `entry-${tournamentId}-${playerId}-${Date.now()}`,
            metadata: {
              tournamentId,
              tournamentName: tournament.name,
              playerId,
              playerName: player.displayName,
              userId: ownerId,
            },
          })
          .returning();

        paymentTransactionId = paymentTx.id;
      }

      const [reg] = await tx
        .insert(registrations)
        .values({
          tournamentId,
          playerId,
          visibleUserId: ownerId,
          attendanceStatus: "registered",
          cancellationPolicyAcceptedAt: tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY ? new Date() : null,
        })
        .returning();

      return { registration: reg, entryFeeRial: entryFeeRial.toString(), paymentTransactionId, tournamentName: tournament.name, tournamentGame: tournament.game, tournamentCategory: tournament.categoryLabel, playerName: player.displayName };
    });

    await evaluateUserAchievements(result.registration.visibleUserId).catch(() => undefined);
    const needsClashQr = result.tournamentGame === "clash_royale"
      && result.tournamentCategory === CLASH_1V1_CONFIG.categoryLabel
      && bigIntFromText(result.entryFeeRial) > BigInt(0);
    const appUrl = process.env.APP_URL || "https://www.flexa1.ir";
    const replyKeyboard = {
      inline_keyboard: [
        ...(needsClashQr ? [[{ text: "⚔️ 1V1 کلش رویال", url: telegramBotStartLink(`qr_${result.registration.tournamentId}`) }]] : []),
        [{ text: "مشاهده تورنومنت", url: `${appUrl}/tournaments/${result.registration.tournamentId}` }],
      ],
    };
    const qrLine = needsClashQr ? "\n\n🔗 مرحله بعد: در Clash Royale روی «اشتراک‌گذاری پیوند» بزن و پیوند دوستی را برای بات بفرست تا حریف 1V1 خودکار پیدا شود. عکس QR پذیرفته نمی‌شود." : "";
    await notifyLinkedUserOnTelegram(
      result.registration.visibleUserId,
      `✅ <b>ثبت‌نام تورنومنت انجام شد</b>

🏆 ${result.tournamentName}
👤 بازیکن: <b>${result.playerName}</b>
💳 ورودی: <b>${formatTomanFromRial(bigIntFromText(result.entryFeeRial))}</b>${qrLine}

زمان چک‌این، لابی و نتیجه‌ها از همین ربات هم اطلاع‌رسانی می‌شود.`,
      replyKeyboard
    ).catch(() => undefined);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = isPgUniqueViolation(err) ? "DUPLICATE_REGISTRATION" : err instanceof Error ? err.message : "UNKNOWN";

    const errors: Record<string, { text: string; status: number }> = {
      PLAYER_NOT_FOUND: { text: "پروفایل بازیکن پیدا نشد.", status: 404 },
      PLAYER_FORBIDDEN: { text: "فقط می‌توانی پروفایل بازیکن خودت را ثبت‌نام کنی.", status: 403 },
      TOURNAMENT_NOT_FOUND: { text: "تورنومنت پیدا نشد.", status: 404 },
      REGISTRATION_CLOSED: { text: "ثبت‌نام این تورنومنت بسته شده است.", status: 409 },
      DUPLICATE_REGISTRATION: { text: "این بازیکن قبلاً در تورنومنت ثبت‌نام شده است.", status: 409 },
      TOURNAMENT_FULL: { text: "ظرفیت تورنومنت تکمیل شده است.", status: 409 },
      CLASH_TAG_NOT_VERIFIED: { text: "برای ثبت‌نام، ابتدا Player Tag کلش رویال را در پروفایل با Supercell API تأیید کن.", status: 409 },
      PRIVATE_POLICY_REQUIRED: { text: "برای ثبت‌نام باید قانون No-show و عدم بازگشت وجه را بپذیری.", status: 409 },
      CLASH_1V1_TELEGRAM_ONLY: { text: "ثبت‌نام 1V1 کلش فقط از بات انجام می‌شود تا پرداخت و QR امن ثبت شود.", status: 409 },
    };

    if (message === "INSUFFICIENT_BALANCE") {
      const details = (err as Error & { details?: { requiredToman?: number; balanceToman?: number } }).details;
      const required = details?.requiredToman?.toLocaleString("fa-IR") || "نامشخص";
      return NextResponse.json(
        {
          error: `موجودی کیف پول کافی نیست. مبلغ لازم: ${required} USDT.`,
          code: "INSUFFICIENT_BALANCE",
          details,
        },
        { status: 402 }
      );
    }

    if (message === "AGE_GATE_BLOCKED") {
      const details = (err as Error & { details?: { code?: string; message?: string } }).details;
      return NextResponse.json(
        {
          error: details?.message || "برای شرکت در تورنومنت‌های پولی باید بالای ۱۸ سال باشید.",
          code: "AGE_GATE_BLOCKED",
          reason: details?.code,
        },
        { status: 403 }
      );
    }

    if (errors[message]) {
      return NextResponse.json({ error: errors[message].text, code: message }, { status: errors[message].status });
    }

    logger.error({ err }, "Registration (tournament) error");
    return NextResponse.json({ error: "ثبت‌نام در تورنومنت با خطا مواجه شد." }, { status: 500 });
  }
}
