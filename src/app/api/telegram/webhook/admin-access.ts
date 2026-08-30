import { getTelegramAdminIdsFromEnv } from "@/lib/telegram-admin-ids";

export function getAdminIds() {
  return getTelegramAdminIdsFromEnv();
}

export function hasAdminAccess(telegramId: string) {
  return getAdminIds().includes(telegramId);
}
