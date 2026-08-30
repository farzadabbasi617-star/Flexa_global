import { db } from "@/db";
import { codRooms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { projectCodPrizeTable } from "@/lib/cod-room-policy";

async function main() {
  const [room] = await db.select().from(codRooms).where(eq(codRooms.title, "BR-ISO-001")).limit(1);
  if (!room) throw new Error("room not found");
  const fa = (rial: string) => Number(BigInt(rial) / BigInt(10)).toLocaleString("en-US");
  const entryToman = Number(BigInt(room.entryFeeRial) / BigInt(10));

  console.log("scenario | collected | prize total | margin | 1st team | per player | viable");
  console.log("---------|-----------|-------------|--------|----------|------------|-------");
  for (const players of [10, 25, 40, 50, 75, 100]) {
    const t = projectCodPrizeTable({
      rewardConfig: room.rewardConfig,
      scaling: room.prizeScaling,
      registeredCount: players,
      capacity: room.capacity,
      teamMode: room.teamMode as "squad",
    });
    const collected = entryToman * players;
    const paid = Number(BigInt(t.totalCurrentRial) / BigInt(10));
    const margin = Math.round(((collected - paid) / collected) * 100);
    const first = t.rows.find((r) => r.from === 1)!;
    console.log(
      String(players).padStart(3) + " ppl |" +
      String(collected.toLocaleString()).padStart(10) + " |" +
      String(paid.toLocaleString()).padStart(12) + " |" +
      String(margin + "%").padStart(7) + " |" +
      String(fa(first.currentAmountRial)).padStart(9) + " |" +
      String(fa(first.perPlayerRial)).padStart(11) + " |  " +
      (t.meetsMinimum ? "yes" : "NO")
    );
  }
  const full = projectCodPrizeTable({
    rewardConfig: room.rewardConfig, scaling: room.prizeScaling,
    registeredCount: 100, capacity: 100, teamMode: "squad",
  });
  console.log("\nminimum players to run:", full.minimumPlayers);
  console.log("prize budget locked   :", fa(room.prizeBudgetRial), "toman");
  console.log("payout when full      :", fa(full.totalCurrentRial), "toman");
  console.log("budget covers payout  :", BigInt(full.totalCurrentRial) <= BigInt(room.prizeBudgetRial) ? "YES" : "NO");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
