/**
 * Creates the first real COD Arena room by calling the same service function the
 * admin API calls, so every validation runs (liability vs budget, scaling config,
 * banner URL, schedule ordering, publish gating).
 *
 * Created unpublished so the operator can review it before players see it.
 */
import { createCodRoom } from "@/lib/cod-room-service";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const toRial = (toman: number) => String(BigInt(toman) * BigInt(10));

// Tehran is UTC+3:30 year round.
function tehranTimeToUtcIso(daysFromNow: number, hour: number, minute = 0) {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromNow,
    hour - 3, minute - 30, 0, 0,
  )).toISOString();
}

const startsAt = tehranTimeToUtcIso(2, 21, 0);

const room = {
  title: "BR-ISO-001",
  description: "مپ بازی Isolated میباشد و شما در قالب ۲۵ تیم ۴ نفره وارد میدان نبرد میشوید.",
  region: "global",
  map: "isolated",
  teamMode: "squad",
  perspective: "tpp",
  status: "registration",
  isPublished: false,
  capacity: 100,

  entryFeeRial: toRial(23_000),
  serviceFeeRial: toRial(5_000),
  prizeBudgetRial: toRial(1_590_000),
  referralRateBps: 2_000,

  bannerImageUrl: "/cod/banner-isolated-br.jpg",
  category: "صد نفره",
  minCodLevel: 50,
  minRankPoints: 0,

  rewardConfig: {
    perKillRial: "0",
    participationRial: "0",
    maxKillsPerEntry: 40,
    maxTotalKills: 0,
    placementPayout: "per_team",
    killLadder: null,
    placementRules: [
      { from: 1, to: 1, amountRial: toRial(400_000) },
      { from: 2, to: 2, amountRial: toRial(320_000) },
      { from: 3, to: 3, amountRial: toRial(230_000) },
      { from: 4, to: 11, amountRial: toRial(80_000) },
    ],
  },

  // Prizes are advertised for a full lobby and scale with turnout. Below 50%
  // the room is not viable and should be cancelled with refunds.
  prizeScaling: { mode: "scaled", fullPayoutAtBps: 10_000, minimumViableBps: 5_000 },

  matchSettings: {
    revive: "enabled",
    limitedAmmo: false,
    zoneSpeed: "fast",
    doubleGroundLoot: true,
    vehiclesEnabled: true,
  },

  faq: [
    {
      question: "جایزه به چه کسانی واریز میشود؟",
      answer: "تیم اول ۴۰۰ هزار، تیم دوم ۳۲۰ هزار، تیم سوم ۲۳۰ هزار و تیم چهارم تا یازدهم هر تیم ۸۰ هزار تومان (کیف‌پول داخلی) شارژ میشود.\n\nتوجه: این مبالغ برای ظرفیت کامل (۱۰۰ نفر) اعلام شده‌اند. اگر روم پر نشود، جایزه به همان نسبت محاسبه میشود؛ مبلغ دقیق در هر لحظه روی صفحه روم نمایش داده میشود. اگر کمتر از ۵۰ نفر ثبت‌نام کنند روم لغو و ورودی‌ها به کیف پول برمیگردد.",
    },
    {
      question: "تنظیمات بازی به چه صورتی است ؟",
      answer: "ریوایو فعال، لیمیتد امو خاموش (تیر بی‌نهایت است)، سرعت زون: فست، گان‌های روی زمین دوبل.",
    },
    {
      question: "قوانین بازی چگونه است؟",
      answer: "استفاده از وسائل نقلیه به جز اسنوبرد در سه زون آخر (بعد از بسته شدن ریوایوها) ممنوع میباشد، استفاده از گانهای بالستیک (پوریفایر، وار ماشین، تمپست، انهیلاتور) ممنوع میباشد و استفاده از آیتم self_revive ممنوع است.\n\nهر گونه قانون شکنی با جریمه ۵۰ هزار تومانی همراه است. اکانت هایی که لول اکانت زیر ۵۰ میباشد اجازه شرکت در روم ها را ندارند.\n\nهرکس در اسلاتی که در داخل اپلیکیشن نشسته در بازی هم همانجا باید بشیند وگرنه در صورت کیک شدن ناراحت نشین.",
    },
    {
      question: "چطور تیمی شرکت کنیم؟",
      answer: "اگر تیم هستید، هر چهار نفر جداگانه در روم ثبت‌نام کنید و شماره اسلات‌هایتان را کنار هم رزرو کنید. داخل بازی نگویید «ما تیم هستیم»؛ معیار، جایگاهی است که اپلیکیشن نشان میدهد.",
    },
    {
      question: "اگه کسی جامو گرفته بود چیکار کنم؟",
      answer: "در صورتی که کسی در جایگاه شما بود باید برین تو جایگاه تماشاگر (اسپکت) بشینید و به ادمین روم داخل چت گیم تایپ کنید شماره جایگاهتون رو تا چک کنه.",
    },
    {
      question: "از کجا باید وارد بازی شیم؟",
      answer: "راس ساعت مشخص‌شده در اپلیکیشن گیمنت آنلاین باشید. بعد از Check-in، کد و پسورد روم برای شما نمایش داده میشود. فراموش نکنید که ارسال لینک و کد به دوستانتون تخلف محسوب میشه.",
    },
    {
      question: "چجوری جایزه رو دریافت کنیم؟",
      answer: "چند دقیقه پس از اتمام روم و بررسی مدارک، در صورت برنده بودن حساب کیف پولتون شارژ میشه. نگران نباشین.",
    },
  ],

  rules: "استفاده از وسائل نقلیه به جز اسنوبرد در سه زون آخر ممنوع است. گان‌های بالستیک (پوریفایر، وار ماشین، تمپست، انهیلاتور) و آیتم self_revive ممنوع هستند. جریمه هر تخلف ۵۰ هزار تومان است. حداقل لول اکانت کالاف: ۵۰. ارسال کد و لینک روم به افراد خارج از روم تخلف محسوب میشود و باعث حذف بدون بازگشت ورودی میشود.",
  rulesVersion: "cod-br-1",
  requiresRecording: true,

  startsAt,
  checkInOpensAt: new Date(new Date(startsAt).getTime() - 45 * 60_000).toISOString(),
  checkInClosesAt: new Date(new Date(startsAt).getTime() + 5 * 60_000).toISOString(),
  credentialsRevealAt: new Date(new Date(startsAt).getTime() - 15 * 60_000).toISOString(),
};


async function main() {
  const [admin] = await db.select({ id: users.id, username: users.username })
    .from(users).where(eq(users.gamentId, "FLX-3212")).limit(1);
  if (!admin) throw new Error("admin FLX-3212 not found");

  const created = await createCodRoom(room, admin.id);
  console.log("Room created :", created.id);
  console.log("Title        :", created.title);
  console.log("Published    :", created.isPublished, "(hidden until you publish)");
  console.log("Status       :", created.status);
  console.log("Capacity     :", created.capacity);
  console.log("Starts at    :", created.startsAt);
  console.log("Review at    : https://www.gament1.ir/cod-arena/" + created.id);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
