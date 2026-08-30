import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matchEvidence, matches, notifications, players, tournaments, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import { notifyLinkedUserOnTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function getClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
}

async function notifyAdmins(matchId: string, tournamentName: string | null) {
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "super_admin"]));

  if (!admins.length) return;

  await db.insert(notifications).values(
    admins.map((admin) => ({
      userId: admin.id,
      type: "match_result",
      title: "نتیجه جدید برای داوری",
      message: `یک نتیجه برای مسابقه ${tournamentName || "بدون عنوان"} ثبت شد و نیازمند بررسی است.`,
      link: `/judging?matchId=${matchId}`,
    }))
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const ip = getClientIp(request);
    const token = request.cookies.get("session")?.value;
    const user = await validateSession(token || "", ip, request.headers.get("user-agent") || "unknown", request);
    if (!user) return NextResponse.json({ error: "برای ثبت نتیجه باید وارد حساب شوی." }, { status: 401 });

    const limit = await rateLimit(`submit-result:${user.id}:${id}`, 8, 60 * 1000);
    if (!limit.success) return NextResponse.json({ error: "تعداد تلاش‌ها زیاد است. کمی صبر کن." }, { status: 429 });

    const body = await request.json();
    const p1Score = Number(body.player1Score);
    const p2Score = Number(body.player2Score);
    const evidenceUrl = body.evidenceUrl ? String(body.evidenceUrl).trim() : "";
    const description = body.description ? String(body.description).trim().slice(0, 1000) : "";

    if (!Number.isInteger(p1Score) || !Number.isInteger(p2Score) || p1Score < 0 || p2Score < 0) {
      return NextResponse.json({ error: "امتیازها معتبر نیستند." }, { status: 400 });
    }
    if (evidenceUrl && evidenceUrl.length > 500) {
      return NextResponse.json({ error: "لینک مدرک بیش از حد طولانی است. لینک مستقیم کوتاه‌تر وارد کن." }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      const [match] = await tx
        .select({
          id: matches.id,
          tournamentId: matches.tournamentId,
          player1Id: matches.player1Id,
          player2Id: matches.player2Id,
          status: matches.status,
          tournamentName: tournaments.name,
        })
        .from(matches)
        .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
        .where(eq(matches.id, id))
        .limit(1);

      if (!match) throw new Error("MATCH_NOT_FOUND");
      if (!match.player1Id || !match.player2Id) throw new Error("MATCH_NOT_READY");
      if (match.status === "completed" && user.role !== "admin" && user.role !== "super_admin") throw new Error("MATCH_COMPLETED");

      const participantPlayers = await tx
        .select({ id: players.id, ownerId: players.visibleUserId })
        .from(players)
        .where(inArray(players.id, [match.player1Id, match.player2Id]));

      const isAdmin = user.role === "admin" || user.role === "super_admin";
      const isParticipant = participantPlayers.some((p) => p.ownerId === user.id);
      if (!isAdmin && !isParticipant) throw new Error("NOT_PARTICIPANT");

      const winnerId = p1Score > p2Score ? match.player1Id : p2Score > p1Score ? match.player2Id : null;
      const nextStatus = isAdmin ? (winnerId ? "completed" : "awaiting_judgment") : "awaiting_judgment";

      const [updated] = await tx
        .update(matches)
        .set({
          player1Score: p1Score,
          player2Score: p2Score,
          winnerId,
          status: nextStatus,
          completedAt: nextStatus === "completed" ? new Date() : null,
        })
        .where(eq(matches.id, id))
        .returning();

      if (evidenceUrl) {
        await tx.insert(matchEvidence).values({
          matchId: id,
          uploadedById: user.id,
          fileUrl: evidenceUrl,
          fileType: "link",
          description: description || `نتیجه ثبت‌شده: ${p1Score}-${p2Score}`,
        });
      }

      return { updated, tournamentName: match.tournamentName, nextStatus, participantUserIds: participantPlayers.map((p) => p.ownerId).filter(Boolean) as string[] };
    });

    if (result.nextStatus === "awaiting_judgment") {
      await notifyAdmins(id, result.tournamentName).catch(() => undefined);
    }
    await Promise.all(
      result.participantUserIds.map((userId) => notifyLinkedUserOnTelegram(
        userId,
        `🎮 <b>نتیجه مسابقه ثبت شد</b>

🏆 ${result.tournamentName || "تورنومنت"}
نتیجه: <b>${p1Score} - ${p2Score}</b>
وضعیت: <b>${result.nextStatus === "completed" ? "تکمیل‌شده" : "در انتظار داوری"}</b>`,
        { inline_keyboard: [[{ text: "مشاهده مسابقه", url: `${process.env.APP_URL || "https://www.flexa1.ir"}/tournaments/${result.updated.tournamentId}/lobby` }]] }
      ).catch(() => undefined))
    );

    return NextResponse.json({ success: true, match: result.updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    const errors: Record<string, { text: string; status: number }> = {
      MATCH_NOT_FOUND: { text: "مسابقه پیدا نشد.", status: 404 },
      MATCH_NOT_READY: { text: "این مسابقه هنوز آماده ثبت نتیجه نیست.", status: 409 },
      MATCH_COMPLETED: { text: "این مسابقه قبلاً تکمیل شده است.", status: 409 },
      NOT_PARTICIPANT: { text: "فقط بازیکنان همین مسابقه می‌توانند نتیجه ثبت کنند.", status: 403 },
    };

    if (errors[message]) return NextResponse.json({ error: errors[message].text, code: message }, { status: errors[message].status });

    logger.error({ err, matchId: id }, "Submit match result failed");
    return NextResponse.json({ error: "ثبت نتیجه انجام نشد." }, { status: 500 });
  }
}
