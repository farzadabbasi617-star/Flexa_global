import { NextRequest, NextResponse } from "next/server";
import { getTelegramChannelChatId, telegramApi } from "@/lib/telegram";
import logger from "@/lib/logger";
import { canBotVerifyTelegramMembership, type TelegramChatMemberLike } from "@/lib/telegram-membership-policy";

export const dynamic = "force-dynamic";

const DEFAULT_APP_URL = "https://www.flexa1.ir";

function appUrl() {
  return (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/$/, "");
}

function requireSetupSecret(request: NextRequest) {
  const secret = process.env.TELEGRAM_SETUP_SECRET || process.env.TELEGRAM_CRON_SECRET || process.env.CRON_SECRET || process.env.ADMIN_SETUP_SECRET || "";
  if (!secret) return { ok: false, status: 503, error: "TELEGRAM_SETUP_SECRET is not configured" };
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.nextUrl.searchParams.get("secret") || "";
  if (provided !== secret) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, status: 200, error: null };
}

function groupCommands() {
  return [
    { command: "start", description: "معرفی Flexa و ورود به چت خصوصی" },
    { command: "rules", description: "قوانین Flexa و مسابقات 1V1" },
    { command: "rooms", description: "لینک تورنومنت‌های فعال" },
    { command: "clash", description: "شروع 1V1 کلش در چت خصوصی" },
    { command: "cod", description: "لینک COD Arena و روم‌های کالاف" },
    { command: "connect_media", description: "اتصال امن گروه به کد رسانه" },
  ];
}

function commands() {
  return [
    { command: "start", description: "شروع و منوی اصلی Flexa" },
    { command: "link", description: "اتصال حساب تلگرام به Flexa" },
    { command: "wallet", description: "کیف پول و ثبت فیش واریز" },
    { command: "deposit", description: "ثبت فیش کارت‌به‌کارت" },
    { command: "rooms", description: "روم‌ها و تورنومنت‌های فعال" },
    { command: "my_tournaments", description: "تورنومنت‌های من، لابی و چک‌این" },
    { command: "matches", description: "مسابقات، نتیجه، مدرک و اعتراض" },
    { command: "clash", description: "شروع 1V1 کلش رویال — ورودی ۵۰K" },
    { command: "clash_join", description: "ثبت‌نام و پرداخت 1V1 کلش" },
    { command: "qr", description: "ارسال پیوند/QR دوستی کلش" },
    { command: "cod", description: "COD Arena و کاستوم‌روم‌های کالاف" },
    { command: "clash_link", description: "ارسال پیوند دوستی کلش رویال" },
    { command: "clash_tournament", description: "مسابقات چندنفره کلش رویال" },
    { command: "checkin", description: "چک‌این سریع تورنومنت" },
    { command: "support", description: "ساخت تیکت پشتیبانی" },
    { command: "my_tickets", description: "تیکت‌های من" },
    { command: "missions", description: "مأموریت‌ها و پاداش XP" },
    { command: "invite", description: "لینک معرفی و درآمد از Match" },
    { command: "affiliate", description: "همکاری رسانه‌ای، لینک و کمیسیون" },
    { command: "daily", description: "جایزه روزانه" },
    { command: "quiz", description: "کوییز روزانه" },
    { command: "leaderboard", description: "لیدربورد Flexa" },
    { command: "achievements", description: "دستاوردها" },
    { command: "profile", description: "پروفایل متصل" },
    { command: "rules", description: "قوانین Flexa" },
    { command: "ai", description: "دستیار هوشمند Flexa" },
    { command: "admin", description: "داشبورد ادمین تلگرام" },
  ];
}

async function configureBot(setWebhook: boolean) {
  const url = appUrl();
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  const results: Record<string, unknown> = {};

  const botInfo = await telegramApi<{ id: number; username?: string }>("getMe", {});
  results.botInfo = botInfo;

  // getChatMember is only guaranteed to verify other users when this bot is a
  // channel administrator. Surface that prerequisite explicitly instead of
  // letting every real member get stuck behind the same join button.
  const channelId = getTelegramChannelChatId();
  const channel = await telegramApi<{ id: number; type: string; title?: string; username?: string }>("getChat", {
    chat_id: channelId,
  });
  const botMembership = botInfo.ok
    ? await telegramApi<TelegramChatMemberLike>("getChatMember", {
        chat_id: channelId,
        user_id: botInfo.result.id,
      })
    : null;
  results.membershipVerification = {
    ready: Boolean(channel.ok && botMembership?.ok && canBotVerifyTelegramMembership(botMembership.result)),
    channelId,
    channel: channel.ok
      ? { id: channel.result.id, type: channel.result.type, title: channel.result.title, username: channel.result.username }
      : { error: channel.description },
    botStatus: botMembership?.ok ? botMembership.result.status : null,
    error: botMembership && !botMembership.ok ? botMembership.description : null,
    requiredAction: botMembership?.ok && !canBotVerifyTelegramMembership(botMembership.result)
      ? "Promote @FlexaTournamentBot to administrator in the configured channel"
      : null,
  };

  results.commandsDefault = await telegramApi("setMyCommands", {
    commands: commands(),
    scope: { type: "default" },
    language_code: "fa",
  });

  results.commandsAllPrivate = await telegramApi("setMyCommands", {
    commands: commands(),
    scope: { type: "all_private_chats" },
    language_code: "fa",
  });

  results.commandsAllGroups = await telegramApi("setMyCommands", {
    commands: groupCommands(),
    scope: { type: "all_group_chats" },
    language_code: "fa",
  });

  results.menuButton = await telegramApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open Flexa",
      web_app: { url },
    },
  });

  results.description = await telegramApi("setMyDescription", {
    description: "Flexa Bot؛ کیف پول، تورنومنت، چک‌این، لابی، نتایج، پشتیبانی، مأموریت‌ها و اعلان‌های هوشمند گیمینگ.",
    language_code: "fa",
  });

  results.shortDescription = await telegramApi("setMyShortDescription", {
    short_description: "ربات رسمی Flexa برای تورنومنت، کیف پول و پشتیبانی",
    language_code: "fa",
  });

  if (setWebhook) {
    if (!webhookSecret) {
      results.webhook = { ok: false, description: "TELEGRAM_WEBHOOK_SECRET is missing" };
    } else {
      results.webhook = await telegramApi("setWebhook", {
        url: `${url}/api/telegram/webhook`,
        secret_token: webhookSecret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      });
    }
  }

  results.webhookInfo = await telegramApi("getWebhookInfo", {});
  return results;
}

export async function POST(request: NextRequest) {
  const auth = requireSetupSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json().catch(() => ({}));
    const results = await configureBot(Boolean(body.setWebhook));
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    logger.error({ err }, "Telegram setup failed");
    return NextResponse.json({ error: "Telegram setup failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = requireSetupSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const setWebhook = request.nextUrl.searchParams.get("setWebhook") === "true";
    const results = await configureBot(setWebhook);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    logger.error({ err }, "Telegram setup failed");
    return NextResponse.json({ error: "Telegram setup failed" }, { status: 500 });
  }
}
