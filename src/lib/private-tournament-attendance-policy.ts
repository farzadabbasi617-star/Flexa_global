export const PRIVATE_CHECKIN_OPENS_MINUTES = 30;
export const PRIVATE_CHECKIN_GRACE_MINUTES = 15;

export function privateCheckInWindow(startDate: Date | string) {
  const start = new Date(startDate).getTime();
  return {
    opensAt: new Date(start - PRIVATE_CHECKIN_OPENS_MINUTES * 60 * 1000),
    startsAt: new Date(start),
    closesAt: new Date(start + PRIVATE_CHECKIN_GRACE_MINUTES * 60 * 1000),
  };
}

export function privateCancellationKeepsEntryFee(startDate?: Date | string | null, now = new Date()) {
  if (!startDate) return false;
  return now.getTime() >= privateCheckInWindow(startDate).opensAt.getTime();
}

export const PRIVATE_NO_SHOW_POLICY_TEXT = [
  "قانون حضور و عدم بازگشت وجه:",
  "• ورودی هنگام ثبت‌نام از کیف پول کسر می‌شود.",
  "• چک‌این از ۳۰ دقیقه قبل شروع تا ۱۵ دقیقه بعد از شروع باز است.",
  "• عدم چک‌این یا عدم حضور، No-show محسوب می‌شود.",
  "• در حالت No-show ورودی بازگردانده نمی‌شود و داخل استخر جایزه برندگان باقی می‌ماند.",
  "• بازیکن غایب نام/رمز مسابقه را دریافت نمی‌کند.",
  "• فقط لغو مسابقه یا خطای فنی برگزارکننده باعث Refund کامل می‌شود.",
].join("\n");
