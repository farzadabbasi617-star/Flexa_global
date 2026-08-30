import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, players, tournaments, matches, disputes, judgments } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
  try {
    const { error, status } = await requireAdminPermission(request, "overview");
    if (error) return NextResponse.json({ error }, { status });

    const [uCount] = await db.select({ v: count() }).from(users);
    const [pCount] = await db.select({ v: count() }).from(players);
    const [tCount] = await db.select({ v: count() }).from(tournaments);
    const [mCount] = await db.select({ v: count() }).from(matches);
    const [dCount] = await db.select({ v: count() }).from(disputes);
    const [jCount] = await db.select({ v: count() }).from(judgments);
    const [aiCount] = await db.select({ v: count() }).from(judgments).where(eq(judgments.isAiJudgment, true));
    const [completedCount] = await db.select({ v: count() }).from(matches).where(eq(matches.status, "completed"));

    return NextResponse.json({
      users: uCount.v,
      players: pCount.v,
      tournaments: tCount.v,
      matches: mCount.v,
      completedMatches: completedCount.v,
      disputes: dCount.v,
      totalJudgments: jCount.v,
      aiJudgments: aiCount.v,
    });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
