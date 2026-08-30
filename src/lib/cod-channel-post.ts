/**
 * Formats the Telegram channel announcement for a Call of Duty room.
 *
 * Pure string building, kept apart from the send call so the copy — which is
 * the marketing surface for filling a 100-seat room — is unit-testable and
 * cannot silently drift from what the room page promises.
 */

function html(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toman(rial: string | null | undefined) {
  try { return (BigInt(rial || "0") / BigInt(10)).toLocaleString("fa-IR"); } catch { return "۰"; }
}

function tehranTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "full", timeStyle: "short", timeZone: "Asia/Tehran",
  }).format(date);
}

const MODE_LABEL: Record<string, string> = {
  solo: "سولو",
  duo: "دو نفره",
  squad: "چهار نفره",
};

export interface CodRoomChannelPost {
  id: string;
  title: string;
  map: string;
  teamMode: string;
  capacity: number;
  registeredCount?: number;
  entryFeeRial: string;
  minCodLevel?: number;
  /** Placement rows already scaled for a full lobby. */
  topPrizeRial?: string | null;
  totalPrizeRial?: string | null;
  startsAt: Date | string;
}

export function formatCodRoomChannelPost(room: CodRoomChannelPost) {
  const squads = room.teamMode === "squad"
    ? Math.floor(room.capacity / 4)
    : room.teamMode === "duo"
      ? Math.floor(room.capacity / 2)
      : room.capacity;
  const composition = room.teamMode === "solo"
    ? `${room.capacity.toLocaleString("fa-IR")} نفر`
    : `${squads.toLocaleString("fa-IR")} تیم ${MODE_LABEL[room.teamMode] || room.teamMode}`;

  const lines = [
    `🎯 <b>${html(room.title)}</b>`,
    "",
    `🗺 مپ: <b>${html(room.map)}</b>`,
    `👥 ترکیب: <b>${composition}</b>`,
    `💳 ورودی: <b>${toman(room.entryFeeRial)} USDT</b>`,
  ];

  if (room.topPrizeRial && BigInt(room.topPrizeRial) > BigInt(0)) {
    const winnerLabel = room.teamMode === "solo" ? "نفر اول" : "تیم اول";
    lines.push(`🏆 جایزه ${winnerLabel}: <b>${toman(room.topPrizeRial)} USDT</b>`);
  }

  if (room.minCodLevel && room.minCodLevel > 0) {
    lines.push(`🔒 حداقل لول اکانت کالاف: <b>${room.minCodLevel.toLocaleString("fa-IR")}</b>`);
  }

  lines.push("", `🕘 شروع: <b>${tehranTime(room.startsAt)}</b>`);

  const remaining = typeof room.registeredCount === "number"
    ? Math.max(0, room.capacity - room.registeredCount)
    : null;
  if (remaining !== null && remaining > 0 && remaining < room.capacity) {
    lines.push(`⚡️ فقط <b>${remaining.toLocaleString("fa-IR")} جایگاه</b> باقی مانده`);
  }

  // Mirrors the room page: prizes are quoted for a full lobby.
  lines.push("", "مبالغ اعلام‌شده در صورت تکمیل ظرفیت است.");
  lines.push("برای ثبت‌نام و دیدن قوانین وارد Flexa شو 👇");

  return lines.join("\n");
}

/** Sent to registered players shortly before check-in opens. */
export function formatCodCheckInReminder(room: Pick<CodRoomChannelPost, "title" | "startsAt">) {
  return [
    `⏰ <b>${html(room.title)}</b>`,
    "",
    "Check-in روم باز شد. تا قبل از شروع، حضورت را در Flexa تأیید کن؛",
    "بدون Check-in کد و پسورد روم برایت نمایش داده نمی‌شود و جایگاهت آزاد می‌شود.",
    "",
    `🕘 شروع: <b>${tehranTime(room.startsAt)}</b>`,
  ].join("\n");
}
