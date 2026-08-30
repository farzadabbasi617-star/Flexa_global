export const CLASH_PRIVATE_DRAFT_CATEGORY = "clash_private_draft";
export const CLASH_PRIVATE_DRAFT_CAPACITIES = [10, 50, 100, 200] as const;
export const CLASH_PRIVATE_DRAFT_DEFAULT_CAPACITY = 10;
export const CLASH_PRIVATE_DRAFT_MODE = "انتخاب کارت (Draft) — سطح تورنمنتی برابر";
export const CLASH_PRIVATE_DRAFT_VENUE = "مسابقه خصوصی داخل Clash Royale";

export const CLASH_PRIVATE_DRAFT_DESCRIPTION =
  "مسابقه خصوصی کلش رویال با مود انتخاب کارت؛ حریف و کارت‌ها داخل بازی تعیین می‌شوند و سطح کارت‌ها براساس استاندارد تورنمنت برای همه برابر است. رتبه نهایی از جدول امتیازات خود Clash Royale ثبت می‌شود.";

export const CLASH_PRIVATE_DRAFT_RULES = [
  "• مود مسابقه: انتخاب کارت (Draft).",
  "• سطح کارت‌ها و برج‌ها طبق Tournament Standard برای همه برابر است.",
  "• فقط بازیکنان ثبت‌نام‌شده و چک‌این‌شده مجاز به ورود هستند.",
  "• عدم چک‌این/حضور، No-show است؛ ورودی بازگردانده نمی‌شود و داخل استخر جایزه برندگان باقی می‌ماند.",
  "• جایگزینی بازیکن غایب از لیست انتظار انجام نمی‌شود.",
  "• ورود با نام/برچسب مسابقه خصوصی و رمز اعلام‌شده در زمان شروع انجام می‌شود.",
  "• Player Tag ثبت‌شده در Flexa باید با اکانت داخل مسابقه یکسان باشد.",
  "• رتبه نهایی براساس Leaderboard رسمی داخل Clash Royale تعیین می‌شود.",
  "• در پایان، ادمین تصویر کامل Leaderboard را ثبت و نتایج را نهایی می‌کند.",
  "• استفاده از حساب جایگزین، تبانی یا واگذاری اکانت باعث حذف از مسابقه می‌شود.",
].join("\n");

export function isClashPrivateDraftTournament(input: { game?: unknown; categoryLabel?: unknown }) {
  return input.game === "clash_royale" && input.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY;
}

export function normalizeClashPrivateDraftSettings<T extends Record<string, unknown>>(input: T): T & {
  format?: "round_robin";
  maxPlayers?: number;
  serverSlots?: number;
  winnersCount?: number;
  gameMode?: string;
  mapName?: string;
  description?: string;
  rules?: string;
  lobbyNotes?: string;
} {
  if (!isClashPrivateDraftTournament(input)) return input;

  const capacity = Number(input.maxPlayers || input.serverSlots || CLASH_PRIVATE_DRAFT_DEFAULT_CAPACITY);
  if (!CLASH_PRIVATE_DRAFT_CAPACITIES.includes(capacity as (typeof CLASH_PRIVATE_DRAFT_CAPACITIES)[number])) {
    throw new Error("ظرفیت مسابقه خصوصی کلش رویال فقط می‌تواند ۱۰، ۵۰، ۱۰۰ یا ۲۰۰ نفر باشد");
  }

  const customRules = String(input.rules || "").trim();
  const rules = customRules && customRules !== CLASH_PRIVATE_DRAFT_RULES
    ? `${CLASH_PRIVATE_DRAFT_RULES}\n\nقوانین تکمیلی برگزارکننده:\n${customRules}`
    : CLASH_PRIVATE_DRAFT_RULES;

  return {
    ...input,
    format: "round_robin",
    maxPlayers: capacity,
    serverSlots: capacity,
    winnersCount: Math.max(1, Number(input.winnersCount || 3)),
    gameMode: CLASH_PRIVATE_DRAFT_MODE,
    mapName: CLASH_PRIVATE_DRAFT_VENUE,
    description: String(input.description || "").trim() || CLASH_PRIVATE_DRAFT_DESCRIPTION,
    rules,
    lobbyNotes: String(input.lobbyNotes || "").trim() ||
      "نام/برچسب مسابقه و رمز فقط برای بازیکنان ثبت‌نام‌شده و در زمان اعلام‌شده نمایش داده می‌شود.",
  };
}
