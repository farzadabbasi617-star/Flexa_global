import { APP_URL, CHANNEL_URL, GAME_OPTIONS, PLATFORM_OPTIONS } from "./config";
import {
  buildAccountMenu,
  buildEarnMenu,
  buildGameMenu,
  buildHelpMenu,
  buildHomeMenu,
  type GameHub,
} from "./menu-model";

export function replyKeyboard(rows: string[][]) {
  return {
    keyboard: rows,
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

export function removeKeyboard() {
  return { remove_keyboard: true };
}

/**
 * Home screen.
 *
 * Kept intentionally short: three games, then a handful of section entries.
 * Everything that used to be crammed in here now lives one tap deeper — see
 * `menu-model.ts` for the full information architecture and its tests.
 */
export function mainMenuKeyboard() {
  return { inline_keyboard: buildHomeMenu(APP_URL, CHANNEL_URL) };
}

/** Hub for a single game: its rooms, its tournaments, its own features. */
export function gameHubKeyboard(hub: GameHub) {
  return { inline_keyboard: buildGameMenu(hub, APP_URL) };
}

/** Everything tied to the signed-in user. */
export function accountMenuKeyboard() {
  return { inline_keyboard: buildAccountMenu(APP_URL) };
}

/** Missions, quiz, referral, media partnership. */
export function earnMenuKeyboard() {
  return { inline_keyboard: buildEarnMenu() };
}

/** Rules, support, channel. */
export function helpMenuKeyboard() {
  return { inline_keyboard: buildHelpMenu(CHANNEL_URL) };
}

export function gameKeyboard() {
  return {
    inline_keyboard: [
      ...GAME_OPTIONS.map((game) => [{ text: game.label, callback_data: `reg:game:${game.id}` }]),
      [{ text: "لغو", callback_data: "reg:abort" }],
    ],
  };
}

export function platformKeyboard() {
  const rows = [];
  for (let i = 0; i < PLATFORM_OPTIONS.length; i += 2) {
    rows.push(PLATFORM_OPTIONS.slice(i, i + 2).map((platform, offset) => ({
      text: platform,
      callback_data: `reg:platform:${i + offset}`,
    })));
  }
  rows.push([{ text: "لغو", callback_data: "reg:abort" }]);
  return { inline_keyboard: rows };
}

export function confirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✅ تأیید و ثبت نهایی", callback_data: "reg:confirm" }],
      [{ text: "🔁 شروع دوباره", callback_data: "reg:restart" }, { text: "لغو", callback_data: "reg:abort" }],
    ],
  };
}

export function roomsKeyboard(rows: Array<{ id: string; name: string | null; entryFee?: string | null; registeredCount?: number; maxPlayers?: number }>) {
  const keyboard: Array<Array<Record<string, string>>> = [[{ text: "🌐 مشاهده همه روم‌ها در وب‌اپ", url: `${APP_URL}/tournaments` }]];
  for (const row of rows.slice(0, 5)) {
    const title = (row.name || "روم Flexa").slice(0, 28);
    const isFull = typeof row.registeredCount === "number" && typeof row.maxPlayers === "number" && row.registeredCount >= row.maxPlayers;
    keyboard.push([{ text: isFull ? `ظرفیت تکمیل: ${title}` : `✅ ثبت‌نام: ${title}`, callback_data: `join:${row.id}` }]);
    keyboard.push([{ text: `جزئیات: ${title}`, url: `${APP_URL}/tournaments/${row.id}` }]);
  }
  keyboard.push([{ text: "🎮 پیش‌ثبت‌نام", callback_data: "menu:register" }]);
  return { inline_keyboard: keyboard };
}
