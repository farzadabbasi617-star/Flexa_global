export const CLASH_1V1_CONFIG = {
  name: "1V1 کلش رویال",
  categoryLabel: "clash_1v1_queue",
  game: "clash_royale" as const,
  format: "single_elimination" as const,
  status: "registration" as const,
  // This is a system matchmaking queue, not a manually hosted tournament room.
  maxPlayers: 1000,
  entryFee: "50,000 USDT",
  entryFeeToman: 50_000,
  prizePool: "80,000 USDT",
  prize1st: "80,000 USDT",
  prizeToman: 80_000,
  gameMode: "1V1 Friendly Battle",
  mapName: "Clash Royale — بدون Room ID یا Password",
  description:
    "مسابقه پولی 1V1 کلش رویال با حریف تصادفی. هر بازیکن ۵۰٬۰۰۰ USDT ورودی پرداخت می‌کند؛ پس از ثبت پیوند/QR دوستی رسمی کلش رویال، بات دو بازیکن آماده را خودکار به هم متصل می‌کند. جایزه برنده ۸۰٬۰۰۰ USDT است.",
  rules:
    "• این بخش روم یا براکت چندنفره نیست؛ هر ورود به صف فقط یک مسابقه مستقل 1V1 است.\n• ورودی هر نفر ۵۰٬۰۰۰ USDT و جایزه برنده ۸۰٬۰۰۰ USDT است.\n• فقط Player Tag تأییدشده خودتان مجاز است.\n• بعد از پرداخت، QR یا «اشتراک‌گذاری پیوند» رسمی Clash Royale را برای بات بفرستید.\n• بات فقط دو بازیکن آماده را به‌صورت خودکار انتخاب و پیوند/QR آن‌ها را برای یکدیگر ارسال می‌کند.\n• مسابقه در Friendly Battle معمولی 1V1 برگزار می‌شود.\n• هر دو بازیکن نتیجه را ثبت می‌کنند و Battle Log برای داوری استفاده می‌شود.",
  lobbyNotes:
    "این محصول روم دستی ندارد. Room ID و Password نباید وارد شود؛ بات تلگرام پس از پرداخت و دریافت QR/پیوند دوستی، حریف را خودکار پیدا می‌کند.",
} as const;

/** The 1V1 category is matchmaking-only, never a manually hosted room. */
export function normalizeClash1v1QueueSettings<T extends Record<string, unknown>>(input: T): T & Record<string, unknown> {
  if (String(input.categoryLabel || "") !== CLASH_1V1_CONFIG.categoryLabel) return input;
  return {
    ...input,
    name: CLASH_1V1_CONFIG.name,
    game: CLASH_1V1_CONFIG.game,
    format: CLASH_1V1_CONFIG.format,
    status: "registration",
    maxPlayers: CLASH_1V1_CONFIG.maxPlayers,
    serverSlots: 2,
    winnersCount: 1,
    entryFee: CLASH_1V1_CONFIG.entryFee,
    prizePool: CLASH_1V1_CONFIG.prizePool,
    prize1st: CLASH_1V1_CONFIG.prize1st,
    prize2nd: null,
    prize3rd: null,
    prize4to10: null,
    gameMode: CLASH_1V1_CONFIG.gameMode,
    mapName: CLASH_1V1_CONFIG.mapName,
    description: CLASH_1V1_CONFIG.description,
    rules: CLASH_1V1_CONFIG.rules,
    lobbyNotes: CLASH_1V1_CONFIG.lobbyNotes,
    roomId: null,
    roomPassword: null,
    roomVisibleAt: null,
  };
}

export function isClash1v1QueueTournament(tournament?: {
  game?: string | null;
  name?: string | null;
  categoryLabel?: string | null;
}) {
  if (!tournament) return false;
  return tournament.game === CLASH_1V1_CONFIG.game
    && tournament.categoryLabel === CLASH_1V1_CONFIG.categoryLabel;
}

export const isClash1v1TournamentLike = isClash1v1QueueTournament;
