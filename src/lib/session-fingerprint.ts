/**
 * Session device fingerprinting.
 *
 * Sessions are bound to the browser that created them as a defence-in-depth
 * measure against stolen cookies. The naive version of this check compares the
 * raw `User-Agent` string byte-for-byte — but browsers rewrite that string on
 * every self-update (`Chrome/131.0.0.0` becomes `Chrome/132.0.0.0`), and
 * Chromium reduced-UA shifts minor/patch segments around. An exact comparison
 * therefore logs real users out for no security reason, which is exactly the
 * failure mode we want to avoid on a wallet-bearing product.
 *
 * Instead we derive a *stable* fingerprint: the browser/engine family, the OS
 * family, and the device class (mobile vs desktop) — deliberately dropping
 * version numbers, build IDs and other volatile segments. A session survives a
 * browser update but is still rejected if the cookie is replayed from a
 * genuinely different browser, OS or form factor.
 */

export interface SessionFingerprint {
  browser: string;
  os: string;
  device: "mobile" | "desktop";
}

/** Browser/engine families, ordered so more specific brands win. */
const BROWSER_MATCHERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bedg(?:e|a|ios)?\//i, "edge"],
  [/\b(?:opr|opera)\//i, "opera"],
  [/\bsamsungbrowser\//i, "samsung"],
  [/\byabrowser\//i, "yandex"],
  [/\bucbrowser\//i, "uc"],
  [/\bfirefox\/|\bfxios\//i, "firefox"],
  [/\bchrome\/|\bcrios\//i, "chrome"],
  [/\bsafari\//i, "safari"],
  [/\bcurl\/|\bwget\/|\bpython-requests\//i, "cli"],
  [/\bbot\b|\bcrawler\b|\bspider\b/i, "bot"],
];

const OS_MATCHERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bandroid\b/i, "android"],
  [/\b(?:iphone|ipad|ipod|ios)\b/i, "ios"],
  [/\bwindows\b|\bwin32\b|\bwin64\b/i, "windows"],
  [/\bmac os x\b|\bmacintosh\b/i, "macos"],
  [/\bcros\b/i, "chromeos"],
  [/\blinux\b|\bx11\b/i, "linux"],
];

const MOBILE_HINT = /\bmobi|\bandroid\b|\biphone\b|\bipad\b|\bipod\b|\bwindows phone\b/i;

function matchFirst(
  value: string,
  matchers: ReadonlyArray<readonly [RegExp, string]>
): string {
  for (const [pattern, label] of matchers) {
    if (pattern.test(value)) return label;
  }
  return "unknown";
}

/**
 * Reduce a raw User-Agent header to the parts that should not change while a
 * user stays on the same device and browser.
 */
export function sessionFingerprint(userAgent: string | null | undefined): SessionFingerprint {
  const ua = (userAgent || "").trim();

  return {
    browser: matchFirst(ua, BROWSER_MATCHERS),
    os: matchFirst(ua, OS_MATCHERS),
    device: MOBILE_HINT.test(ua) ? "mobile" : "desktop",
  };
}

/** Stable, comparable string form — handy for logs and equality checks. */
export function serializeFingerprint(userAgent: string | null | undefined): string {
  const { browser, os, device } = sessionFingerprint(userAgent);
  return `${browser}/${os}/${device}`;
}

/**
 * Decide whether a request's User-Agent is consistent with the one that
 * created the session.
 *
 * Returns `true` (allow) when the stable fingerprints match. Unknown or empty
 * stored values are treated as "cannot compare" and allowed, so sessions
 * created before fingerprinting — or by clients that send no User-Agent — are
 * never destroyed by this check.
 */
export function isSameDevice(
  storedUserAgent: string | null | undefined,
  currentUserAgent: string | null | undefined
): boolean {
  // Fast path: byte-identical headers are trivially the same device.
  if (storedUserAgent === currentUserAgent) return true;

  const stored = (storedUserAgent || "").trim();
  const current = (currentUserAgent || "").trim();

  // Nothing meaningful to compare against — do not punish the user.
  if (!stored || !current) return true;

  const a = sessionFingerprint(stored);
  const b = sessionFingerprint(current);

  // If either side is an unrecognised client, the fingerprint carries no
  // signal; refusing here would only break unusual-but-legitimate browsers.
  if (a.browser === "unknown" || b.browser === "unknown") return true;

  return a.browser === b.browser && a.os === b.os && a.device === b.device;
}
