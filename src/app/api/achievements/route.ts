import { NextRequest, NextResponse } from "next/server";
import { achievementProgressForUser, evaluateUserAchievements } from "@/lib/achievement-service";
import { validateSession } from "@/lib/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

async function getUserId(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token) return null;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  const user = await validateSession(token, ip, ua, request);
  return user?.id || null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (userId) {
      // Best effort: each visit refreshes unlocks based on current stats.
      await evaluateUserAchievements(userId).catch(() => undefined);
    }
    const result = await achievementProgressForUser(userId);
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to fetch achievements");
    return NextResponse.json({ error: "Failed to fetch achievements" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const result = await evaluateUserAchievements(userId);
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to evaluate achievements");
    return NextResponse.json({ error: "Failed to evaluate achievements" }, { status: 500 });
  }
}
