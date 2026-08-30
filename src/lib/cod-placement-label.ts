import type { CodBrTeamMode } from "./cod-room-policy";

const ORDINALS = [
  "اول", "دوم", "سوم", "چهارم", "پنجم", "ششم", "هفتم", "هشتم", "نهم", "دهم",
  "یازدهم", "دوازدهم", "سیزدهم", "چهاردهم", "پانزدهم", "شانزدهم", "هفدهم", "هجدهم", "نوزدهم", "بیستم",
];

function ordinal(position: number) {
  return ORDINALS[position - 1] || `${position.toLocaleString("fa-IR")}اُم`;
}

/**
 * Label for a row of the prize table, e.g. "جایزه تیم اول" or "جایزه نفرات چهارم تا یازدهم".
 *
 * Solo rooms are phrased per player and team rooms per team, because in a squad
 * room the listed amount is the squad's prize.
 */
export function codPlacementLabel(from: number, to: number, teamMode: CodBrTeamMode | string) {
  const subject = teamMode === "solo" ? "نفر" : "تیم";
  const pluralSubject = teamMode === "solo" ? "نفرات" : "تیم‌های";
  if (from === to) return `جایزه ${subject} ${ordinal(from)}`;
  return `جایزه ${pluralSubject} ${ordinal(from)} تا ${ordinal(to)}`;
}
