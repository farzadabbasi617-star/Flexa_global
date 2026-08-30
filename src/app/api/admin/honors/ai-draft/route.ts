import { NextRequest, NextResponse } from "next/server";
import { validateAdmin } from "@/lib/auth";
import { fetchAIResponse } from "@/lib/ai-provider-manager";
import { flexaSystemPrompt } from "@/lib/ai-prompts";
import { safeParseAIJson } from "@/lib/ai-utils";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

type HonorDraft = {
  title: string;
  description: string;
  telegramPost: string;
};

const TYPE_LABELS: Record<string, string> = {
  winner: "قهرمان",
  runner_up: "نایب‌قهرمان",
  levelup: "لول‌آپ",
  rankup: "ارتقای رتبه",
  record: "رکورد",
  fairplay: "بازیکن اخلاق",
  team: "افتخار تیمی",
  news: "خبر",
  event: "رویداد",
};

const GAME_LABELS: Record<string, string> = {
  clash_royale: "کلش رویال",
  cod_mobile: "کالاف موبایل",
  fortnite: "فورتنایت",
};

function text(value: unknown, max = 255) {
  return String(value ?? "").trim().slice(0, max);
}

function localDraft(body: Record<string, unknown>): HonorDraft {
  const type = text(body.type || "news", 30);
  const typeLabel = TYPE_LABELS[type] || "افتخار";
  const username = text(body.username, 100);
  const game = text(body.game, 50);
  const gameLabel = GAME_LABELS[game] || game || "Flexa";
  const prize = text(body.prize, 120);
  const level = text(body.level, 20);

  const title = body.title
    ? text(body.title, 255)
    : username
    ? `${username}؛ ${typeLabel} جدید ${gameLabel}`
    : `${typeLabel} جدید در Flexa`;

  const details = [
    username ? `بازیکن @${username}` : null,
    game ? `در بخش ${gameLabel}` : null,
    level ? `با رسیدن به سطح ${level}` : null,
    prize ? `و جایزه ${prize}` : null,
  ].filter(Boolean).join(" ");

  const description = body.description
    ? text(body.description, 2000)
    : `${details || "یک رویداد جدید"} در تالار افتخارات Flexa ثبت شد. این افتخار پس از بررسی مدیریت منتشر می‌شود.`;

  const telegramPost = [
    `🏆 ${title}`,
    "",
    description,
    username ? `\n👤 بازیکن: @${username}` : "",
    game ? `🎮 بازی: ${gameLabel}` : "",
    prize ? `🎁 جایزه: ${prize}` : "",
    "",
    "تالار افتخارات Flexa را دنبال کن.",
  ].filter(Boolean).join("\n");

  return { title, description, telegramPost };
}

function normalizeDraft(parsed: Partial<HonorDraft> | null, fallback: HonorDraft): HonorDraft {
  return {
    title: text(parsed?.title || fallback.title, 255),
    description: text(parsed?.description || fallback.description, 2500),
    telegramPost: text(parsed?.telegramPost || fallback.telegramPost, 1500),
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateAdmin(request);
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`honors-ai-draft:${auth.user.id}:${ip}`, 20, 60 * 1000);
    if (!limit.success) return NextResponse.json({ error: "درخواست‌های AI زیاد است. کمی بعد تلاش کن." }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    if (text(body.type || "news", 30) === "news") {
      return NextResponse.json({
        error: "برای جلوگیری از خبرسازی، AI Draft برای خبر دستی غیرفعال است؛ از خبر خودکار منبع‌محور یا ترجمه وفادار استفاده کنید",
      }, { status: 400 });
    }
    const fallback = localDraft(body);

    const prompt = `برای تالار افتخارات Flexa یک متن جذاب بساز.
نوع: ${TYPE_LABELS[text(body.type, 30)] || text(body.type, 30) || "خبر"}
بازی: ${GAME_LABELS[text(body.game, 50)] || text(body.game, 50) || "نامشخص"}
بازیکن: ${text(body.username, 100) || "نامشخص"}
جایزه: ${text(body.prize, 120) || "ندارد/نامشخص"}
سطح: ${text(body.level, 20) || "نامشخص"}
عنوان فعلی: ${text(body.title, 255) || "ندارد"}
توضیح فعلی: ${text(body.description, 2000) || "ندارد"}

فقط JSON معتبر بده:
{
  "title": "عنوان کوتاه و هیجانی فارسی",
  "description": "توضیح حرفه‌ای فارسی برای کارت افتخار",
  "telegramPost": "متن کوتاه مناسب انتشار در کانال تلگرام"
}`;

    const systemPrompt = flexaSystemPrompt("honors", "فقط JSON معتبر بدون markdown بده.");
    const ai = await fetchAIResponse(prompt, systemPrompt);
    const parsed = ai ? safeParseAIJson<Partial<HonorDraft>>(ai.content) : null;
    const draft = normalizeDraft(parsed, fallback);

    return NextResponse.json({ ...draft, provider: ai?.provider || "local", cachedProvider: ai?.cachedProvider || null, model: ai?.model || null });
  } catch (err) {
    logger.error({ err }, "Honor AI draft failed");
    return NextResponse.json({ error: "ساخت متن AI انجام نشد" }, { status: 500 });
  }
}
