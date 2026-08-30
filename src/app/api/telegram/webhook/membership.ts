import { telegramApi, getTelegramChannelChatId } from "@/lib/telegram";
import logger from "@/lib/logger";
import { isActiveTelegramChannelMember, type TelegramChatMemberLike } from "@/lib/telegram-membership-policy";
import { CHANNEL_URL } from "./config";
import { getTelegramSetting } from "./settings";
import { sendMessage } from "./transport";
import { channelUrl } from "@/lib/telegram-channel";

export type ChannelMembershipCheck = {
  member: boolean;
  state: "member" | "not_member" | "unavailable";
  status?: string;
};

const membershipCache = new Map<string, { check: ChannelMembershipCheck; expiresAt: number }>();

export async function channelMembershipRequired() {
  const setting = await getTelegramSetting("telegram_require_channel_membership", "");
  const environmentRequires = process.env.TELEGRAM_REQUIRE_CHANNEL_MEMBERSHIP === "true";
  // Membership is a product requirement in production. This deliberately
  // overrides an old false value left in Render or the settings table.
  if (process.env.NODE_ENV === "production") return true;
  return environmentRequires || setting === "true";
}

export async function checkChannelMembership(telegramId: string, forceRefresh = false): Promise<ChannelMembershipCheck> {
  if (!(await channelMembershipRequired())) return { member: true, state: "member" };
  const cached = membershipCache.get(telegramId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.check;

  const channelId = getTelegramChannelChatId();
  const result = await telegramApi<TelegramChatMemberLike>("getChatMember", {
    chat_id: channelId,
    user_id: Number(telegramId),
  });

  if (!result.ok) {
    logger.warn({
      telegramId,
      channelId,
      errorCode: result.error_code,
      description: result.description,
    }, "Telegram channel membership verification unavailable");

    // Distinguish "we cannot ask" from "the answer was no".
    //
    // A 400 chat-not-found / 403 forbidden means the bot is not an admin of the
    // channel, or the channel id is wrong. That is an operator misconfiguration,
    // not a signal about this user, and it applies to *everyone*: failing closed
    // locks the entire bot out, including members, with a message that tells them
    // to retry something that cannot succeed until an admin intervenes.
    //
    // Losing a soft marketing gate for the duration of a misconfiguration is a
    // far smaller cost than every user being unable to reach their wallet, so
    // this case opens. Genuine per-user failures (network blip, rate limit) still
    // fail closed, because those are transient and retrying does work.
    const configurationBroken = result.error_code === 400 || result.error_code === 403;
    if (configurationBroken) {
      logger.error({
        channelId,
        description: result.description,
      }, "Channel membership gate bypassed: bot cannot read the channel. Add the bot as a channel admin.");
      return { member: true, state: "unavailable" };
    }

    return { member: false, state: "unavailable" };
  }

  const member = isActiveTelegramChannelMember(result.result);
  const check: ChannelMembershipCheck = {
    member,
    state: member ? "member" : "not_member",
    status: result.result?.status,
  };
  membershipCache.set(telegramId, {
    check,
    expiresAt: Date.now() + (member ? 60_000 : 5_000),
  });
  return check;
}

export async function isChannelMember(telegramId: string, forceRefresh = false) {
  return (await checkChannelMembership(telegramId, forceRefresh)).member;
}

export async function promptChannelMembership(chatId: number, verificationUnavailable = false) {
  await sendMessage(chatId, [
    verificationUnavailable
      ? "⚠️ <b>بررسی عضویت از سمت Telegram موقتاً در دسترس نیست</b>"
      : "📣 <b>عضویت در کانال Flexa Games الزامی است</b>",
    "",
    verificationUnavailable
      ? "عضویتت رد نشده است. چند لحظه بعد دوباره «عضو شدم» را بزن؛ اگر خطا ادامه داشت، مشکل از دسترسی ربات به کانال است."
      : "ابتدا عضو کانال رسمی شو؛ سپس به Flexa برگرد و روی «عضو شدم» بزن تا عضویتت بررسی شود.",
  ].join("\n"), {
    inline_keyboard: [
      [{ text: "📣 عضویت در کانال", url: CHANNEL_URL || channelUrl() }],
      [{ text: "✅ عضو شدم؛ بررسی کن", callback_data: "membership:check" }],
    ],
  });
}
