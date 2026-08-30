import crypto from "crypto";
import { generateRealAssistantResponse, streamRealAssistantResponse } from "@/lib/ai-service";
import logger from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { telegramApi } from "@/lib/telegram";
import { sendMessage } from "../transport";
import { getLinkedUserByTelegram } from "../user-service";
import { html, splitTelegramText } from "../utils";

export async function aiCommand(chatId: number, prompt: string, telegramId: string) {
  const query = prompt.trim();
  if (!query) {
    await sendMessage(chatId, "سؤال را بعد از دستور بنویس. مثال:\n<code>/ai بهترین دک کلش رویال برای شروع تورنومنت چیه؟</code>");
    return;
  }

  const quota = await rateLimit(`telegram-ai:${telegramId}`, 8, 5 * 60 * 1000);
  if (!quota.success) {
    await sendMessage(chatId, "⏳ تعداد درخواست‌های دستیار زیاد شده. چند دقیقه دیگر دوباره امتحان کن.");
    return;
  }

  const linked = await getLinkedUserByTelegram(telegramId);
  const context = { lang: "fa" as const, userName: linked?.displayName || undefined };
  await telegramApi("sendChatAction", { chat_id: chatId, action: "typing" });

  const streamed = await streamRealAssistantResponse(query, context);
  if (!streamed) {
    const fallback = await generateRealAssistantResponse(query, context);
    await sendMessage(chatId, `🤖 <b>دستیار Flexa</b>\n\n${html(fallback.response)}\n\n<code>${fallback.provider}</code>`);
    return;
  }

  const draftId = crypto.randomInt(1, 2_147_483_647);
  let answer = "";
  let lastDraftAt = 0;
  let streamFailed = false;

  try {
    for await (const delta of streamed.textStream) {
      answer += delta;
      const now = Date.now();
      if (chatId > 0 && (lastDraftAt === 0 || now - lastDraftAt >= 1_000)) {
        const preview = `🤖 دستیار Flexa\n\n${answer.slice(0, 3800)}`;
        await telegramApi("sendMessageDraft", {
          chat_id: chatId,
          draft_id: draftId,
          text: preview,
        });
        lastDraftAt = Date.now();
      }
    }
  } catch (err) {
    streamFailed = true;
    logger.warn({ err, telegramId }, "Telegram AI stream interrupted");
  }

  if (!answer.trim()) {
    const fallback = await generateRealAssistantResponse(query, context);
    answer = fallback.response;
  }

  const provider = streamed.provider === "cache"
    ? streamed.cachedProvider || "cache"
    : streamed.provider;
  const chunks = splitTelegramText(answer);

  for (let index = 0; index < chunks.length; index++) {
    const heading = index === 0 ? "🤖 <b>دستیار Flexa</b>\n\n" : "";
    const footer = index === chunks.length - 1
      ? `\n\n<code>${html(provider)}${streamFailed ? " • partial" : ""}</code>`
      : "";
    await sendMessage(chatId, `${heading}${html(chunks[index])}${footer}`);
  }
}
