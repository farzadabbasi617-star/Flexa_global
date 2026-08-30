import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { fetchAIResponse } from "@/lib/ai-provider-manager";
import { flexaSystemPrompt } from "@/lib/ai-prompts";
import { safeParseAIJson } from "@/lib/ai-utils";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import { z } from "zod";

export const dynamic = "force-dynamic";

const DraftSchema = z.object({
  game: z.enum(["clash_royale", "cod_mobile", "fortnite"]),
  format: z.enum(["single_elimination", "double_elimination", "round_robin"]),
  name: z.string().max(255).optional().default(""),
  gameMode: z.string().max(120).optional().default(""),
  mapName: z.string().max(120).optional().default(""),
  maxPlayers: z.number().int().min(2).max(256).optional().default(16),
  serverSlots: z.number().int().min(2).max(256).optional().default(16),
  entryFee: z.string().max(100).optional().default("رایگان"),
  prizePool: z.string().max(120).optional().default(""),
});

type DraftResult = {
  description: string;
  rules: string;
  telegramPost: string;
};

const GAME_LABELS: Record<string, string> = {
  clash_royale: "کلش رویال",
  cod_mobile: "کالاف موبایل",
  fortnite: "فورتنایت",
};

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "حذفی تک‌حذفی",
  double_elimination: "حذفی دوشانسه",
  round_robin: "لیگ/امتیازی",
};

function localDraft(input: z.infer<typeof DraftSchema>): DraftResult {
  const game = GAME_LABELS[input.game];
  const format = FORMAT_LABELS[input.format];
  const name = input.name?.trim() || `تورنومنت ${game} Flexa`;
  const evidenceRule = "ارسال اسکرین‌شات واضح از نتیجه برای ثبت/اعتراض الزامی است.";

  const gameRules: Record<string, string[]> = {
    clash_royale: [
      "هر مسابقه به‌صورت Best of 3 برگزار می‌شود مگر اینکه مدیر تورنومنت خلاف آن را اعلام کند.",
      "تگ بازیکن کلش رویال باید قبل از شروع مسابقه در پروفایل ثبت شده باشد.",
      "تأخیر بیش از ۵ دقیقه بعد از اعلام لابی/حریف، باخت فنی محسوب می‌شود.",
    ],
    cod_mobile: [
      "استفاده از چیت، ابزار جانبی غیرمجاز، emulator غیرمجاز یا هر نوع exploit ممنوع است.",
      "تأخیر بیش از ۱۰ دقیقه برای حضور در روم، باخت فنی محسوب می‌شود.",
      "UID کالاف موبایل باید قبل از شروع تورنومنت در پروفایل ثبت شده باشد.",
    ],
    fortnite: [
      "Teaming، سوءاستفاده از باگ و هر نوع تقلب یا همکاری خارج از قوانین ممنوع است.",
      "امتیازدهی طبق Placement و Kill/Elimination اعلام‌شده توسط مدیر انجام می‌شود.",
      "Epic ID باید قبل از شروع مسابقه در پروفایل ثبت شده باشد.",
    ],
  };

  const rules = [
    `قالب برگزاری: ${format}`,
    `مود بازی: ${input.gameMode || "طبق اعلام مدیر"}`,
    `مپ/محل برگزاری: ${input.mapName || "طبق اعلام مدیر"}`,
    `ظرفیت: ${input.maxPlayers} بازیکن`,
    ...gameRules[input.game],
    evidenceRule,
    "نتیجه‌های مشکوک توسط داوری هوشمند Flexa و در صورت نیاز توسط داور انسانی بررسی می‌شوند.",
    "تصمیم نهایی داور/مدیریت تورنومنت لازم‌الاجراست.",
  ]
    .map((rule, index) => `${index + 1}. ${rule}`)
    .join("\n");

  const description = `${name} برای بازیکنان ${game} با قالب ${format} برگزار می‌شود. قبل از ثبت‌نام، آیدی بازی خود را در پروفایل تکمیل کن و قوانین را با دقت بخوان.`;

  const telegramPost = [
    `🔥 ${name}`,
    "",
    `🎮 بازی: ${game}`,
    `🏆 فرمت: ${format}`,
    `👥 ظرفیت: ${input.maxPlayers} نفر`,
    `💳 ورودی: ${input.entryFee || "رایگان"}`,
    input.prizePool ? `🎁 جایزه: ${input.prizePool}` : "🎁 جایزه: طبق اعلام مدیریت",
    "",
    "ثبت‌نام از طریق Flexa فعال است. قبل از شروع، آیدی بازی را در پروفایل ثبت کن.",
  ].join("\n");

  return { description, rules, telegramPost };
}

function normalizeDraft(parsed: Partial<DraftResult> | null, fallback: DraftResult): DraftResult {
  return {
    description: String(parsed?.description || fallback.description).trim().slice(0, 1500),
    rules: String(parsed?.rules || fallback.rules).trim().slice(0, 5000),
    telegramPost: String(parsed?.telegramPost || fallback.telegramPost).trim().slice(0, 1500),
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ["admin", "super_admin", "moderator"]);
    if (!auth.user) return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`ai-tournament-draft:${auth.user.id}:${ip}`, 12, 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: "درخواست‌های AI زیاد است. کمی بعد دوباره تلاش کن." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const validation = DraftSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "اطلاعات تورنومنت معتبر نیست", details: validation.error.issues }, { status: 400 });
    }

    const input = validation.data;
    const fallback = localDraft(input);

    const prompt = `برای تورنومنت زیر یک پیش‌نویس حرفه‌ای بساز:
نام: ${input.name || "نامشخص"}
بازی: ${GAME_LABELS[input.game]}
فرمت: ${FORMAT_LABELS[input.format]}
مود: ${input.gameMode || "نامشخص"}
مپ: ${input.mapName || "نامشخص"}
ظرفیت: ${input.maxPlayers}
ظرفیت سرور: ${input.serverSlots}
ورودی: ${input.entryFee || "رایگان"}
جایزه: ${input.prizePool || "نامشخص"}

فقط JSON معتبر بده با این فیلدها:
{
  "description": "توضیح کوتاه فارسی برای صفحه تورنومنت",
  "rules": "قوانین شماره‌گذاری‌شده و دقیق فارسی",
  "telegramPost": "متن تبلیغاتی کوتاه برای کانال تلگرام"
}`;

    const systemPrompt = flexaSystemPrompt("tournamentDraft", "فقط JSON معتبر بدون markdown برگردان.");
    const ai = await fetchAIResponse(prompt, systemPrompt);
    const parsed = ai ? safeParseAIJson<Partial<DraftResult>>(ai.content) : null;
    const draft = normalizeDraft(parsed, fallback);

    return NextResponse.json({
      ...draft,
      provider: ai?.provider || "local",
      cachedProvider: ai?.cachedProvider || null,
      model: ai?.model || null,
    });
  } catch (err) {
    logger.error({ err }, "AI tournament draft failed");
    return NextResponse.json({ error: "ساخت پیش‌نویس AI انجام نشد" }, { status: 500 });
  }
}
