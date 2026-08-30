/**
 * Invite-link helpers.
 *
 * The affiliate engine only ever produced a Telegram deep link
 * (`t.me/<bot>?start=aff_CODE`). That silently loses every referral shared on
 * WhatsApp, Instagram or SMS to somebody who does not use Telegram: they land
 * nowhere, sign up unattributed, and the referrer is never paid.
 *
 * A web link (`<app>/r/CODE`) covers those channels. It stores the code and
 * forwards to the normal signup flow, so the same referral code works on every
 * platform.
 */

const DEFAULT_APP_URL = "https://www.flexa1.ir";

/** Pins a browser to one attribution across the signup flow. HttpOnly. */
export const REFERRAL_VISITOR_COOKIE = "gm_ref_visitor";
/** Readable by the client so the register page can show the invite banner. */
export const REFERRAL_CODE_COOKIE = "gm_ref_code";

/** Referral codes are alphanumeric and case-insensitive; store them upper-case. */
export function normalizeInviteCode(input: unknown) {
  return String(input ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

export function isValidInviteCode(input: unknown) {
  const code = normalizeInviteCode(input);
  return code.length >= 6 && code.length <= 24;
}

export function referralAppUrl() {
  return (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/$/, "");
}

/**
 * Public origin of the current request.
 *
 * `request.nextUrl.origin` is the address the Node process is bound to, which
 * behind Render's proxy is `https://localhost:10000` -- redirecting there sends
 * every invite click to a dead page. The forwarded headers carry the real host,
 * with APP_URL as the final fallback.
 */
export function publicOriginFromHeaders(headers: {
  get(name: string): string | null;
}, fallback = referralAppUrl()) {
  const host = headers.get("x-forwarded-host") || headers.get("host");
  if (!host || host.startsWith("localhost") || host.startsWith("127.0.0.1")) return fallback.replace(/\/$/, "");
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return `${proto}://${host}`.replace(/\/$/, "");
}

/** Short web link that works in any messenger, not just Telegram. */
export function referralWebLink(referralCode: string, appUrl = referralAppUrl()) {
  const code = normalizeInviteCode(referralCode);
  if (!code) return "";
  return `${appUrl.replace(/\/$/, "")}/r/${code}`;
}

/**
 * Ready-made share text. Players copy a bare URL and paste it with no context,
 * which converts badly; giving them the sentence is part of the product.
 */
export function referralShareMessage(input: {
  referralCode: string;
  appUrl?: string;
  commissionToman?: number;
}) {
  const link = referralWebLink(input.referralCode, input.appUrl ?? referralAppUrl());
  if (!link) return "";
  const lines = [
    "🎮 تو Flexa روم کالاف و فورتنایت با جایزه نقدی برگزار می‌شه.",
    "با این لینک ثبت‌نام کن:",
    link,
  ];
  return lines.join("\n");
}

export type ShareTarget = "telegram" | "whatsapp" | "native" | "copy";

/** URL that opens a messenger's share sheet pre-filled with the invite text. */
export function shareTargetUrl(target: Exclude<ShareTarget, "native" | "copy">, message: string, link: string) {
  if (target === "telegram") {
    return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
