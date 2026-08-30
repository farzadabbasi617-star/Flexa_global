import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { sendMessage } from "./transport";
import { html } from "./utils";

export async function getTelegramSetting(key: string, fallback = "") {
  try {
    const [row] = await db
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, key))
      .limit(1);
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function telegramFeatureEnabled(key: string, fallback = true) {
  const value = await getTelegramSetting(key, fallback ? "true" : "false");
  if (value === "false") return false;
  if (value === "true") return true;
  return fallback;
}

export async function ensureFeatureEnabled(chatId: number, key: string, label: string) {
  if (await telegramFeatureEnabled(key, true)) return true;
  await sendMessage(chatId, `این قابلیت فعلاً از سمت مدیریت غیرفعال است: <b>${html(label)}</b>`);
  return false;
}
