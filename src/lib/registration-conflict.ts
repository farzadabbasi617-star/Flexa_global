/**
 * Decides what a registration conflict is allowed to tell the caller.
 *
 * Returning a different 409 per field ("email already registered", "phone
 * already registered", "national id already registered") turns registration
 * into a lookup oracle: submit a value, read the error, learn whether that
 * person has an account. On a site handling payments and holding national ids
 * that is both a privacy leak and a targeting aid.
 *
 * Username is the deliberate exception. It is rendered publicly on profiles and
 * leaderboards, so its availability is already discoverable, and hiding it
 * would make picking a name a guessing game.
 */
export type RegistrationConflictInput = {
  usernameTaken: boolean;
  emailTaken: boolean;
  phoneTaken: boolean;
  nationalIdTaken: boolean;
};

export const USERNAME_CONFLICT_MESSAGE = "نام کاربری قبلاً انتخاب شده است";

export const IDENTITY_CONFLICT_MESSAGE =
  "امکان ثبت‌نام با این مشخصات وجود ندارد. اگر قبلاً حساب ساخته‌اید وارد شوید یا رمز عبور را بازیابی کنید؛ در غیر این صورت با پشتیبانی تماس بگیرید.";

export function registrationConflictMessage(input: RegistrationConflictInput): string | null {
  if (input.usernameTaken) return USERNAME_CONFLICT_MESSAGE;
  if (input.emailTaken || input.phoneTaken || input.nationalIdTaken) {
    return IDENTITY_CONFLICT_MESSAGE;
  }
  return null;
}
