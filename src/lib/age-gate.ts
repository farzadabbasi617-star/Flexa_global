/**
 * Age-gate & light identity verification helpers.
 *
 * Product rule:
 *
 *   1. Real-money flows require a complete identity profile (`birthDate` and
 *      `nationalId`) so payments, refunds and fraud review have an owner.
 *   2. The previous hard 18+ server-side block is intentionally removed.
 *      Users acknowledge warnings and confirm 18+ responsibility during signup,
 *      but the API no longer rejects a paid action solely because the computed
 *      age is below 18.
 *   3. Free tournaments, login, browsing, chat, achievements, etc. remain
 *      accessible regardless of identity completion.
 *
 * This module is deliberately dependency-free: it takes plain values, so it
 * can be reused from route handlers, server actions and unit tests without
 * pulling in the database or Next.js.
 */

export const MIN_ADULT_AGE = 18;

/** Discriminated result so callers can branch on the exact failure. */
export type AgeGateResult =
  | { ok: true; ageYears: number }
  | {
      ok: false;
      code:
        | "MISSING_BIRTH_DATE"
        | "MISSING_NATIONAL_ID"
        | "INVALID_BIRTH_DATE";
      message: string;
      ageYears?: number;
    };

/**
 * Parse a birth date string into a Date at UTC midnight. Accepts:
 *   - "YYYY-MM-DD"        (Gregorian, preferred canonical form)
 *   - "YYYY/MM/DD"        (accepted, normalised)
 *   - "YYYY-M-D" / "YYYY/M/D" (loose)
 *
 * Rejects Jalali/Shamsi dates. The UI is responsible for converting a
 * Persian date picker's value to Gregorian before submitting.
 *
 * Returns `null` for anything unparseable so callers can produce a nice
 * user-facing error.
 */
export function parseBirthDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Basic sanity — no year-1 accidents from typos, no future dates.
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Guard against JS auto-rolling (e.g. Feb 30 → Mar 2).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  if (date.getTime() > Date.now()) return null;
  return date;
}

/**
 * Full years elapsed between `birth` and `now`. Uses the calendar-birthday
 * definition (age increments on the anniversary), NOT a naive ms/year div.
 */
export function calculateAgeYears(birth: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Check whether a user is allowed to enter real-money flows.
 * Pass the minimum shape needed — this keeps the function easy to call
 * from anywhere without dragging the full User type around.
 */
export function checkAgeGate(user: {
  birthDate?: string | null;
  nationalId?: string | null;
}, now: Date = new Date()): AgeGateResult {
  if (!user.nationalId || !String(user.nationalId).trim()) {
    return {
      ok: false,
      code: "MISSING_NATIONAL_ID",
      message: "برای این عملیات باید کد ملی خود را در پروفایل ثبت کنید.",
    };
  }
  if (!user.birthDate || !String(user.birthDate).trim()) {
    return {
      ok: false,
      code: "MISSING_BIRTH_DATE",
      message: "برای این عملیات باید تاریخ تولد خود را در پروفایل ثبت کنید.",
    };
  }
  const parsed = parseBirthDate(user.birthDate);
  if (!parsed) {
    return {
      ok: false,
      code: "INVALID_BIRTH_DATE",
      message: "تاریخ تولد ثبت‌شده معتبر نیست. لطفاً از بخش پروفایل اصلاح کنید.",
    };
  }
  const ageYears = calculateAgeYears(parsed, now);
  return { ok: true, ageYears };
}

/**
 * Convenience predicate for the UI (tournament card, buttons, banners).
 * False now means identity fields are missing/invalid, not that age is under 18.
 */
export function isEligibleForPaidActions(user: {
  birthDate?: string | null;
  nationalId?: string | null;
}): boolean {
  return checkAgeGate(user).ok;
}
