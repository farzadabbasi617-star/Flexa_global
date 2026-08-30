/**
 * Jalali (Solar Hijri / شمسی) ↔ Gregorian date conversion.
 *
 * We store birth dates in the DB as Gregorian ISO (YYYY-MM-DD) because
 * age arithmetic is trivial and the SQL/Date ecosystem understands it
 * everywhere. But Iranian users mentally know their birthday in Jalali,
 * so all UI input and display goes through this module.
 *
 * Algorithm: Kazimierz M. Borkowski / Roozbeh Pournader's canonical
 * implementation (used by moment-jalaali, jalaali-js, date-fns-jalali,
 * etc.). It is accurate for the years 1178..1633 Jalali (roughly
 * 1799..2255 Gregorian) — more than enough for birth dates.
 *
 * This file has zero runtime dependencies so it can be imported from
 * server components, client components and unit tests alike.
 */

/** Persian-digit conversion for display. */
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export function toFaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}
export function toEnDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    // Arabic-Indic digits (٠-٩) show up when users paste from Arabic keyboards.
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** Persian names for months, indexed 1..12. */
export const JALALI_MONTHS_FA = [
  "", // 1-based
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

// ---------------------------------------------------------------------------
// Core algorithm (jalaali-js compatible). Kept private; callers use the
// friendly wrappers below.
// ---------------------------------------------------------------------------

// Adapted from jalaali-js by Behrang Noruzi Niya (MIT). Uses simple
// integer arithmetic; no external dependencies.

function div(a: number, b: number): number {
  return ~~(a / b); // truncates toward zero (safe for positive JDNs)
}

function mod(a: number, b: number): number {
  return a - ~~(a / b) * b;
}

interface JalCalResult {
  leap: number;   // 0..4 — years since last leap (0 means "this year IS a leap")
  gy: number;     // Gregorian year of the beginning of the given Jalali year
  march: number;  // day-of-March that is 1 Farvardin of jy
}

function jalCal(jy: number): JalCalResult {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181,
    1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
  ];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];

  if (jy < jp || jy >= breaks[bl - 1]) {
    throw new Error("Invalid Jalali year " + jy);
  }

  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;

  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function jalaaliToJDN(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return (
    gregorianToJDN(r.gy, 3, r.march) +
    (jm - 1) * 31 -
    div(jm, 7) * (jm - 7) +
    jd -
    1
  );
}

function gregorianToJDN(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function jdnToJalaali(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = jdnToGregorian(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = gregorianToJDN(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm: number;
  let jd: number;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

function jdnToGregorian(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

/** Returns true if the given Jalali year is a leap year. */
export function isJalaliLeap(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

/** Number of days in a Jalali month (1..12) of a given Jalali year. */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm < 1 || jm > 12) return 0;
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

/** Convert Jalali {jy, jm, jd} to Gregorian {gy, gm, gd}. */
export function jalaliToGregorian(
  jy: number,
  jm: number,
  jd: number
): { gy: number; gm: number; gd: number } {
  return jdnToGregorian(jalaaliToJDN(jy, jm, jd));
}

/** Convert Gregorian {gy, gm, gd} to Jalali {jy, jm, jd}. */
export function gregorianToJalali(
  gy: number,
  gm: number,
  gd: number
): { jy: number; jm: number; jd: number } {
  return jdnToJalaali(gregorianToJDN(gy, gm, gd));
}

// ---------------------------------------------------------------------------
// String helpers used by the UI: DB always stores Gregorian YYYY-MM-DD,
// UI usually shows/collects Jalali YYYY/MM/DD.
// ---------------------------------------------------------------------------

/**
 * Validate that the given Jalali date is a real calendar date (rejects
 * things like 1400/13/01 or 1400/12/31 in a non-leap year).
 */
export function isValidJalali(jy: number, jm: number, jd: number): boolean {
  if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) return false;
  if (jy < 1200 || jy > 1500) return false;
  if (jm < 1 || jm > 12) return false;
  if (jd < 1) return false;
  return jd <= jalaliMonthLength(jy, jm);
}

/**
 * Parse a Jalali string like "1380/03/21", "1380-3-21", "۱۳۸۰/۳/۲۱" into
 * {jy, jm, jd}. Returns null on any error — never throws.
 */
export function parseJalaliString(
  input: string | null | undefined
): { jy: number; jm: number; jd: number } | null {
  if (!input) return null;
  const en = toEnDigits(String(input)).trim();
  const m = en.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  const jd = Number(m[3]);
  if (!isValidJalali(jy, jm, jd)) return null;
  return { jy, jm, jd };
}

/**
 * Convert a Jalali "YYYY/MM/DD" (or "YYYY-M-D") input into the canonical
 * Gregorian ISO "YYYY-MM-DD" we store in the DB. Returns null on invalid.
 */
export function jalaliStringToGregorianISO(input: string | null | undefined): string | null {
  const j = parseJalaliString(input);
  if (!j) return null;
  const g = jalaliToGregorian(j.jy, j.jm, j.jd);
  const mm = String(g.gm).padStart(2, "0");
  const dd = String(g.gd).padStart(2, "0");
  return `${g.gy}-${mm}-${dd}`;
}

/**
 * Convert a Gregorian ISO "YYYY-MM-DD" (whatever we have in the DB) into
 * a user-facing Jalali string. `digits` controls latin vs Persian digits.
 * `separator` defaults to slash.
 */
export function gregorianISOToJalaliString(
  iso: string | null | undefined,
  opts: { digits?: "latin" | "fa"; separator?: string; monthName?: boolean } = {}
): string {
  if (!iso) return "";
  const m = String(iso).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const gy = Number(m[1]);
  const gm = Number(m[2]);
  const gd = Number(m[3]);
  const j = gregorianToJalali(gy, gm, gd);
  const sep = opts.separator ?? "/";
  const digits = opts.digits ?? "fa";
  const jm = String(j.jm).padStart(2, "0");
  const jd = String(j.jd).padStart(2, "0");
  let out: string;
  if (opts.monthName) {
    out = `${j.jd} ${JALALI_MONTHS_FA[j.jm]} ${j.jy}`;
  } else {
    out = `${j.jy}${sep}${jm}${sep}${jd}`;
  }
  return digits === "fa" ? toFaDigits(out) : out;
}

/** Return today's Jalali date as {jy, jm, jd}. */
export function todayJalali(): { jy: number; jm: number; jd: number } {
  const now = new Date();
  return gregorianToJalali(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}
