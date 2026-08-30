import mailchecker from "mailchecker";

// A handful of well-known disposable/temp-mail domains that keep popping up
// in signup abuse but aren't always covered by mailchecker's bundled list
// yet. Kept small and reviewed occasionally — mailchecker is the primary
// defense, this is just a belt-and-suspenders top-up.
const EXTRA_DISPOSABLE_DOMAINS = [
  "tempmail.com",
  "temp-mail.org",
  "guerrillamail.com",
  "guerrillamail.info",
  "10minutemail.com",
  "10minutemail.net",
  "mailinator.com",
  "mailinator.net",
  "yopmail.com",
  "yopmail.fr",
  "throwawaymail.com",
  "fakeinbox.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "dispostable.com",
  "mohmal.com",
  "moakt.com",
  "emailondeck.com",
  "maildrop.cc",
];

let extendedOnce = false;
function ensureExtended() {
  if (extendedOnce) return;
  mailchecker.addCustomDomains(EXTRA_DISPOSABLE_DOMAINS);
  extendedOnce = true;
}

/**
 * Returns true when the email looks syntactically valid AND is not from a
 * known disposable/throwaway/temporary email provider (Mailinator,
 * Guerrilla Mail, YOPmail, 10 Minute Mail, etc). Used to block fake/one-time
 * emails at registration so account confirmation (email OTP) can't be
 * trivially bypassed with a burner inbox.
 */
export function isRealEmail(email: string): boolean {
  ensureExtended();
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return mailchecker.isValid(normalized);
}
