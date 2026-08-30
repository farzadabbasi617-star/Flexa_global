import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramBotSessions } from "@/db/schema";
import type { BotSession, BotState, SessionData } from "./types";
import { gameLabel, html } from "./utils";

export async function getSession(telegramId: string): Promise<BotSession> {
  const [row] = await db
    .select({ state: telegramBotSessions.state, data: telegramBotSessions.data })
    .from(telegramBotSessions)
    .where(eq(telegramBotSessions.telegramId, telegramId))
    .limit(1);

  if (!row) return { state: "idle", data: {} };
  return {
    state: (row.state || "idle") as BotState,
    data: (row.data || {}) as SessionData,
  };
}

export async function setSession(telegramId: string, state: BotState, data: SessionData) {
  await db
    .insert(telegramBotSessions)
    .values({ telegramId, state, data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: telegramBotSessions.telegramId,
      set: { state, data, updatedAt: new Date() },
    });
}

export async function clearSession(telegramId: string) {
  await db.delete(telegramBotSessions).where(eq(telegramBotSessions.telegramId, telegramId));
}

export function registrationSummary(data: SessionData) {
  return [
    "⚡ <b>خلاصه پیش‌ثبت‌نام Flexa</b>",
    "",
    `🎮 بازی: <b>${html(gameLabel(data.game))}</b>`,
    `🕹 پلتفرم: <b>${html(data.platform || "-")}</b>`,
    `👤 نام: <b>${html(data.fullName || "-")}</b>`,
    `🏷 آیدی بازی: <b>${html(data.gamerTag || "-")}</b>`,
    data.flexaId ? `🆔 Flexa ID: <code>${html(data.flexaId)}</code>` : "🆔 Flexa ID: <b>ثبت نشده</b>",
    `📞 شماره تماس: <b>${html(data.phoneNumber || "-")}</b>`,
    data.city ? `📍 شهر: <b>${html(data.city)}</b>` : "",
    data.teamName ? `👥 تیم/کلن: <b>${html(data.teamName)}</b>` : "",
  ].filter(Boolean).join("\n");
}
