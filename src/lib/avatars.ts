/**
 * Selectable profile avatars.
 *
 * This list was previously duplicated in three places: the picker in
 * /profile/user, an unused copy in /profile, and ALLOWED_AVATARS in the
 * update-profile route. The route validates against its copy, so adding an
 * avatar to the UI without editing the route made it silently unselectable —
 * the save would succeed but fall back to the default icon.
 *
 * One exported list removes that failure mode: the picker renders it and the
 * server validates against it, so they cannot drift apart.
 */
export type AvatarOption = {
  label: string;
  url: string;
};

export const DEFAULT_AVATAR_URL = "/icons/profile_icon.png";

export const AVATAR_OPTIONS: AvatarOption[] = [
  // Cyber / neon
  { label: "نینجای سایبری", url: "/avatars/avatar_5.jpg" },
  { label: "شینوبی نئون", url: "/avatars/avatar_6.jpg" },
  { label: "شبح بنفش", url: "/avatars/avatar_7.jpg" },

  // Gold / shadow
  { label: "شمشیرزن مهتاب", url: "/avatars/avatar_8.jpg" },
  { label: "سایه طلایی", url: "/avatars/avatar_11.jpg" },

  // Forest
  { label: "ملکه جنگل", url: "/avatars/avatar_10.jpg" },
  { label: "کماندار جنگل", url: "/avatars/avatar_12.jpg" },

  // Fire / crimson
  { label: "کیتسونه آتش", url: "/avatars/avatar_9.jpg" },
  { label: "سامورایی سرخ", url: "/avatars/avatar_13.jpg" },
  { label: "شکوفه گیلاس", url: "/avatars/avatar_14.jpg" },

  // Original set
  { label: "لرد خون‌آشام", url: "/avatars/avatar_1.jpg" },
  { label: "دراکولا جوان", url: "/avatars/avatar_2.jpg" },
  { label: "ملکه رز سرخ", url: "/avatars/avatar_3.jpg" },
  { label: "امپراتور طلایی", url: "/avatars/avatar_4.jpg" },

  { label: "شوالیه پیش‌فرض", url: DEFAULT_AVATAR_URL },
  { label: "نشان Flexa", url: "/icons/flexa-icon-192.png" },
];

export const ALLOWED_AVATAR_URLS: readonly string[] = AVATAR_OPTIONS.map((a) => a.url);

/**
 * Anything not on the list resolves to the default rather than being stored.
 * avatar_url is rendered into other users' pages, so accepting an arbitrary
 * string would let one account place a chosen URL in front of everyone else.
 */
export function resolveAvatarUrl(value: unknown): string {
  const url = String(value ?? "").trim();
  return ALLOWED_AVATAR_URLS.includes(url) ? url : DEFAULT_AVATAR_URL;
}
