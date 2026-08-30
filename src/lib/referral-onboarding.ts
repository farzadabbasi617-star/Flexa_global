/**
 * Two-stage referral onboarding.
 *
 * The programme used to demand everything up front: a valid Iranian national
 * id, a 12-clause contract, six confirmation checkboxes, a signer name and an
 * email OTP -- all before a user could copy a link. Measured on live data that
 * is seven steps, and six of eighteen users could not even reach step one
 * because they had no national id on file. The result was 8 clicks and zero
 * commission events in the programme's lifetime.
 *
 * None of those requirements exist to hand out a link. They exist because
 * paying real money to a real bank account is a regulated act. So they now
 * apply where they belong:
 *
 *   Stage 1 -- LINK: log in, accept three plain rules. Get a code.
 *   Stage 2 -- CASH: national id, full contract with OTP, sheba. Get paid.
 *
 * Commission accrues from the first referred match either way. Only the
 * *withdrawal* is gated, which is also the moment the user has a concrete
 * reason to complete the paperwork.
 *
 * Transferring earnings to in-app credit sits in the middle: it is not a
 * withdrawal (the money never leaves Flexa and is not withdrawable), so it
 * does not need a bank identity -- but it is still a real transfer of value,
 * so it needs the signed contract.
 */

export type ReferralStage = "anonymous" | "link_ready" | "cash_ready";

/** The short rules a user accepts to get a link. No legal identity involved. */
export const REFERRAL_QUICK_RULES = [
  "خودم را دعوت نمی‌کنم و حساب تکراری نمی‌سازم.",
  "لینک را اسپم نمی‌کنم و وعده درآمد تضمینی نمی‌دهم.",
  "می‌دانم برای برداشت نقدی باید بعداً اطلاعات هویتی و بانکی را تکمیل کنم.",
] as const;

export const REFERRAL_QUICK_RULES_VERSION = "2026-08-quick-v1";

export interface ReferralAccountFacts {
  /** Does a personal referral partner row exist at all? */
  hasPartner: boolean;
  /** Has the user accepted the short rules (stage 1)? */
  quickRulesAcceptedAt?: Date | string | null;
  /** Has the user signed the full legal contract (stage 2)? */
  contractAcceptedAt?: Date | string | null;
  /** Ten-digit Iranian national id, required only for cash. */
  nationalId?: string | null;
  /** Iranian IBAN, required only for cash. */
  sheba?: string | null;
  /** Partner row status as stored. */
  status?: string | null;
}

function isPresent(value: Date | string | null | undefined) {
  if (!value) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return String(value).trim().length > 0;
}

export function hasUsableNationalId(nationalId?: string | null) {
  return /^\d{10}$/.test(String(nationalId ?? "").trim());
}

/**
 * Where the user is in the funnel.
 *
 * `link_ready` deliberately does not require the legal contract: a referral
 * code is not a financial instrument, it is a tracking string.
 */
export function referralStage(facts: ReferralAccountFacts): ReferralStage {
  if (!facts.hasPartner) return "anonymous";
  const signedQuick = isPresent(facts.quickRulesAcceptedAt) || isPresent(facts.contractAcceptedAt);
  if (!signedQuick) return "anonymous";
  if (canWithdrawCash(facts)) return "cash_ready";
  return "link_ready";
}

/** A link is issued as soon as the short rules are accepted. */
export function canIssueReferralLink(facts: ReferralAccountFacts) {
  return referralStage(facts) !== "anonymous";
}

/**
 * Moving earnings to in-app credit. Needs the signed contract because it is a
 * transfer of value, but not a bank identity because nothing leaves Flexa.
 */
export function canRedeemToGamingWallet(facts: ReferralAccountFacts) {
  return facts.hasPartner && isPresent(facts.contractAcceptedAt);
}

/** Cash out to a bank account. Everything is required here, and only here. */
export function canWithdrawCash(facts: ReferralAccountFacts) {
  return facts.hasPartner
    && isPresent(facts.contractAcceptedAt)
    && hasUsableNationalId(facts.nationalId)
    && String(facts.sheba ?? "").trim().length > 0;
}

export type ReferralRequirement = "quick_rules" | "contract" | "national_id" | "sheba";

/**
 * What is still missing before the user can take cash out, in the order the UI
 * should ask for it. Empty means they are done.
 */
export function missingForCashWithdrawal(facts: ReferralAccountFacts): ReferralRequirement[] {
  const missing: ReferralRequirement[] = [];
  if (!facts.hasPartner || (!isPresent(facts.quickRulesAcceptedAt) && !isPresent(facts.contractAcceptedAt))) {
    missing.push("quick_rules");
  }
  if (!isPresent(facts.contractAcceptedAt)) missing.push("contract");
  if (!hasUsableNationalId(facts.nationalId)) missing.push("national_id");
  if (!String(facts.sheba ?? "").trim()) missing.push("sheba");
  return missing;
}

const REQUIREMENT_LABELS: Record<ReferralRequirement, string> = {
  quick_rules: "پذیرش قوانین کوتاه معرفی",
  contract: "امضای قرارداد کامل با کد تأیید ایمیل",
  national_id: "ثبت کد ملی در پروفایل",
  sheba: "ثبت شماره شبا",
};

export function referralRequirementLabel(requirement: ReferralRequirement) {
  return REQUIREMENT_LABELS[requirement];
}

/** One-line summary for the dashboard header. */
export function referralStageHeadline(stage: ReferralStage) {
  if (stage === "anonymous") return "لینک دعوتت هنوز فعال نشده";
  if (stage === "link_ready") return "لینک دعوتت فعال است؛ درآمدت در حال جمع‌شدن است";
  return "لینک فعال است و امکان برداشت نقدی داری";
}
