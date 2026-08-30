/**
 * Creates the free "شانس مجدد" (Second Chance) room.
 *
 * Marketing room: no entry fee, 5,000 toman per kill. It exists to give players
 * who never finish in the top 10 a reason to come back, and to give referrers
 * something concrete to invite people to.
 *
 * The budget only holds because of three deliberate choices:
 *
 *  1. **Solo.** No squads, so no shared placement prizes to reason about.
 *  2. **Revive disabled and self-revive banned.** In a battle royale with
 *     revives enabled a 90-player lobby produces 150-220 kills, not 90. With
 *     revives off every death is final, so the lobby can produce at most
 *     `capacity - 1` kills.
 *  3. **`maxTotalKills` set explicitly.** The default is 0, which means "no
 *     room-wide cap" and would have exposed 90 x 8 x 5,000 = 3,600,000.
 *
 * Worst case is therefore 90 x 5,000 = 450,000 toman, and settlement enforces
 * it (see `codKillBudgetScaleBps`).
 *
 *   npx tsx scripts/seed-second-chance-room.ts --dry-run
 *   npx tsx scripts/seed-second-chance-room.ts
 */
import { db } from "@/db";
import { codRooms, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createCodRoom } from "@/lib/cod-room-service";
import { estimateCodRoomMaximumLiability } from "@/lib/cod-room-policy";

const toRial = (toman: number) => String(BigInt(toman) * BigInt(10));

/** Tehran is UTC+3:30 year round. */
function tehran(daysAhead: number, hour: number, minute = 0) {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead,
    hour - 3, minute - 30, 0, 0,
  ));
}

const TITLE = "FREE-SECOND-CHANCE-001";
const CAPACITY = 90;
const PER_KILL_TOMAN = 5_000;
const MAX_KILLS_PER_ENTRY = 8;

const RULES = [
  "این روم رایگان است و هیچ ورودی از کیف پول شما کسر نمیشود.",
  "بازی به صورت سولو (تک نفره) برگزار میشود.",
  "ریوایو غیرفعال است و استفاده از آیتم Self Revive ممنوع است. هر مرگ نهایی است.",
  "به ازای هر Kill مبلغ ۵٬۰۰۰ تومان به کیف پول شما واریز میشود.",
  "سقف امتیازدهی هر بازیکن ۸ Kill است.",
  "گان‌های بالستیک (پوریفایر، وار ماشین، تمپست، انهیلاتور) ممنوع هستند.",
  "ارسال کد و لینک روم به افراد خارج از روم تخلف محسوب میشود.",
].join(" ");

const SETTINGS_TEXT = "سولو، ریوایو غیرفعال، آیتم Self Revive ممنوع، لیمیتد امو خاموش (تیر بی‌نهایت)، سرعت زون: فست.";

const FAQ = [
  {
    question: "این روم واقعا رایگان است؟",
    answer: "بله. هیچ مبلغی بابت ورود از کیف پول شما کسر نمیشود. این روم برای معرفی گیمنت ساخته شده است.",
  },
  {
    question: "جایزه چطور محاسبه میشود؟",
    answer: `به ازای هر Kill مبلغ ${PER_KILL_TOMAN.toLocaleString("fa-IR")} تومان به کیف پول شما واریز میشود. سقف امتیازدهی هر بازیکن ${MAX_KILLS_PER_ENTRY.toLocaleString("fa-IR")} Kill است.\n\nکل بودجه Kill این روم ${(CAPACITY * PER_KILL_TOMAN).toLocaleString("fa-IR")} تومان است. اگر مجموع Killهای ثبت‌شده از سقف روم بیشتر شود، همان بودجه بین Killها تقسیم میشود.`,
  },
  {
    question: "چرا ریوایو خاموش است؟",
    answer: "چون در حالت ریوایو یک بازیکن چند بار میمیرد و تعداد Kill لابی چند برابر میشود. با ریوایو خاموش، بازی منصفانه‌تر و بودجه جایزه شفاف است.",
  },
  {
    question: "از کجا باید وارد بازی شیم؟",
    answer: "راس ساعت مشخص‌شده در اپلیکیشن گیمنت آنلاین باشید. بعد از Check-in، کد و پسورد روم برای شما نمایش داده میشود.",
  },
  {
    question: "چجوری جایزه رو دریافت کنیم؟",
    answer: "چند دقیقه پس از اتمام روم و بررسی مدارک، کیف پول شما شارژ میشود.",
  },
];

function buildRoom() {
  const rewardConfig = {
    perKillRial: toRial(PER_KILL_TOMAN),
    participationRial: "0",
    maxKillsPerEntry: MAX_KILLS_PER_ENTRY,
    // The whole point. Without this the ceiling is capacity x maxKillsPerEntry.
    maxTotalKills: CAPACITY,
    placementPayout: "per_team" as const,
    killLadder: null,
    placementRules: [],
  };
  const liability = estimateCodRoomMaximumLiability(rewardConfig, CAPACITY, "solo");
  const startsAt = tehran(6, 21, 0);
  return {
    room: {
      title: TITLE,
      description: "روم رایگان شانس مجدد. بدون ورودی، به ازای هر Kill پنج هزار تومان. سولو، ریوایو غیرفعال.",
      game: "cod_mobile",
      region: "global",
      map: "isolated",
      teamMode: "solo",
      perspective: "tpp",
      status: "registration",
      isPublished: false,
      category: "رایگان",
      bannerImageUrl: "/cod/banner-rebirth.jpg",
      capacity: CAPACITY,
      entryFeeRial: "0",
      serviceFeeRial: "0",
      prizeBudgetRial: liability.toString(),
      referralRateBps: 2_000,
      minRankPoints: 0,
      minCodLevel: 50,
      requiresRecording: true,
      rules: RULES,
      rulesVersion: "cod-free-1",
      rewardConfig,
      // A free room has no entry income to scale against, so the advertised
      // per-kill amount stays constant regardless of turnout.
      prizeScaling: { mode: "fixed", fullPayoutAtBps: 10_000, minimumViableBps: 0 },
      matchSettings: {
        revive: "disabled",
        limitedAmmo: false,
        zoneSpeed: "fast",
        doubleGroundLoot: false,
        vehiclesEnabled: true,
      },
      faq: FAQ,
      startsAt: startsAt.toISOString(),
      checkInOpensAt: new Date(startsAt.getTime() - 45 * 60_000).toISOString(),
      checkInClosesAt: new Date(startsAt.getTime() + 5 * 60_000).toISOString(),
      credentialsRevealAt: new Date(startsAt.getTime() - 15 * 60_000).toISOString(),
      roomCode: String(Math.floor(1_000_000 + Math.random() * 9_000_000)),
      roomPassword: String(Math.floor(1_000 + Math.random() * 9_000)),
    },
    liability,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.gamentId, "FLX-3212")).limit(1);
  if (!admin) throw new Error("admin FLX-3212 not found");

  const [exists] = await db.select({ id: codRooms.id }).from(codRooms).where(eq(codRooms.title, TITLE)).limit(1);
  if (exists) {
    console.log(`- ${TITLE}: already exists, skipped`);
    process.exit(0);
  }

  const { room, liability } = buildRoom();
  const payoutToman = liability / BigInt(10);

  console.log(`- ${TITLE} [رایگان]`);
  console.log(`  ${CAPACITY} seats, solo, no entry fee`);
  console.log(`  ${PER_KILL_TOMAN.toLocaleString("en-US")} toman per kill, max ${MAX_KILLS_PER_ENTRY} scoring kills per player`);
  console.log(`  room-wide kill cap: ${CAPACITY}`);
  console.log(`  worst-case cost:    ${payoutToman.toLocaleString()} toman`);
  console.log(`  revive: disabled (self-revive banned in the rules)`);

  if (dryRun) {
    console.log("\n(dry run, nothing written)");
    process.exit(0);
  }

  const created = await createCodRoom(room as never, admin.id);
  console.log(`\n  created hidden: ${created.id}`);
  console.log("  Replace the placeholder room code, then publish.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
