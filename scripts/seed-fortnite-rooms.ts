/**
 * Seeds Fortnite rooms through createCodRoom, so the same validation an operator
 * faces runs for real: liability vs budget, banner URL, schedule ordering and the
 * publish-readiness guard.
 *
 * Fortnite differs from Call of Duty in ways the engine now reads from
 * arena-games.ts:
 *   - regions are eu/nae/naw/me/asia/oce/brazil, and a player is not tied to one
 *   - trio is a real team mode
 *   - lobbies are entered with an Epic Custom Matchmaking Key, not an invite link
 *   - there is no account-level gate
 *
 * Rooms are created hidden. The operator swaps the placeholder key for the real
 * one and publishes.
 *
 *   npx tsx scripts/seed-fortnite-rooms.ts --dry-run
 *   npx tsx scripts/seed-fortnite-rooms.ts
 */
import { db } from "@/db";
import { codRooms, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createCodRoom } from "@/lib/cod-room-service";
import { estimateCodRoomMaximumLiability } from "@/lib/cod-room-policy";
import { arenaCompositionLabel } from "@/lib/arena-games";

const toRial = (toman: number) => String(BigInt(toman) * BigInt(10));

/** Tehran is UTC+3:30 year round. */
function tehran(daysAhead: number, hour: number, minute = 0) {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead,
    hour - 3, minute - 30, 0, 0,
  ));
}

const RULES = "استفاده از هرگونه چیت، اسکریپت، مکرو و برنامه جانبی ممنوع است. تیم‌آپ با تیم دیگر (تبانی) ممنوع است و نتیجه هر دو تیم باطل می‌شود. خروج زودهنگام از مسابقه بدون هماهنگی، No-show محسوب می‌شود. ارسال کد روم به افراد خارج از مسابقه تخلف است و باعث حذف بدون بازگشت ورودی می‌شود. ضبط تصویر از شروع تا نمایش نتیجه نهایی الزامی است.";

function faq(prizeText: string, settingsText: string) {
  return [
    { question: "جایزه به چه کسانی واریز میشود؟", answer: `${prizeText}\n\nتوجه: این مبالغ در صورت تکمیل ظرفیت است. اگر روم پر نشود، جایزه به همان نسبت محاسبه میشود. اگر روم به حد نصاب نرسد، لغو و ورودی‌ها به کیف پول برمیگردد.` },
    { question: "تنظیمات بازی به چه صورتی است ؟", answer: settingsText },
    { question: "قوانین بازی چگونه است؟", answer: RULES },
    { question: "چطور وارد روم شویم؟", answer: "بعد از Check-in، کد روم (Custom Matchmaking Key) در صفحه روم برای شما نمایش داده میشود. در فورتنایت وارد منوی بازی شوید، گزینه Custom Matchmaking را باز کنید، کد را وارد کنید و منتظر بمانید تا ادمین مسابقه را استارت بزند." },
    { question: "سرور کدام ریجن است؟", answer: "ریجن روم در بالای همین صفحه نوشته شده است. قبل از شروع، در تنظیمات فورتنایت همان ریجن (Matchmaking Region) را انتخاب کنید؛ در غیر این صورت وارد لابی نمیشوید." },
    { question: "چجوری جایزه رو دریافت کنیم؟", answer: "چند دقیقه پس از اتمام مسابقه و بررسی مدارک، در صورت برنده بودن حساب کیف پولتون شارژ میشه." },
  ];
}

interface Plan {
  title: string;
  description: string;
  teamMode: "solo" | "duo" | "trio" | "squad";
  map: string;
  region: string;
  category: string;
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
    title: "FN-SQUAD-001",
    description: "بتل رویال فورتنایت، ۲۵ تیم ۴ نفره روی سرور خاورمیانه.",
    teamMode: "squad", map: "br_island", region: "me", category: "فورتنایت — اسکواد",
    capacity: 100, entryToman: 20_000, serviceToman: 4_000,
    placements: [[1, 1, 350_000], [2, 2, 260_000], [3, 3, 180_000], [4, 10, 60_000]],
    startsAt: tehran(3, 21, 30),
    minimumViableBps: 5_000,
    settingsText: "حالت: Battle Royale کلاسیک با ساخت‌وساز، زاویه دید سوم‌شخص، ریسپاون غیرفعال.",
    matchSettings: { revive: "disabled", limitedAmmo: true, zoneSpeed: "normal", doubleGroundLoot: false, vehiclesEnabled: true },
  },
  {
    title: "FN-ZB-DUO-002",
    description: "زیرو بیلد فورتنایت، ۲۰ تیم ۲ نفره. بدون ساخت‌وساز، فقط مهارت تیراندازی.",
    teamMode: "duo", map: "zero_build", region: "me", category: "فورتنایت — زیرو بیلد",
    capacity: 40, entryToman: 15_000, serviceToman: 3_000,
    placements: [[1, 1, 150_000], [2, 2, 100_000], [3, 3, 65_000], [4, 6, 20_000]],
    startsAt: tehran(4, 21, 30),
    minimumViableBps: 5_000,
    settingsText: "حالت: Zero Build (بدون ساخت‌وساز)، زاویه دید سوم‌شخص، سپر اضافه فعال.",
    matchSettings: { revive: "disabled", limitedAmmo: true, zoneSpeed: "normal", doubleGroundLoot: false, vehiclesEnabled: true },
  },
  {
    title: "FN-SOLO-KILL-003",
    description: "سولو فورتنایت با جایزه به ازای هر Kill. هرچه بیشتر بزنی، بیشتر می‌بری.",
    teamMode: "solo", map: "br_island", region: "eu", category: "فورتنایت — کیلی",
    capacity: 60, entryToman: 18_000, serviceToman: 3_500,
    placements: [[1, 1, 150_000]],
    // 60 x 18,000 = 1,080,000 income. Capping total scoring kills at 40 holds
    // the worst case to 40 x 18,000 + 150,000 = 870,000.
    perKillToman: 18_000, maxTotalKills: 40,
    startsAt: tehran(5, 22, 0),
    minimumViableBps: 4_000,
    settingsText: "حالت: Battle Royale سولو با ساخت‌وساز، ریسپاون غیرفعال، سرور اروپا.",
    matchSettings: { revive: "disabled", limitedAmmo: true, zoneSpeed: "fast", doubleGroundLoot: false, vehiclesEnabled: true },
  },
  {
    title: "FN-TRIO-004",
    description: "تریو فورتنایت، ۳۳ تیم ۳ نفره. حالت تیمی مخصوص فورتنایت.",
    teamMode: "trio", map: "br_island", region: "me", category: "فورتنایت — تریو",
    capacity: 99, entryToman: 16_000, serviceToman: 3_000,
    placements: [[1, 1, 300_000], [2, 2, 200_000], [3, 3, 130_000], [4, 9, 45_000]],
    startsAt: tehran(6, 21, 30),
    minimumViableBps: 5_000,
    settingsText: "حالت: Battle Royale تریو با ساخت‌وساز، زاویه دید سوم‌شخص، ریسپاون غیرفعال.",
    matchSettings: { revive: "disabled", limitedAmmo: true, zoneSpeed: "normal", doubleGroundLoot: false, vehiclesEnabled: true },
  },
];

function prizeText(plan: Plan) {
  const subject = plan.teamMode === "solo" ? "نفر" : "تیم";
  const parts = plan.placements.map(([from, to, amount]) =>
    from === to
      ? `${subject} ${from.toLocaleString("fa-IR")}: ${amount.toLocaleString("fa-IR")} تومان`
      : `${subject} ${from.toLocaleString("fa-IR")} تا ${to.toLocaleString("fa-IR")}: هر ${subject} ${amount.toLocaleString("fa-IR")} تومان`);
  const placement = parts.length ? parts.join("، ") + " (کیف‌پول داخلی) شارژ میشود." : "";
  if (!plan.perKillToman) return placement;
  return `به ازای هر Kill مبلغ ${plan.perKillToman.toLocaleString("fa-IR")} تومان به کیف پول شما واریز میشود.` + (placement ? ` همچنین ${placement}` : "");
}

function buildRoom(plan: Plan) {
  const rewardConfig = {
    perKillRial: plan.perKillToman ? toRial(plan.perKillToman) : "0",
    participationRial: "0",
    maxKillsPerEntry: 30,
    maxTotalKills: plan.maxTotalKills ?? 0,
    placementPayout: "per_team" as const,
    killLadder: null,
    placementRules: plan.placements.map(([from, to, amount]) => ({ from, to, amountRial: toRial(amount) })),
  };
  const liability = estimateCodRoomMaximumLiability(rewardConfig, plan.capacity, plan.teamMode);
  const startsAt = plan.startsAt;
  return {
    room: {
      game: "fortnite",
      title: plan.title,
      description: plan.description,
      region: plan.region,
      map: plan.map,
      teamMode: plan.teamMode,
      perspective: "tpp",
      status: "registration",
      isPublished: false,
      capacity: plan.capacity,
      entryFeeRial: toRial(plan.entryToman),
      serviceFeeRial: toRial(plan.serviceToman),
      prizeBudgetRial: liability.toString(),
      referralRateBps: 2_000,
      minRankPoints: 0,
      // Fortnite has no account-level gate comparable to COD's level 50 rule.
      minCodLevel: 0,
      requiresRecording: true,
      rules: RULES,
      rulesVersion: "fn-br-1",
      category: plan.category,
      bannerImageUrl: "/cod/banner-fortnite-br.jpg",
      rewardConfig,
      prizeScaling: { mode: "scaled", fullPayoutAtBps: 10_000, minimumViableBps: plan.minimumViableBps },
      matchSettings: plan.matchSettings,
      faq: faq(prizeText(plan), plan.settingsText),
      // Placeholder Epic Custom Matchmaking Key; the operator swaps in the real
      // one before credentialsRevealAt.
      roomCode: String(Math.floor(1_000_000 + Math.random() * 9_000_000)),
      roomPassword: null,
      startsAt: startsAt.toISOString(),
      checkInOpensAt: new Date(startsAt.getTime() - 45 * 60_000).toISOString(),
      checkInClosesAt: new Date(startsAt.getTime() + 5 * 60_000).toISOString(),
      credentialsRevealAt: new Date(startsAt.getTime() - 15 * 60_000).toISOString(),
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
    console.log(`    ${arenaCompositionLabel("fortnite", plan.teamMode, plan.capacity)} · ${plan.region.toUpperCase()} · ${plan.entryToman.toLocaleString()} toman`);
    console.log(`    income ${income.toLocaleString()} / max payout ${payout.toLocaleString()} -> margin ${margin}%`);
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
