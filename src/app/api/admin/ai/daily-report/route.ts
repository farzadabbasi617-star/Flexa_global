import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  disputes,
  matches,
  notifications,
  registrations,
  telegramPreRegistrations,
  tickets,
  tournaments,
  transactions,
  users,
} from "@/db/schema";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { fetchAIResponse } from "@/lib/ai-provider-manager";
import { flexaSystemPrompt } from "@/lib/ai-prompts";
import { safeParseAIJson } from "@/lib/ai-utils";
import { rateLimit } from "@/lib/rate-limit";
import { eq, gte, sql } from "drizzle-orm";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

type DailyReport = {
  headline: string;
  summary: string;
  highlights: string[];
  concerns: string[];
  recommendedActions: string[];
};

function n(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeReport(parsed: Partial<DailyReport> | null, fallback: DailyReport): DailyReport {
  return {
    headline: String(parsed?.headline || fallback.headline).trim().slice(0, 180),
    summary: String(parsed?.summary || fallback.summary).trim().slice(0, 1500),
    highlights: Array.isArray(parsed?.highlights)
      ? parsed!.highlights!.map((item) => String(item).slice(0, 180)).slice(0, 8)
      : fallback.highlights,
    concerns: Array.isArray(parsed?.concerns)
      ? parsed!.concerns!.map((item) => String(item).slice(0, 180)).slice(0, 8)
      : fallback.concerns,
    recommendedActions: Array.isArray(parsed?.recommendedActions)
      ? parsed!.recommendedActions!.map((item) => String(item).slice(0, 220)).slice(0, 8)
      : fallback.recommendedActions,
  };
}

function localReport(snapshot: Record<string, number>): DailyReport {
  const highlights: string[] = [];
  const concerns: string[] = [];
  const recommendedActions: string[] = [];

  if (snapshot.newUsers > 0) highlights.push(`${snapshot.newUsers} کاربر جدید در ۲۴ ساعت اخیر ثبت‌نام کرده‌اند.`);
  if (snapshot.newRegistrations > 0) highlights.push(`${snapshot.newRegistrations} ثبت‌نام تورنمنت جدید انجام شده است.`);
  if (snapshot.completedTransactions > 0) highlights.push(`${snapshot.completedTransactions} تراکنش تکمیل‌شده ثبت شده است.`);
  if (snapshot.telegramPreRegs > 0) highlights.push(`${snapshot.telegramPreRegs} پیش‌ثبت‌نام تلگرامی جدید ثبت شده است.`);

  if (snapshot.pendingDeposits > 0) concerns.push(`${snapshot.pendingDeposits} شارژ کیف پول در انتظار تأیید است.`);
  if (snapshot.openTickets > 0) concerns.push(`${snapshot.openTickets} تیکت باز نیازمند پاسخ/پیگیری است.`);
  if (snapshot.openDisputes > 0) concerns.push(`${snapshot.openDisputes} اعتراض باز وجود دارد.`);
  if (snapshot.upcomingTournaments === 0) concerns.push("تورنومنت نزدیک به شروع در بازه ۴۸ ساعت آینده دیده نشد.");

  if (snapshot.pendingDeposits > 0) recommendedActions.push("درخواست‌های شارژ pending را با سند پرداخت تطبیق بده و تعیین تکلیف کن.");
  if (snapshot.openTickets > 0) recommendedActions.push("تیکت‌های باز را براساس موضوع مالی/داوری اولویت‌بندی کن.");
  if (snapshot.openDisputes > 0) recommendedActions.push("اعتراض‌های باز را قبل از انتشار نتایج نهایی بررسی کن.");
  if (snapshot.upcomingTournaments > 0) recommendedActions.push("برای تورنمنت‌های نزدیک شروع، یادآوری تلگرام و اطلاعات لابی را بررسی کن.");

  if (highlights.length === 0) highlights.push("فعالیت قابل توجهی در ۲۴ ساعت اخیر ثبت نشده است.");
  if (concerns.length === 0) concerns.push("مورد نگران‌کننده فوری در شاخص‌های روزانه دیده نشد.");
  if (recommendedActions.length === 0) recommendedActions.push("مانیتورینگ روزانه ادامه پیدا کند و برای رشد، تورنمنت/کمپین جدید برنامه‌ریزی شود.");

  return {
    headline: "گزارش روزانه Flexa آماده است",
    summary: `در ۲۴ ساعت اخیر ${snapshot.newUsers} کاربر جدید، ${snapshot.newRegistrations} ثبت‌نام تورنمنت، ${snapshot.completedTransactions} تراکنش تکمیل‌شده و ${snapshot.openTickets} تیکت باز ثبت/مشاهده شده است.`,
    highlights,
    concerns,
    recommendedActions,
  };
}

async function countWhere(table: any, condition?: any) {
  const query = db.select({ value: sql<number>`count(*)` }).from(table);
  const [row] = condition ? await query.where(condition) : await query;
  return n(row?.value);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "ai");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`ai-daily-report:${auth.user.id}:${ip}`, 10, 60 * 1000);
    if (!limit.success) return NextResponse.json({ error: "درخواست‌های گزارش روزانه زیاد است. کمی بعد تلاش کن." }, { status: 429 });

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const next48h = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const snapshot = {
      totalUsers: await countWhere(users),
      newUsers: await countWhere(users, gte(users.createdAt, since24h)),
      activeTournaments: await countWhere(tournaments, eq(tournaments.status, "registration")),
      upcomingTournaments: await countWhere(tournaments, sql`${tournaments.startDate} is not null and ${tournaments.startDate} between now() and ${next48h}`),
      newRegistrations: await countWhere(registrations, gte(registrations.registeredAt, since24h)),
      recentMatches: await countWhere(matches, gte(matches.createdAt, since24h)),
      openDisputes: await countWhere(disputes, sql`${disputes.status} in ('open', 'pending')`),
      openTickets: await countWhere(tickets, sql`${tickets.status} in ('open', 'pending')`),
      newTickets: await countWhere(tickets, gte(tickets.createdAt, since24h)),
      pendingDeposits: await countWhere(transactions, sql`${transactions.type} = 'deposit' and ${transactions.status} = 'pending'`),
      completedTransactions: await countWhere(transactions, sql`${transactions.status} = 'completed' and ${transactions.createdAt} >= ${since24h}`),
      telegramPreRegs: await countWhere(telegramPreRegistrations, gte(telegramPreRegistrations.createdAt, since24h)),
    };

    const fallback = localReport(snapshot);
    const prompt = `گزارش روزانه مدیریتی Flexa را براساس این داده‌ها بساز:
${JSON.stringify(snapshot, null, 2)}

فقط JSON معتبر بده:
{
  "headline": "تیتر کوتاه فارسی",
  "summary": "خلاصه مدیریتی فارسی",
  "highlights": ["نکات مثبت"],
  "concerns": ["نگرانی‌ها یا موارد نیازمند توجه"],
  "recommendedActions": ["اقدام‌های پیشنهادی مشخص"]
}`;

    const systemPrompt = flexaSystemPrompt("dailyReport", "فقط JSON معتبر بدون markdown برگردان.");
    const ai = await fetchAIResponse(prompt, systemPrompt);
    const parsed = ai ? safeParseAIJson<Partial<DailyReport>>(ai.content) : null;
    const report = normalizeReport(parsed, fallback);

    return NextResponse.json({
      ...report,
      snapshot,
      provider: ai?.provider || "local",
      cachedProvider: ai?.cachedProvider || null,
      model: ai?.model || null,
    });
  } catch (err) {
    logger.error({ err }, "AI daily report failed");
    return NextResponse.json({ error: "گزارش روزانه AI ساخته نشد" }, { status: 500 });
  }
}
