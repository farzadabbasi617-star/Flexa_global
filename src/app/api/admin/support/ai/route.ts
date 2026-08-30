import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ticketMessages, tickets, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { fetchAIResponse } from "@/lib/ai-provider-manager";
import { flexaSystemPrompt } from "@/lib/ai-prompts";
import { safeParseAIJson } from "@/lib/ai-utils";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

type SupportAIInsight = {
  category: "wallet" | "tournament" | "judgment" | "account" | "prize" | "technical" | "other";
  priority: "low" | "normal" | "high" | "urgent";
  summary: string;
  suggestedReply: string;
  requiredInfo: string[];
};

const CATEGORY_LABELS: Record<SupportAIInsight["category"], string> = {
  wallet: "کیف پول/پرداخت",
  tournament: "تورنومنت/ثبت‌نام",
  judgment: "داوری/اعتراض",
  account: "حساب کاربری",
  prize: "جایزه",
  technical: "مشکل فنی",
  other: "سایر",
};

function localAnalyze(subject: string, transcript: string): SupportAIInsight {
  const text = `${subject}\n${transcript}`.toLowerCase();
  let category: SupportAIInsight["category"] = "other";
  let priority: SupportAIInsight["priority"] = "normal";

  if (/wallet|payment|pay|deposit|withdraw|کیف|پرداخت|شارژ|واریز|برداشت|تراکنش|پول/.test(text)) category = "wallet";
  else if (/tournament|register|room|تورنومنت|ثبت.?نام|روم|لابی|مسابقه/.test(text)) category = "tournament";
  else if (/judge|judgment|dispute|score|داور|داوری|اعتراض|نتیجه|اسکور/.test(text)) category = "judgment";
  else if (/account|login|password|otp|حساب|ورود|رمز|موبایل|تلگرام/.test(text)) category = "account";
  else if (/prize|reward|جایزه|پاداش|برد/.test(text)) category = "prize";
  else if (/bug|error|خطا|باگ|لود|باز نمی|مشکل/.test(text)) category = "technical";

  if (/فوری|urgent|پول کم شد|کسر شد|برداشت|هک|hack|بن|ban|پرداخت کردم/.test(text)) priority = "high";
  if (/کلاهبرداری|هک شده|حسابم هک|chargeback|اختلاس/.test(text)) priority = "urgent";
  if (/تشکر|پیشنهاد|سوال ساده/.test(text)) priority = "low";

  const summary = `این تیکت درباره «${CATEGORY_LABELS[category]}» است. موضوع: ${subject}. آخرین پیام‌ها نیاز به بررسی وضعیت کاربر و سوابق مرتبط دارند.`;
  const suggestedReply = `سلام، پیام شما دریافت شد. لطفاً برای بررسی دقیق‌تر ${category === "wallet" ? "شماره/زمان تراکنش و مبلغ" : category === "judgment" ? "لینک/نام تورنومنت، نام حریف و اسکرین‌شات نتیجه" : category === "tournament" ? "نام تورنومنت و زمان ثبت‌نام" : "جزئیات کامل مشکل و اسکرین‌شات در صورت وجود"} را ارسال کنید. تیم Flexa موضوع را بررسی می‌کند.`;
  const requiredInfo = category === "wallet"
    ? ["مبلغ", "زمان تراکنش", "شماره پیگیری یا اسکرین‌شات پرداخت"]
    : category === "judgment"
    ? ["نام تورنومنت", "نام حریف", "اسکرین‌شات نتیجه", "توضیح دقیق اعتراض"]
    : category === "tournament"
    ? ["نام تورنومنت", "زمان ثبت‌نام", "آیدی بازی"]
    : ["اسکرین‌شات", "زمان رخداد", "توضیح مرحله‌ای مشکل"];

  return { category, priority, summary, suggestedReply, requiredInfo };
}

function normalizeInsight(parsed: Partial<SupportAIInsight> | null, fallback: SupportAIInsight): SupportAIInsight {
  const categories = ["wallet", "tournament", "judgment", "account", "prize", "technical", "other"] as const;
  const priorities = ["low", "normal", "high", "urgent"] as const;
  return {
    category: categories.includes(parsed?.category as SupportAIInsight["category"]) ? parsed!.category! : fallback.category,
    priority: priorities.includes(parsed?.priority as SupportAIInsight["priority"]) ? parsed!.priority! : fallback.priority,
    summary: String(parsed?.summary || fallback.summary).trim().slice(0, 1500),
    suggestedReply: String(parsed?.suggestedReply || fallback.suggestedReply).trim().slice(0, 1500),
    requiredInfo: Array.isArray(parsed?.requiredInfo)
      ? parsed!.requiredInfo!.map((item) => String(item).slice(0, 120)).slice(0, 8)
      : fallback.requiredInfo,
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "support");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`support-ai:${auth.user.id}:${ip}`, 20, 60 * 1000);
    if (!limit.success) return NextResponse.json({ error: "درخواست‌های AI زیاد است. کمی بعد تلاش کن." }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    const ticketId = String(body.ticketId || "");
    if (!ticketId) return NextResponse.json({ error: "ticketId required" }, { status: 400 });

    const [ticket] = await db
      .select({
        id: tickets.id,
        subject: tickets.subject,
        status: tickets.status,
        userId: tickets.userId,
        displayName: users.displayName,
        username: users.username,
        phoneNumber: users.phoneNumber,
      })
      .from(tickets)
      .leftJoin(users, eq(tickets.userId, users.id))
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    const messages = await db
      .select({ senderName: users.displayName, senderRole: users.role, message: ticketMessages.message, createdAt: ticketMessages.createdAt })
      .from(ticketMessages)
      .leftJoin(users, eq(ticketMessages.senderId, users.id))
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(ticketMessages.createdAt);

    const transcript = messages
      .map((message) => `${message.senderRole || "user"} / ${message.senderName || "بدون نام"}: ${message.message}`)
      .join("\n")
      .slice(-6000);

    const fallback = localAnalyze(ticket.subject, transcript);
    const prompt = `این تیکت پشتیبانی Flexa را تحلیل کن.
اطلاعات کاربر: ${ticket.displayName || ticket.username || "نامشخص"} - ${ticket.phoneNumber || "بدون موبایل"}
موضوع: ${ticket.subject}
وضعیت: ${ticket.status}
پیام‌ها:
${transcript}

فقط JSON معتبر بده:
{
  "category": "wallet" | "tournament" | "judgment" | "account" | "prize" | "technical" | "other",
  "priority": "low" | "normal" | "high" | "urgent",
  "summary": "خلاصه کوتاه فارسی برای ادمین",
  "suggestedReply": "پاسخ پیشنهادی محترمانه و کاربردی به کاربر",
  "requiredInfo": ["اطلاعات لازم برای ادامه بررسی"]
}`;

    const systemPrompt = flexaSystemPrompt("support", "فقط JSON معتبر بدون markdown برگردان.");
    const ai = await fetchAIResponse(prompt, systemPrompt);
    const parsed = ai ? safeParseAIJson<Partial<SupportAIInsight>>(ai.content) : null;
    const insight = normalizeInsight(parsed, fallback);

    return NextResponse.json({
      ...insight,
      categoryLabel: CATEGORY_LABELS[insight.category],
      provider: ai?.provider || "local",
      cachedProvider: ai?.cachedProvider || null,
      model: ai?.model || null,
    });
  } catch (err) {
    logger.error({ err }, "Support AI failed");
    return NextResponse.json({ error: "تحلیل AI تیکت انجام نشد" }, { status: 500 });
  }
}
