import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { disputes, matches, players, transactions, users, wallets } from "@/db/schema";
import { desc, eq, gte, sql } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { fetchAIResponse } from "@/lib/ai-provider-manager";
import { flexaSystemPrompt } from "@/lib/ai-prompts";
import { safeParseAIJson } from "@/lib/ai-utils";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

type RiskItem = {
  type: "match" | "player" | "wallet" | "support" | "system";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  detail: string;
  action: string;
};

type RiskReport = {
  summary: string;
  riskScore: number;
  items: RiskItem[];
  nextActions: string[];
};

function clampRiskScore(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 35;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeReport(parsed: Partial<RiskReport> | null, fallback: RiskReport): RiskReport {
  const severities = ["low", "medium", "high", "critical"];
  const types = ["match", "player", "wallet", "support", "system"];
  return {
    summary: String(parsed?.summary || fallback.summary).slice(0, 1500),
    riskScore: clampRiskScore(parsed?.riskScore ?? fallback.riskScore),
    items: Array.isArray(parsed?.items)
      ? parsed!.items!.slice(0, 12).map((item, idx) => ({
          type: types.includes(item.type) ? item.type : fallback.items[idx]?.type || "system",
          severity: severities.includes(item.severity) ? item.severity : fallback.items[idx]?.severity || "medium",
          title: String(item.title || fallback.items[idx]?.title || "مورد نیازمند بررسی").slice(0, 160),
          detail: String(item.detail || fallback.items[idx]?.detail || "جزئیات کافی در دسترس نیست.").slice(0, 600),
          action: String(item.action || fallback.items[idx]?.action || "بررسی دستی توسط ادمین").slice(0, 260),
        }))
      : fallback.items,
    nextActions: Array.isArray(parsed?.nextActions)
      ? parsed!.nextActions!.map((item) => String(item).slice(0, 180)).slice(0, 8)
      : fallback.nextActions,
  };
}

function localReport(snapshot: Record<string, unknown>): RiskReport {
  const pendingDeposits = Number(snapshot.pendingDeposits || 0);
  const openDisputes = Number(snapshot.openDisputes || 0);
  const suspiciousMatches = Number(snapshot.suspiciousMatches || 0);
  const recentMatches = Number(snapshot.recentMatches || 0);
  const highRiskPlayers = Number(snapshot.highRiskPlayers || 0);

  const items: RiskItem[] = [];
  if (pendingDeposits > 0) {
    items.push({
      type: "wallet",
      severity: pendingDeposits > 10 ? "high" : "medium",
      title: `${pendingDeposits} تراکنش شارژ در انتظار بررسی`,
      detail: "تراکنش‌های pending باید قبل از افزایش موجودی بررسی شوند تا خطای مالی یا سوءاستفاده رخ ندهد.",
      action: "در پنل مالی، درخواست‌های pending را با سند پرداخت تطبیق بده و سپس تأیید/رد کن.",
    });
  }
  if (openDisputes > 0) {
    items.push({
      type: "match",
      severity: openDisputes > 5 ? "high" : "medium",
      title: `${openDisputes} اعتراض باز وجود دارد`,
      detail: "اعتراض‌های باز روی اعتماد بازیکنان و اعتبار نتایج اثر مستقیم دارند.",
      action: "اعتراض‌ها را براساس زمان ایجاد و وجود مدرک اولویت‌بندی کن.",
    });
  }
  if (suspiciousMatches > 0) {
    items.push({
      type: "match",
      severity: suspiciousMatches > 3 ? "high" : "medium",
      title: `${suspiciousMatches} مسابقه با اختلاف امتیاز غیرعادی`,
      detail: "اختلاف امتیاز بالا، مخصوصاً بدون مدرک، می‌تواند نشانه اشتباه ثبت نتیجه یا تبانی باشد.",
      action: "برای مسابقات با اختلاف زیاد، evidence و سابقه بازیکنان را بررسی کن.",
    });
  }
  if (highRiskPlayers > 0) {
    items.push({
      type: "player",
      severity: highRiskPlayers > 3 ? "high" : "medium",
      title: `${highRiskPlayers} بازیکن با الگوی آماری نیازمند بررسی`,
      detail: "بردهای زیاد با نرخ باخت بسیار پایین یا تغییر سریع رتبه می‌تواند نیازمند بررسی باشد.",
      action: "سابقه مسابقات، IP/حساب‌های مرتبط و اعتراض‌های ثبت‌شده را بررسی کن.",
    });
  }
  if (items.length === 0) {
    items.push({
      type: "system",
      severity: "low",
      title: "ریسک فوری قابل توجهی دیده نشد",
      detail: "براساس داده‌های اخیر، وضعیت کلی پایدار است.",
      action: "مانیتورینگ روزانه AI و بررسی تیکت‌ها/اعتراض‌ها ادامه پیدا کند.",
    });
  }

  const riskScore = Math.min(100, pendingDeposits * 4 + openDisputes * 7 + suspiciousMatches * 10 + highRiskPlayers * 8);
  return {
    summary: `در ${recentMatches} مسابقه اخیر، ${suspiciousMatches} مورد اختلاف امتیاز غیرعادی و ${openDisputes} اعتراض باز دیده شد. ${pendingDeposits} شارژ pending و ${highRiskPlayers} بازیکن نیازمند بررسی آماری وجود دارد.`,
    riskScore,
    items,
    nextActions: [
      "تراکنش‌های pending را قبل از هر مسابقه پولی بررسی کن.",
      "اعتراض‌های قدیمی‌تر را اولویت بده.",
      "برای مسابقات با اختلاف بالا، اسکرین‌شات نتیجه و سابقه دو بازیکن را چک کن.",
    ],
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "ai");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`ai-risk-report:${auth.user.id}:${ip}`, 10, 60 * 1000);
    if (!limit.success) return NextResponse.json({ error: "درخواست‌های گزارش AI زیاد است. کمی بعد تلاش کن." }, { status: 429 });

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentMatchRows = await db
      .select({
        id: matches.id,
        status: matches.status,
        player1Score: matches.player1Score,
        player2Score: matches.player2Score,
        evidence: matches.evidence,
        createdAt: matches.createdAt,
      })
      .from(matches)
      .where(gte(matches.createdAt, since))
      .orderBy(desc(matches.createdAt))
      .limit(120);

    const suspiciousMatches = recentMatchRows.filter((match) => {
      const p1 = match.player1Score ?? 0;
      const p2 = match.player2Score ?? 0;
      return Math.abs(p1 - p2) >= 12 && !match.evidence;
    });

    const [{ value: openDisputes }] = await db
      .select({ value: sql<number>`count(*)` })
      .from(disputes)
      .where(sql`${disputes.status} in ('open', 'pending')`);

    const [{ value: pendingDeposits }] = await db
      .select({ value: sql<number>`count(*)` })
      .from(transactions)
      .where(sql`${transactions.type} = 'deposit' and ${transactions.status} = 'pending'`);

    const playerRows = await db
      .select({ id: players.id, displayName: players.displayName, rating: players.rating, wins: players.wins, losses: players.losses })
      .from(players)
      .orderBy(desc(players.rating))
      .limit(80);

    const highRiskPlayers = playerRows.filter((player) => {
      const total = player.wins + player.losses;
      const winRate = total > 0 ? player.wins / total : 0;
      return total >= 8 && (winRate >= 0.9 || player.rating >= 1700);
    });

    const walletRows = await db
      .select({ balance: wallets.balance, userId: wallets.userId, displayName: users.displayName })
      .from(wallets)
      .leftJoin(users, eq(wallets.userId, users.id))
      .orderBy(desc(wallets.balance))
      .limit(10);

    const snapshot = {
      period: "7 days",
      recentMatches: recentMatchRows.length,
      suspiciousMatches: suspiciousMatches.length,
      suspiciousMatchSamples: suspiciousMatches.slice(0, 8).map((match) => ({
        id: match.id,
        status: match.status,
        score: `${match.player1Score ?? 0}-${match.player2Score ?? 0}`,
      })),
      openDisputes: Number(openDisputes || 0),
      pendingDeposits: Number(pendingDeposits || 0),
      highRiskPlayers: highRiskPlayers.length,
      highRiskPlayerSamples: highRiskPlayers.slice(0, 8),
      topWallets: walletRows.map((wallet) => ({
        userId: wallet.userId,
        displayName: wallet.displayName,
        balanceRial: wallet.balance,
      })),
    };

    const fallback = localReport(snapshot);
    const prompt = `این اسنپ‌شات مدیریتی Flexa را از نظر ریسک تقلب، داوری، کیف پول و عملیات بررسی کن:
${JSON.stringify(snapshot, null, 2)}

فقط JSON معتبر بده:
{
  "summary": "خلاصه فارسی کوتاه",
  "riskScore": number,
  "items": [
    {"type":"match|player|wallet|support|system", "severity":"low|medium|high|critical", "title":"...", "detail":"...", "action":"..."}
  ],
  "nextActions": ["..."]
}`;

    const systemPrompt = flexaSystemPrompt("riskReport", "فقط JSON معتبر بدون markdown برگردان.");
    const ai = await fetchAIResponse(prompt, systemPrompt);
    const parsed = ai ? safeParseAIJson<Partial<RiskReport>>(ai.content) : null;
    const report = normalizeReport(parsed, fallback);

    return NextResponse.json({
      ...report,
      snapshot,
      provider: ai?.provider || "local",
      cachedProvider: ai?.cachedProvider || null,
      model: ai?.model || null,
    });
  } catch (err) {
    logger.error({ err }, "AI risk report failed");
    return NextResponse.json({ error: "گزارش ریسک AI ساخته نشد" }, { status: 500 });
  }
}
