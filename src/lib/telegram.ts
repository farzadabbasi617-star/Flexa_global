import logger from "@/lib/logger";
import { getTelegramAdminIdsFromEnv } from "@/lib/telegram-admin-ids";
import { formatCodRoomChannelPost, type CodRoomChannelPost } from "./cod-channel-post";
import { db } from "@/db";
import { registrations, telegramAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { telegramApi } from "@/lib/telegram-api";
import { channelHandle, channelUrl } from "@/lib/telegram-channel";

export { telegramApi } from "@/lib/telegram-api";

export interface TelegramTournamentPost {
  id: string;
  name: string;
  game: string;
  gameMode?: string | null;
  maxPlayers?: number | null;
  prizePool?: string | null;
  entryFee?: string | null;
  startDate?: Date | string | null;
  bannerUrl?: string | null;
  description?: string | null;
  prize1st?: string | null;
  prize2nd?: string | null;
  prize3rd?: string | null;
}

const DEFAULT_APP_URL = "https://www.flexa1.ir";

function appUrl() {
  return (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/$/, "");
}

export function getTelegramChannelUrl() {
  return (process.env.TELEGRAM_CHANNEL_URL || process.env.CHANNEL_URL || channelUrl()).trim();
}

export function normalizeTelegramChannelChatId(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^-?\d+$/.test(raw)) return raw;
  const urlUsername = raw.match(/(?:https?:\/\/)?(?:www\.)?t\.me\/([A-Za-z0-9_]+)/i)?.[1];
  if (urlUsername) return `@${urlUsername}`;
  if (/^@?[A-Za-z0-9_]+$/.test(raw)) return raw.startsWith("@") ? raw : `@${raw}`;
  return null;
}

export function getTelegramChannelChatId() {
  const explicit = normalizeTelegramChannelChatId(process.env.TELEGRAM_CHANNEL_ID);
  if (explicit) return explicit;
  return normalizeTelegramChannelChatId(getTelegramChannelUrl()) || channelHandle();
}

function html(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gameLabel(game?: string | null) {
  const map: Record<string, string> = {
    cod_mobile: "🎯 کالاف موبایل | COD Mobile",
    fortnite: "🏗️ فورتنایت | Fortnite",
    clash_royale: "👑 کلش رویال | Clash Royale",
  };
  return map[String(game || "")] || game || "گیمینگ";
}

function formatDate(value?: Date | string | null) {
  if (!value) return "اعلام می‌شود";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "اعلام می‌شود";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(date);
}

export function formatTournamentChannelPost(tournament: TelegramTournamentPost) {
  const prize = tournament.prizePool || tournament.prize1st || "اعلام نشده";
  const description = tournament.description?.trim();

  return [
    "🏆 <b>تورنومنت جدید Flexa</b>",
    "",
    `🔥 <b>${html(tournament.name)}</b>`,
    `🎮 بازی: <b>${html(gameLabel(tournament.game))}</b>`,
    tournament.gameMode ? `🕹 مود: <b>${html(tournament.gameMode)}</b>` : "",
    `👥 ظرفیت: <b>${Number(tournament.maxPlayers || 16).toLocaleString("fa-IR")} نفر</b>`,
    `💳 ورودی: <b>${html(tournament.entryFee || "رایگان")}</b>`,
    `🎁 جایزه: <b>${html(prize)}</b>`,
    `⏰ شروع: <b>${html(formatDate(tournament.startDate))}</b>`,
    description ? "" : "",
    description ? html(description.slice(0, 500)) : "",
    "",
    "برای ثبت‌نام و مشاهده قوانین وارد Flexa شو 👇",
  ].filter(Boolean).join("\n");
}

export async function sendTelegramMessage(chatId: string | number, text: string, replyMarkup?: Record<string, unknown>) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

export async function publishTournamentToTelegramChannel(tournament: TelegramTournamentPost) {
  const channelId = getTelegramChannelChatId();
  const url = `${appUrl()}/tournaments/${tournament.id}`;
  const caption = formatTournamentChannelPost(tournament);
  
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "🎮 ثبت‌نام در تورنومنت", web_app: { url: url } },
        { text: "⚡ ورود به Flexa", web_app: { url: appUrl() } },
      ],
    ],
  };

  if (tournament.bannerUrl) {
    const photoResult = await telegramApi("sendPhoto", {
      chat_id: channelId,
      photo: tournament.bannerUrl,
      caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
    if (photoResult.ok) return photoResult;
  }

  return telegramApi("sendMessage", {
    chat_id: channelId,
    text: caption,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}


/**
 * Announces a Call of Duty room in the channel. Mirrors the tournament publisher:
 * try a photo post so the room's key art carries the message, fall back to text.
 */
export async function publishCodRoomToTelegramChannel(room: CodRoomChannelPost & { bannerUrl?: string | null }) {
  const channelId = getTelegramChannelChatId();
  const url = `${appUrl()}/cod-arena/${room.id}`;
  const caption = formatCodRoomChannelPost(room);
  const replyMarkup = {
    inline_keyboard: [[
      { text: "🎯 ثبت‌نام در روم", web_app: { url } },
      { text: "⚡ ورود به Flexa", web_app: { url: appUrl() } },
    ]],
  };

  if (room.bannerUrl) {
    const absoluteBanner = room.bannerUrl.startsWith("http")
      ? room.bannerUrl
      : `${appUrl()}${room.bannerUrl}`;
    const photoResult = await telegramApi("sendPhoto", {
      chat_id: channelId,
      photo: absoluteBanner,
      caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
    if (photoResult.ok) return photoResult;
  }

  return telegramApi("sendMessage", {
    chat_id: channelId,
    text: caption,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

export function getTelegramAdminIds() {
  return getTelegramAdminIdsFromEnv();
}

export async function notifyTelegramAdmins(text: string, replyMarkup?: Record<string, unknown>) {
  const adminIds = getTelegramAdminIds();
  const results = await Promise.allSettled(adminIds.map((id) => sendTelegramMessage(Number(id), text, replyMarkup)));
  return {
    ok: results.some((result) => result.status === "fulfilled" && Boolean((result.value as { ok?: boolean })?.ok)),
    total: adminIds.length,
    sent: results.filter((result) => result.status === "fulfilled" && Boolean((result.value as { ok?: boolean })?.ok)).length,
  };
}

export async function notifyLinkedUserOnTelegram(userId: string, text: string, replyMarkup?: Record<string, unknown>) {
  try {
    const [account] = await db
      .select({ telegramId: telegramAccounts.telegramId })
      .from(telegramAccounts)
      .where(eq(telegramAccounts.userId, userId))
      .limit(1);
    if (!account?.telegramId) return { ok: false, skipped: true, reason: "telegram_not_linked" };
    const numericChatId = Number(account.telegramId);
    if (!Number.isFinite(numericChatId)) return { ok: false, skipped: true, reason: "invalid_telegram_id" };
    const result = await sendTelegramMessage(numericChatId, text, replyMarkup);
    return { ...result, skipped: false };
  } catch (err) {
    logger.warn({ err, userId }, "Failed to notify linked Telegram user");
    return { ok: false, skipped: false, reason: "send_failed" };
  }
}

export async function publishHonorToTelegramChannel(honor: {
  id: string;
  title: string;
  description: string;
  type?: string | null;
  game?: string | null;
  imageUrl?: string | null;
  highlight?: boolean | null;
}) {
  const url = `${appUrl()}/honors/${honor.id}`;
  const label = honor.type === "news" ? "خبر جدید" : "افتخار جدید";
  const game = honor.game ? `\n🎮 بازی: <b>${html(honor.game)}</b>` : "";
  const text = [
    `🏛 <b>${label} در تالار افتخارات Flexa</b>`,
    "",
    `🔥 <b>${html(honor.title)}</b>`,
    game,
    "",
    html((honor.description || "").slice(0, 650)),
    "",
    "برای دیدن جزئیات، لایک و سین خبر وارد Flexa شو 👇",
  ].filter(Boolean).join("\n");
  const replyMarkup = {
    inline_keyboard: [[
      { text: "مشاهده در تالار افتخارات", url },
      { text: "باز کردن Flexa", web_app: { url: appUrl() } },
    ]],
  };

  if (honor.imageUrl) {
    const photo = await telegramApi("sendPhoto", {
      chat_id: getTelegramChannelChatId(),
      photo: honor.imageUrl,
      caption: text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
    if (photo.ok) return photo;
  }
  return telegramApi("sendMessage", {
    chat_id: getTelegramChannelChatId(),
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}


export async function notifyTournamentParticipantsOnTelegram(tournamentId: string, text: string, replyMarkup?: Record<string, unknown>) {
  try {
    const rows = await db
      .select({ telegramId: telegramAccounts.telegramId })
      .from(registrations)
      .innerJoin(telegramAccounts, eq(registrations.visibleUserId, telegramAccounts.userId))
      .where(eq(registrations.tournamentId, tournamentId));

    let sent = 0;
    for (const row of rows) {
      const chatId = Number(row.telegramId);
      if (!Number.isFinite(chatId)) continue;
      const result = await sendTelegramMessage(chatId, text, replyMarkup);
      if (result.ok) sent += 1;
    }
    return { ok: true, sent, total: rows.length };
  } catch (err) {
    logger.warn({ err, tournamentId }, "Failed to notify tournament participants on Telegram");
    return { ok: false, sent: 0, total: 0 };
  }
}
