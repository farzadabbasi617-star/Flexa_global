/**
 * Creates a starter set of Call of Duty rooms through createCodRoom, so every
 * validation an operator would face runs for real: liability vs budget, banner
 * URL, schedule ordering, and the publish-readiness guard.
 *
 * Each room is created hidden. The operator reviews and publishes.
 *
 * Economics are deliberately conservative. Prize tables are quoted for a full
 * lobby and scale with turnout, so the margin below holds at any occupancy.
 *
 *   npx tsx scripts/seed-cod-rooms.ts            # create
 *   npx tsx scripts/seed-cod-rooms.ts --dry-run  # print the plan only
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

const SHARED_RULES = "استفاده از وسائل نقلیه به جز اسنوبرد در سه زون آخر ممنوع است. گان‌های بالستیک (پوریفایر، وار ماشین، تمپست، انهیلاتور) و آیتم self_revive ممنوع هستند. جریمه هر تخلف ۵۰ هزار تومان است. ارسال کد و لینک روم به افراد خارج از روم تخلف محسوب می‌شود.";

function faq(prizeText: string, settingsText: string) {
  return [
    { question: "جایزه به چه کسانی واریز میشود؟", answer: `${prizeText}\n\nتوجه: این مبالغ در صورت تکمیل ظرفیت است. اگر روم پر نشود، جایزه به همان نسبت محاسبه میشود. اگر روم به حد نصاب نرسد، لغو و ورودی‌ها به کیف پول برمیگردد.` },
    { question: "تنظیمات بازی به چه صورتی است ؟", answer: settingsText },
    { question: "قوانین بازی چگونه است؟", answer: SHARED_RULES },
    { question: "اگه کسی جامو گرفته بود چیکار کنم؟", answer: "در صورتی که کسی در جایگاه شما بود باید برین تو جایگاه تماشاگر (اسپکت) بشینید و به ادمین روم داخل چت گیم تایپ کنید شماره جایگاهتون رو تا چک کنه." },
    { question: "از کجا باید وارد بازی شیم؟", answer: "راس ساعت مشخص‌شده در اپلیکیشن گیمنت آنلاین باشید. بعد از Check-in، کد و پسورد روم برای شما نمایش داده میشود. فراموش نکنید که ارسال لینک و کد به دوستانتون تخلف محسوب میشه." },
    { question: "چجوری جایزه رو دریافت کنیم؟", answer: "چند دقیقه پس از اتمام روم و بررسی مدارک، در صورت برنده بودن حساب کیف پولتون شارژ میشه." },
  ];
}

const BASE = {
  region: "global",
  perspective: "tpp",
  status: "registration",
  isPublished: false,
  referralRateBps: 2_000,
  minRankPoints: 0,
  minCodLevel: 50,
  requiresRecording: true,
  rules: SHARED_RULES,
  rulesVersion: "cod-br-1",
};

interface Plan {
  title: string;
  description: string;
  map: string;
  teamMode: "solo" | "duo" | "squad";
  category: string;
  banner: string;
  capacity: number;
  entryToman: number;
  serviceToman: number;
  placements: Array<[number, number, number]>;
  perKillToman?: number;
  maxTotalKills?: number;
  startsAt: Date;
  minimumViableBps: number;
  settingsText: string;
  matchSettings: Record<string, unknown>;
}

const PLANS: Plan[] = [
  {
    title: "E-BR-ISO-002",
    description: "مپ بازی Isolated میباشد و شما در قالب ۲۵ تیم ۴ نفره وارد میدان نبرد میشوید.",
    map: "isolated", teamMode: "squad", category: "اقتصادی (سطح پایین)",
    banner: "/cod/banner-economy.jpg",
    capacity: 100, entryToman: 10_000, serviceToman: 2_000,
    placements: [[1, 1, 200_000], [2, 2, 160_000], [3, 3, 120_000], [4, 11, 40_000]],
    startsAt: tehran(2, 19, 0),
    minimumViableBps: 4_000,
    settingsText: "ریوایو فعال، لیمیتد امو خاموش (تیر بی‌نهایت)، سرعت زون: فست، گان‌های روی زمین دوبل.",
    matchSettings: { revive: "enabled", limitedAmmo: false, zoneSpeed: "fast", doubleGroundLoot: true, vehiclesEnabled: true },
  },
  {
    title: "SOLO-REBIRTH-003",
    description: "مپ بازی Rebirth Island میباشد، شما در قالب ۴۰ تیم ۱ نفره وارد میدان نبرد میشوید.",
    map: "rebirth", teamMode: "solo", category: "سولو",
    banner: "/cod/banner-rebirth.jpg",
    capacity: 40, entryToman: 25_000, serviceToman: 5_000,
    placements: [[1, 1, 260_000], [2, 2, 180_000], [3, 3, 120_000], [4, 4, 70_000], [5, 6, 30_000]],
    startsAt: tehran(3, 21, 0),
    minimumViableBps: 5_000,
    settingsText: "ریوایو غیرفعال (چون سولو است)، لیمیتد امو خاموش (تیر بی‌نهایت)، سرعت زون: فست.",
    matchSettings: { revive: "disabled", limitedAmmo: false, zoneSpeed: "fast", doubleGroundLoot: false, vehiclesEnabled: false },
  },
  {
    title: "DUO-ISO-004",
    description: "مپ بازی Isolated میباشد و شما در قالب ۲۰ تیم ۲ نفره وارد میدان نبرد میشوید.",
    map: "isolated", teamMode: "duo", category: "دابل",
    banner: "/cod/banner-isolated-br.jpg",
    capacity: 40, entryToman: 20_000, serviceToman: 4_000,
    placements: [[1, 1, 220_000], [2, 2, 150_000], [3, 3, 90_000], [4, 8, 30_000]],
    startsAt: tehran(4, 21, 0),
    minimumViableBps: 5_000,
    settingsText: "ریوایو فعال، لیمیتد امو خاموش (تیر بی‌نهایت)، سرعت زون: نرمال، گان‌های روی زمین دوبل.",
    matchSettings: { revive: "enabled", limitedAmmo: false, zoneSpeed: "normal", doubleGroundLoot: true, vehiclesEnabled: true },
  },
  {
    title: "KILL-ISO-005",
    description: "مپ بازی Isolated میباشد و شما در قالب ۱۲ تیم ۴ نفره وارد میدان نبرد میشوید. هر Kill جایزه نقدی دارد.",
    map: "isolated", teamMode: "squad", category: "کیلی",
    banner: "/cod/banner-killrace.jpg",
    capacity: 48, entryToman: 30_000, serviceToman: 6_000,
    placements: [],
    // 48 seats x 30,000 = 1,440,000 income. Capping total scoring kills at 40
    // holds the worst case to 40 x 25,000 = 1,000,000.
    perKillToman: 25_000, maxTotalKills: 40,
    startsAt: tehran(5, 21, 0),
    minimumViableBps: 5_000,
    settingsText: "اتو ریوایو فعال (اگه کیل بشین با پرواز بعدی برمیگردین)، لیمیتد امو خاموش، سرعت زون: فست، گان‌های روی زمین دوبل.",
    matchSettings: { revive: "auto", limitedAmmo: false, zoneSpeed: "fast", doubleGroundLoot: true, vehiclesEnabled: true },
  },
];

function prizeText(plan: Plan) {
  if (plan.perKillToman) {
    return `به ازای هر Kill که در بازی میگیرید ${plan.perKillToman.toLocaleString("fa-IR")} تومان به کیف پول شما واریز میشود.`;
  }
  const subject = plan.teamMode === "solo" ? "نفر" : "تیم";
  const parts = plan.placements.map(([from, to, amount]) =>
    from === to
      ? `${subject} ${from.toLocaleString("fa-IR")}: ${amount.toLocaleString("fa-IR")} تومان`
      : `${subject} ${from.toLocaleString("fa-IR")} تا ${to.toLocaleString("fa-IR")}: هر ${subject} ${amount.toLocaleString("fa-IR")} تومان`);
  return parts.join("، ") + " (کیف‌پول داخلی) شارژ میشود.";
}

function buildRoom(plan: Plan) {
  const rewardConfig = {
    perKillRial: plan.perKillToman ? toRial(plan.perKillToman) : "0",
    participationRial: "0",
    maxKillsPerEntry: 40,
    maxTotalKills: plan.maxTotalKills ?? 0,
    placementPayout: "per_team" as const,
    killLadder: null,
    placementRules: plan.placements.map(([from, to, amount]) => ({ from, to, amountRial: toRial(amount) })),
  };
  const liability = estimateCodRoomMaximumLiability(rewardConfig, plan.capacity, plan.teamMode);
  const startsAt = plan.startsAt;
  return {
    room: {
      ...BASE,
      title: plan.title,
      description: plan.description,
      map: plan.map,
      teamMode: plan.teamMode,
      category: plan.category,
      bannerImageUrl: plan.banner,
      capacity: plan.capacity,
      entryFeeRial: toRial(plan.entryToman),
      serviceFeeRial: toRial(plan.serviceToman),
      // Budget must cover the worst case the engine computes, exactly.
      prizeBudgetRial: liability.toString(),
      rewardConfig,
      prizeScaling: { mode: "scaled", fullPayoutAtBps: 10_000, minimumViableBps: plan.minimumViableBps },
      matchSettings: plan.matchSettings,
      faq: faq(prizeText(plan), plan.settingsText),
      startsAt: startsAt.toISOString(),
      checkInOpensAt: new Date(startsAt.getTime() - 45 * 60_000).toISOString(),
      checkInClosesAt: new Date(startsAt.getTime() + 5 * 60_000).toISOString(),
      credentialsRevealAt: new Date(startsAt.getTime() - 15 * 60_000).toISOString(),
      // A placeholder so the room is publishable; the operator swaps in the real
      // code from the game before credentialsRevealAt. Hidden from players until
      // then, and only ever shown to those who checked in.
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

  for (const plan of PLANS) {
    const [exists] = await db.select({ id: codRooms.id }).from(codRooms).where(eq(codRooms.title, plan.title)).limit(1);
    if (exists) { console.log(`- ${plan.title}: already exists, skipped`); continue; }

    const { room, liability } = buildRoom(plan);
    const income = BigInt(plan.entryToman) * BigInt(plan.capacity);
    const payout = liability / BigInt(10);
    const margin = Number(((income - payout) * BigInt(100)) / income);

    console.log(`- ${plan.title} [${plan.category}]`);
    console.log(`    ${plan.capacity} seats @ ${plan.entryToman.toLocaleString()} = ${income.toLocaleString()} toman`);
    console.log(`    max payout ${payout.toLocaleString()} toman -> margin ${margin}%`);
    if (margin < 15) throw new Error(`${plan.title}: margin ${margin}% is too thin, refusing to seed`);

    if (dryRun) continue;
    const created = await createCodRoom(room, admin.id);
    console.log(`    created ${created.id} (hidden)`);
  }
  console.log(dryRun ? "\ndry run: nothing written" : "\ndone — review and publish from /admin/cod-arena");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
