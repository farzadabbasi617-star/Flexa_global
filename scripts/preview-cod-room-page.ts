/** Prints what the room page will render for a viewer, straight from the service. */
import { getCodRoomDetail } from "@/lib/cod-room-service";
import { db } from "@/db";
import { codRooms } from "@/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const [row] = await db.select({ id: codRooms.id }).from(codRooms).where(eq(codRooms.title, "BR-ISO-001")).limit(1);
  const detail: any = await getCodRoomDetail(row.id, null, true);
  const t = detail.prizeProjection;
  const fa = (r: string) => Number(BigInt(r) / BigInt(10)).toLocaleString("fa-IR");

  console.log("عنوان:", detail.title);
  console.log("بنر  :", detail.bannerImageUrl);
  console.log("دسته :", detail.category, "| حداقل لول کالاف:", detail.minCodLevel);
  console.log();
  console.log("=== آنچه بازیکن الان می‌بیند (۰ ثبت‌نام) ===");
  console.log("درصد جایزه فعلی:", t.scalePercent + "%", "| تکمیل:", t.fillPercent + "%");
  console.log("حداقل نفرات لازم:", t.minimumPlayers, "| به حد نصاب رسیده:", t.meetsMinimum ? "بله" : "خیر");
  console.log();
  console.log(t.showHeadlineAmounts
    ? "حالت نمایش: مبالغ کامل (روم هنوز به حد نصاب نرسیده)"
    : "حالت نمایش: مبالغ فعلی با قیمت کامل خط‌خورده");
  console.log();
  for (const r of t.rows) {
    const label = r.from === r.to ? `جایگاه ${r.from}` : `جایگاه ${r.from} تا ${r.to}`;
    const shown = t.showHeadlineAmounts ? r.fullAmountRial : r.currentAmountRial;
    const perPlayer = t.showHeadlineAmounts
      ? (BigInt(r.fullAmountRial) / BigInt(4)).toString()
      : r.perPlayerRial;
    console.log(`  ${label.padEnd(18)} ${fa(shown).padStart(9)} ت برای کل تیم | هر نفر ${fa(perPlayer)} ت`);
  }
  console.log();
  console.log(t.showHeadlineAmounts
    ? `مجموع جایزه با تکمیل ظرفیت: ${fa(t.totalFullRial)} تومان`
    : `مجموع جایزه در این لحظه: ${fa(t.totalCurrentRial)} از ${fa(t.totalFullRial)} تومان`);
  console.log();
  console.log("=== FAQ (" + detail.faq.length + " بخش) ===");
  for (const f of detail.faq) console.log("  •", f.question);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
