/**
 * Menu information architecture.
 *
 * The old main menu exposed 23 buttons at once — every feature, flat, with no
 * grouping. Users could not tell which actions belonged to which game, and the
 * per-user items (my tournaments, my matches, missions, quiz, profile, …) were
 * mixed in with global navigation.
 *
 * The model below is pure data + pure functions so it can be unit tested
 * without a Telegram client or a database.
 *
 * Structure:
 *
 *   Home
 *   ├── 👑 Clash Royale ─┐
 *   ├── 🎯 COD Mobile    ├── each: rooms / tournaments (entry fee + prize),
 *   ├── 🏗️ Fortnite     ┘          plus that game's own features
 *   ├── 👤 My account ....... profile, wallet, my tournaments, my matches,
 *   │                        check-in, link account, status
 *   ├── 🎁 Earn ............. missions, daily quiz, referral, media partnership
 *   └── ℹ️ Help ............. rules, support, channel
 */

export type GameId = "clash_royale" | "cod_mobile" | "fortnite";

export interface MenuButton {
  text: string;
  /** Exactly one of these is set. */
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
}

export interface GameHub {
  id: GameId;
  /** Short label used on the home screen. */
  label: string;
  /** Full title shown at the top of the hub screen. */
  title: string;
  emoji: string;
}

export const GAME_HUBS: GameHub[] = [
  { id: "clash_royale", label: "👑 کلش رویال", title: "کلش رویال", emoji: "👑" },
  { id: "cod_mobile", label: "🎯 کالاف دیوتی موبایل", title: "کالاف دیوتی موبایل", emoji: "🎯" },
  { id: "fortnite", label: "🏗️ فورتنایت", title: "فورتنایت", emoji: "🏗️" },
];

export function findGameHub(id: string): GameHub | undefined {
  return GAME_HUBS.find((hub) => hub.id === id);
}

/**
 * Home screen: at most one row per concern.
 *
 * Deliberately excluded (moved into a section):
 *   my_tournaments, matches, clash1v1:status, clash_private, missions, quiz,
 *   affiliate, status, profile web, register (web), link
 */
export function buildHomeMenu(appUrl: string, channelUrl: string): MenuButton[][] {
  const rows: MenuButton[][] = [
    // Games first — this is what the bot is for.
    ...GAME_HUBS.map((hub) => [{ text: hub.label, callback_data: `game:${hub.id}` }]),

    // Global shortcuts.
    [
      { text: "🏟 همه روم‌های فعال", callback_data: "menu:rooms" },
      { text: "🎮 پیش‌ثبت‌نام", callback_data: "menu:register" },
    ],

    // Personal + earning + help, one entry each.
    [
      { text: "👤 حساب من", callback_data: "menu:account" },
      { text: "🎁 کسب درآمد", callback_data: "menu:earn" },
    ],
    [{ text: "ℹ️ راهنما و پشتیبانی", callback_data: "menu:help" }],

    // App access stays at the bottom, always reachable.
    [
      { text: "⚡ اپلیکیشن Flexa", web_app: { url: appUrl } },
      { text: "🌐 وب‌اپ", url: appUrl },
    ],
  ];

  if (channelUrl) {
    rows.push([{ text: "📣 کانال Flexa Games", url: channelUrl }]);
  }
  return rows;
}

/** Per-game hub. Only Clash Royale currently has 1v1 / private-tournament flows. */
export function buildGameMenu(hub: GameHub, appUrl: string): MenuButton[][] {
  const rows: MenuButton[][] = [
    [{ text: `🏟 روم‌های ${hub.title}`, callback_data: `game:${hub.id}:rooms` }],
    [{ text: `🏆 تورنومنت‌های ${hub.title}`, callback_data: `game:${hub.id}:tournaments` }],
  ];

  if (hub.id === "clash_royale") {
    rows.push([{ text: "⚔️ 1v1 سریع — ورودی ۵۰K / جایزه ۸۰K", callback_data: "clash1v1:quick_register" }]);
    rows.push([
      { text: "📦 وضعیت 1v1 من", callback_data: "clash1v1:status" },
      { text: "🏅 کلش چندنفره", callback_data: "menu:clash_private" },
    ]);
  }

  if (hub.id === "cod_mobile") {
    rows.push([{ text: "🎯 COD Arena — کاستوم‌روم", url: `${appUrl}/cod-arena` }]);
  }

  rows.push([{ text: "🎮 پیش‌ثبت‌نام در این بازی", callback_data: `game:${hub.id}:register` }]);
  rows.push([{ text: "⬅️ بازگشت به منوی اصلی", callback_data: "menu:home" }]);
  return rows;
}

/** "My account" — everything tied to the signed-in user. */
export function buildAccountMenu(appUrl: string): MenuButton[][] {
  return [
    [
      { text: "👤 پروفایل", callback_data: "menu:profile" },
      { text: "💳 کیف پول", callback_data: "menu:wallet" },
    ],
    [
      { text: "🏆 تورنومنت‌های من", callback_data: "menu:my_tournaments" },
      { text: "⚔️ مسابقات من", callback_data: "menu:matches" },
    ],
    [
      { text: "✅ چک‌این", callback_data: "menu:checkin" },
      { text: "📊 وضعیت من", callback_data: "menu:status" },
    ],
    [{ text: "🔗 اتصال حساب تلگرام", callback_data: "menu:link" }],
    [
      { text: "🌐 پروفایل وب", url: `${appUrl}/profile` },
      { text: "🆕 ساخت حساب", url: `${appUrl}/register` },
    ],
    [{ text: "⬅️ بازگشت به منوی اصلی", callback_data: "menu:home" }],
  ];
}

/** "Earn" — missions, quiz, referral, media partnership. */
export function buildEarnMenu(): MenuButton[][] {
  return [
    [
      { text: "🎯 مأموریت‌ها", callback_data: "menu:missions" },
      { text: "🧠 کوییز روزانه", callback_data: "menu:quiz" },
    ],
    [{ text: "🎁 درآمد از معرفی دوستان", callback_data: "mission:invite" }],
    [{ text: "📣 همکاری رسانه‌ای", callback_data: "menu:affiliate" }],
    [{ text: "⬅️ بازگشت به منوی اصلی", callback_data: "menu:home" }],
  ];
}

/** "Help" — rules, support, channel. */
export function buildHelpMenu(channelUrl: string): MenuButton[][] {
  const rows: MenuButton[][] = [
    [
      { text: "📜 قوانین", callback_data: "menu:rules" },
      { text: "🎧 پشتیبانی", callback_data: "menu:support" },
    ],
  ];
  if (channelUrl) {
    rows.push([{ text: "📣 کانال Flexa Games", url: channelUrl }]);
  }
  rows.push([{ text: "⬅️ بازگشت به منوی اصلی", callback_data: "menu:home" }]);
  return rows;
}

/** Parse `game:<id>` and `game:<id>:<action>` callbacks. */
export function parseGameCallback(
  data: string,
): { gameId: GameId; action: "hub" | "rooms" | "tournaments" | "register" } | null {
  if (!data.startsWith("game:")) return null;
  const parts = data.split(":");
  const hub = findGameHub(parts[1] ?? "");
  if (!hub) return null;

  const action = parts[2];
  if (!action) return { gameId: hub.id, action: "hub" };
  if (action === "rooms" || action === "tournaments" || action === "register") {
    return { gameId: hub.id, action };
  }
  return null;
}
