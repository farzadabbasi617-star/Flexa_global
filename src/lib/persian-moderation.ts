import PersianSwear from "persian-swear-words";

/**
 * The upstream dataset intentionally contains a few context-dependent or
 * identity words. Blocking those by themselves creates unacceptable false
 * positives in normal tournament chat, so they are allow-listed here.
 */
const SAFE_STANDALONE_WORDS = new Set([
  "ترک",
  "فارس",
  "لر",
  "عرب",
  "کردن",
  "کردنی",
  "پریود",
  "جوون",
  "ماچ",
  "جنسی",
  "دوجنسه",
]);

// Multi-word insults are not detected by the upstream token-based helper.
// Keep this list deliberately small and high-confidence to avoid false bans.
const HIGH_CONFIDENCE_PHRASES = [
  "بی شعور",
  "بی شرف",
  "پدر سگ",
  "سگ پدر",
  "مادر جنده",
  "مادرجنده",
  "حروم زاده",
  "حرومزاده",
  "خفه شو",
];

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/gu;
const PERSIAN_HALF_SPACE = /\u200C/gu;
const ZERO_WIDTH_AND_TATWEEL = /[\u200B\u200D-\u200F\u202A-\u202E\u2060\u0640]/gu;
const NON_WORD_SEPARATOR = /[^\p{L}\p{N}#]+/gu;

/** Normalize common Persian/Arabic variants before moderation. */
export function normalizePersianForModeration(input: string): string {
  return input
    .normalize("NFKC")
    .replace(PERSIAN_HALF_SPACE, " ")
    .replace(ZERO_WIDTH_AND_TATWEEL, "")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[يى]/gu, "ی")
    .replace(/ك/gu, "ک")
    .replace(/ۀ/gu, "ه")
    .replace(NON_WORD_SEPARATOR, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export interface PersianProfanityResult {
  detected: boolean;
  matches: string[];
}

/**
 * Detect Persian profanity using a small Apache-2.0 dataset dependency plus
 * local normalization/false-positive protection. This runs server-side only
 * and is synchronous; it does not add any browser bundle or network request.
 */
export function detectPersianProfanity(input: string): PersianProfanityResult {
  const normalized = normalizePersianForModeration(input);
  if (!normalized) return { detected: false, matches: [] };

  const padded = ` ${normalized} `;
  const matches = new Set<string>();

  for (const phrase of HIGH_CONFIDENCE_PHRASES) {
    if (padded.includes(` ${phrase} `)) matches.add(phrase);
  }

  for (const token of normalized.split(" ")) {
    if (!token || SAFE_STANDALONE_WORDS.has(token)) continue;
    if (PersianSwear.isBad(token)) matches.add(token);
  }

  return { detected: matches.size > 0, matches: [...matches] };
}
