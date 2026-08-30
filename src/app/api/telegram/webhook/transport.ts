import { InputFile } from "grammy";
import logger from "@/lib/logger";
import { telegramApi } from "@/lib/telegram";

export async function sendMessage(chatId: number, text: string, replyMarkup?: Record<string, unknown>) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

export async function sendPhoto(chatId: number, photo: string, caption?: string, replyMarkup?: Record<string, unknown>) {
  return telegramApi("sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

export async function sendPhotoBuffer(
  chatId: number,
  buffer: Buffer,
  filename: string,
  caption?: string,
  replyMarkup?: Record<string, unknown>
) {
  return telegramApi("sendPhoto", {
    chat_id: chatId,
    photo: new InputFile(buffer, filename),
    caption,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

export async function sendDocument(chatId: number, content: string, filename: string, caption?: string) {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) throw new Error("BOT_TOKEN is missing");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([content], { type: "text/csv;charset=utf-8" }), filename);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
  const result = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !result?.ok) logger.warn({ status: response.status, result }, "Telegram sendDocument failed");
  return result;
}

export async function editMessage(chatId: number, messageId: number, text: string, replyMarkup?: Record<string, unknown>) {
  return telegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

export async function answerCallback(callbackQueryId: string, text?: string, showAlert = false) {
  return telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}
