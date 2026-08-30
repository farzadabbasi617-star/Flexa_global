import { NextRequest, NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramAccounts, registrations, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { LevelingService } from "@/lib/leveling-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const QUESTS = {
  game_ids: { xp: 50, title: "ثبت شناسه‌های بازی" },
  telegram_link: { xp: 50, title: "اتصال به ربات تلگرام" },
  join_tournament: { xp: 100, title: "اولین رقابت" },
  level_5: { xp: 150, title: "کهنه‌کار نوپا" },
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
    }

    const user = auth.user!;
    const body = await request.json().catch(() => ({}));
    const { questId } = body;

    if (!questId || !QUESTS[questId as keyof typeof QUESTS]) {
      return NextResponse.json({ error: "کد مأموریت معتبر نیست." }, { status: 400 });
    }

    const quest = QUESTS[questId as keyof typeof QUESTS];

    // Load fresh user data to get accurate metadata and level details
    const [freshUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!freshUser) {
      return NextResponse.json({ error: "کاربر پیدا نشد." }, { status: 404 });
    }

    const metadata = (freshUser.metadata as Record<string, any>) || {};
    const claimedQuests = (metadata.claimedQuests as string[]) || [];

    if (claimedQuests.includes(questId)) {
      return NextResponse.json({ error: "جایزه این مأموریت قبلاً دریافت شده است." }, { status: 400 });
    }

    // 1. Verify Eligibility based on actual database stats to prevent cheating
    let isEligible = false;

    if (questId === "game_ids") {
      isEligible = Boolean(freshUser.clashRoyaleId || freshUser.codMobileId || freshUser.fortniteId);
    } else if (questId === "telegram_link") {
      const [linked] = await db
        .select({ id: telegramAccounts.id })
        .from(telegramAccounts)
        .where(eq(telegramAccounts.userId, user.id))
        .limit(1);
      isEligible = Boolean(linked);
    } else if (questId === "join_tournament") {
      const [regCount] = await db
        .select({ value: count() })
        .from(registrations)
        .where(eq(registrations.visibleUserId, user.id));
      isEligible = Boolean(regCount.value > 0);
    } else if (questId === "level_5") {
      isEligible = Boolean(freshUser.level >= 5);
    }

    if (!isEligible) {
      return NextResponse.json({ error: "شما هنوز شرایط تکمیل این مأموریت را کسب نکرده‌اید." }, { status: 400 });
    }

    // 2. Transactionally add XP and update claimed metadata
    const result = await db.transaction(async (tx) => {
      // Add XP using LevelingService
      const levelingResult = await LevelingService.addXP(tx, user.id, quest.xp);
      
      // Update metadata
      const newClaimed = [...claimedQuests, questId];
      const newMetadata = { ...metadata, claimedQuests: newClaimed };

      await tx
        .update(users)
        .set({ metadata: newMetadata })
        .where(eq(users.id, user.id));

      return {
        xp: levelingResult.xp,
        level: levelingResult.level,
        claimedQuests: newClaimed
      };
    });

    logger.info({ userId: user.id, questId, xpReward: quest.xp }, "User claimed quest reward successfully");

    return NextResponse.json({
      success: true,
      message: `مأموریت "${quest.title}" با موفقیت تکمیل شد و ${quest.xp} XP به شما تعلق گرفت!`,
      xpAdded: quest.xp,
      newXP: result.xp,
      newLevel: result.level,
      claimedQuests: result.claimedQuests,
    });
  } catch (err) {
    logger.error({ err }, "Failed to claim quest reward");
    return NextResponse.json({ error: "تکمیل مأموریت انجام نشد." }, { status: 500 });
  }
}
