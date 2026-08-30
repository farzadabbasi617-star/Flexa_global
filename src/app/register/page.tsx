"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import AnimatedFlexaLogo from "@/components/AnimatedFlexaLogo";
import TiltCard from "@/components/fx/TiltCard";
import ParticleField from "@/components/fx/ParticleField";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { EMAIL_OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/email-policy";
import { normalizePhoneNumber } from "@/lib/phone";
import { isPasswordStrong } from "@/lib/password-strength";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import OtpCodeInput from "@/components/OtpCodeInput";
import JalaliDatePicker from "@/components/JalaliDatePicker";
import { isValidIranianNationalId } from "@/lib/validations";
import { calculateAgeYears, MIN_ADULT_AGE, parseBirthDate } from "@/lib/age-gate";
import { REFERRAL_CODE_COOKIE, normalizeInviteCode } from "@/lib/referral-invite";

export default function RegisterPage() {
  const { t, lang } = useLanguage();
  const { register, verifyEmailOtp, resendEmailOtp } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    phoneNumber: "",
    email: "",
    username: "",
    firstName: "",
    lastName: "",
    birthDate: "",
    nationalId: "",
    password: "",
    confirmPassword: "",
    termsAccepted: false,
    riskAndAgeAccepted: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set by /r/<code>. Purely informational: the binding itself happens
  // server-side from the httpOnly companion cookie, so it cannot be spoofed
  // by editing this value.
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    const fromCookie = document.cookie.split("; ").find((row) => row.startsWith(`${REFERRAL_CODE_COOKIE}=`));
    const value = fromCookie ? decodeURIComponent(fromCookie.split("=")[1] || "") : "";
    if (value) setInviteCode(normalizeInviteCode(value));
  }, []);

  // Step 2: email OTP confirmation, shown after a successful registration.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  // Held briefly so the success tick is seen before we navigate away.
  const [otpVerified, setOtpVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const phoneNumber = normalizePhoneNumber(form.phoneNumber);

    if (!/^09\d{9}$/.test(phoneNumber)) {
      setError(lang === "fa" ? "شماره موبایل معتبر نیست. مثال: 09123456789" : "Invalid mobile number. Example: 09123456789");
      return;
    }

    if (!form.email.trim()) {
      setError(lang === "fa" ? "ایمیل الزامی است" : "Email is required");
      return;
    }

    if (!form.firstName.trim()) {
      setError(lang === "fa" ? "نام الزامی است" : "First name is required");
      return;
    }

    if (!form.lastName.trim()) {
      setError(lang === "fa" ? "نام خانوادگی الزامی است" : "Last name is required");
      return;
    }

    // Birth date + national ID: required at signup so the paid flows
    // (wallet top-up, paid tournament registration) never need to
    // interrupt the user mid-payment to collect them later.
    // The picker gives us Gregorian ISO already; parseBirthDate simply
    // sanity-checks it.
    const parsedBirth = parseBirthDate(form.birthDate);
    if (!parsedBirth) {
      setError(
        lang === "fa"
          ? "لطفاً تاریخ تولد را از تقویم شمسی انتخاب کنید"
          : "Please pick your birth date from the Jalali calendar"
      );
      return;
    }
    if (!isValidIranianNationalId(form.nationalId)) {
      setError(lang === "fa" ? "کد ملی وارد شده معتبر نیست" : "National ID is not valid");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError(lang === "fa" ? "رمز عبور و تکرار آن یکسان نیستند" : "Passwords do not match");
      return;
    }

    if (!isPasswordStrong(form.password)) {
      setError(
        lang === "fa"
          ? "رمز عبور به اندازه کافی قوی نیست. شرایط زیر فرم را کامل کنید."
          : "Password is not strong enough. Please meet all the requirements below."
      );
      return;
    }

    if (!form.termsAccepted) {
      setError("برای ثبت‌نام، پذیرش قوانین و مقررات Flexa الزامی است.");
      return;
    }

    if (!form.riskAndAgeAccepted) {
      setError("برای ثبت‌نام، مطالعه و تأیید اخطارها، محدودیت‌ها و اعلام مسئولیت سنی الزامی است.");
      return;
    }

    setLoading(true);

    const result = await register(
      phoneNumber,
      form.email.trim(),
      form.username.trim(),
      form.password,
      form.firstName.trim(),
      form.lastName.trim(),
      form.birthDate.trim(),
      form.nationalId.replace(/\D/g, ""),
      form.termsAccepted,
      form.riskAndAgeAccepted
    );

    if (result.success) {
      setPendingEmail(result.email || form.email.trim());
    } else {
      setError(result.error || (lang === "fa" ? "ثبت‌نام ناموفق بود" : "Registration failed"));
    }
    setLoading(false);
  }

  /**
   * Runs automatically the moment the sixth digit lands -- there is no submit
   * button any more. `submitted` is passed in because state may not have
   * flushed yet when the auto-complete callback fires.
   */
  const runVerification = useCallback(async (submitted: string) => {
    if (!pendingEmail || otpLoading || otpVerified) return;
    setOtpError("");
    if (!/^\d{6}$/.test(submitted.trim())) {
      setOtpError(lang === "fa" ? "کد تایید باید ۶ رقم باشد" : "Code must be 6 digits");
      return;
    }

    setOtpLoading(true);
    const result = await verifyEmailOtp(pendingEmail, submitted.trim());
    setOtpLoading(false);

    if (result.success) {
      // Let the tick animation play before leaving the page.
      setOtpVerified(true);
      setTimeout(() => router.push("/"), 1150);
    } else {
      setOtpCode("");
      setOtpError(result.error || (lang === "fa" ? "تایید کد ناموفق بود" : "Verification failed"));
    }
  }, [pendingEmail, otpLoading, otpVerified, lang, verifyEmailOtp, router]);

  async function handleResend() {
    if (!pendingEmail || resendCooldown > 0) return;
    setResendMessage("");
    setOtpError("");
    const result = await resendEmailOtp(pendingEmail);
    if (result.success) {
      setResendMessage(lang === "fa" ? "کد جدید ارسال شد." : "A new code was sent.");
      setResendCooldown(EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
      const timer = setInterval(() => {
        setResendCooldown((value) => {
          if (value <= 1) {
            clearInterval(timer);
            return 0;
          }
          return value - 1;
        });
      }, 1000);
    } else {
      setOtpError(result.error || (lang === "fa" ? "ارسال مجدد ناموفق بود" : "Resend failed"));
    }
  }

  if (pendingEmail) {
    return (
      <div className="min-h-screen bg-dark-900 relative overflow-hidden">
        <ParticleField count={34} className="opacity-50 z-0" />
        <div className="relative z-10">
          <Navbar />
          <div className="max-w-lg mx-auto px-4 py-6 sm:py-12" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
            <TiltCard maxTilt={4} liftZ={10} glare={false} className="rounded-2xl">
              <div className="gaming-card p-5 sm:p-8">
                <div className="text-center mb-6 sm:mb-8">
                  <AnimatedFlexaLogo size="lg" showLabel className="mb-6" />
                  <div className="text-4xl mb-3">📧</div>
                  <h1 className="text-2xl font-bold neon-text-purple">
                    {lang === "fa" ? "تایید ایمیل" : "Verify your email"}
                  </h1>
                  <p className="text-gray-400 mt-2 text-sm leading-7">
                    {lang === "fa"
                      ? <>کد ۶ رقمی تایید به آدرس <span dir="ltr" className="text-white font-bold">{pendingEmail}</span> ارسال شد. اگر در Inbox ندیدی، حتماً پوشه <b className="text-amber-300">Spam / Junk</b> را بررسی کن.</>
                      : <>A 6-digit code was sent to <span dir="ltr" className="text-white font-bold">{pendingEmail}</span>. If it is not in your inbox, check <b className="text-amber-300">Spam / Junk</b>.</>}
                  </p>
                </div>

                {resendMessage && (
                  <div className="bg-emerald-900/20 border border-emerald-500/40 text-emerald-400 px-4 py-3 rounded-lg mb-6 text-sm">
                    {resendMessage}
                  </div>
                )}

                <OtpCodeInput
                  value={otpCode}
                  onChange={(next) => { setOtpCode(next); if (otpError) setOtpError(""); }}
                  onComplete={runVerification}
                  length={6}
                  disabled={otpLoading}
                  error={otpError}
                  verified={otpVerified}
                  verifiedTitle={lang === "fa" ? "ایمیل تأیید شد" : "Email verified"}
                  verifiedSubtitle={lang === "fa" ? "در حال ورود به Flexa..." : "Signing you in..."}
                  label={lang === "fa" ? "کد ۶ رقمی را وارد کن؛ خودکار تأیید می‌شود" : "Enter the 6-digit code; it verifies automatically"}
                />

                {otpLoading && !otpVerified && (
                  <p className="mt-4 text-center text-xs font-bold text-cyan-300">
                    {lang === "fa" ? "در حال تایید..." : "Verifying..."}
                  </p>
                )}

                <div className="text-center mt-6 text-sm text-gray-400">
                  {lang === "fa" ? "کدی دریافت نکردید؟" : "Didn't receive a code?"}{" "}
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0}
                    className="text-neon-blue hover:underline disabled:text-gray-600 disabled:no-underline"
                  >
                    {resendCooldown > 0
                      ? (lang === "fa" ? `ارسال مجدد (${resendCooldown})` : `Resend (${resendCooldown})`)
                      : (lang === "fa" ? "ارسال مجدد کد" : "Resend code")}
                  </button>
                </div>

                <div className="text-center mt-4 text-xs text-gray-600">
                  <button type="button" onClick={() => setPendingEmail(null)} className="hover:text-gray-400 hover:underline">
                    {lang === "fa" ? "بازگشت و اصلاح اطلاعات" : "Back and edit details"}
                  </button>
                </div>
              </div>
            </TiltCard>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 relative overflow-hidden">
      <ParticleField count={34} className="opacity-50 z-0" />
      <div className="relative z-10">
      <Navbar />

      <div className="max-w-lg mx-auto px-4 py-6 sm:py-12" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
        <TiltCard maxTilt={4} liftZ={10} glare={false} className="rounded-2xl">
        <div className="gaming-card p-5 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <AnimatedFlexaLogo size="lg" showLabel className="mb-6" />
            <h1 className="text-2xl font-bold neon-text-purple">{t.auth.registerTitle}</h1>
            <p className="text-gray-400 mt-1">
              {lang === "fa" ? "حساب Flexa بسازید و وارد آرنا شوید" : "Create your Flexa account and enter the arena"}
            </p>
          </div>

          {inviteCode && (
            <div className="bg-cyan-500/10 border border-cyan-400/30 text-cyan-200 px-4 py-3 rounded-xl mb-4 text-xs leading-6 flex items-center gap-2">
              <span className="text-base">🎁</span>
              <span>
                {lang === "fa"
                  ? <>با دعوت کد <b dir="ltr">{inviteCode}</b> وارد شدی. ثبت‌نامت به‌نام دعوت‌کننده ثبت می‌شود.</>
                  : <>You were invited with code <b dir="ltr">{inviteCode}</b>.</>}
              </span>
            </div>
          )}

          <div className="bg-neon-blue/10 border border-neon-blue/30 text-neon-blue px-4 py-3 rounded-xl mb-6 text-xs leading-6">
            {lang === "fa"
              ? "برای تایید حساب، یک کد ۶ رقمی به ایمیل شما ارسال می‌شود. ممکن است پیام وارد پوشه Spam یا Junk شود؛ آن پوشه را هم بررسی کنید. شماره موبایل برای ارتباط و شناسایی ثبت می‌شود."
              : "A 6-digit code will be emailed to confirm your account. The message may arrive in Spam or Junk, so check those folders too. Your mobile number is also required for contact/identification."}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {lang === "fa" ? "شماره موبایل" : "Mobile number"} *
              </label>
              <input
                type="tel"
                inputMode="numeric"
                required
                dir="ltr"
                className="gaming-input text-left"
                placeholder="09123456789"
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                onBlur={() => setForm({ ...form, phoneNumber: normalizePhoneNumber(form.phoneNumber) })}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t.auth.email} *
              </label>
              <input
                type="email"
                required
                dir="ltr"
                className="gaming-input text-left"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                {lang === "fa"
                  ? "کد تایید به این ایمیل ارسال می‌شود و ممکن است در Spam/Junk دیده شود. از ایمیل واقعی و همیشگی استفاده کنید؛ ایمیل موقت پذیرفته نمی‌شود."
                  : "The verification code is sent here and may appear in Spam/Junk. Use a real permanent email; temporary addresses are not accepted."}
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2 font-bold">
                {lang === "fa" ? "نام بازیکن در Flexa" : "Flexa gamer name"} *
              </label>
              <input
                type="text"
                required
                dir="ltr"
                className="gaming-input text-left"
                placeholder="Farzadov"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
              <p className="text-[11px] text-purple-300/80 mt-1.5 leading-5">
                {lang === "fa"
                  ? "این نام عمومی شما در پروفایل، مسابقات و بازی‌های Flexa است و با نام واقعی پایین کاملاً جدا می‌ماند."
                  : "This is your public name in profiles and matches. It remains separate from your legal name below."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {lang === "fa" ? "نام واقعی (خصوصی)" : "Legal first name (private)"} *
                </label>
                <input
                  type="text"
                  required
                  className="gaming-input"
                  placeholder={lang === "fa" ? "مثلاً فرزاد" : "e.g., John"}
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {lang === "fa" ? "نام خانوادگی واقعی (خصوصی)" : "Legal last name (private)"} *
                </label>
                <input
                  type="text"
                  required
                  className="gaming-input"
                  placeholder={lang === "fa" ? "مثلاً عباسی" : "e.g., Doe"}
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
            </div>

            {/* Identity metadata: birth date + Iranian national ID. Required at
                signup so paid actions, wallet reviews and fraud checks have a
                verified account owner. Age is acknowledged below, not hard-blocked. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {lang === "fa" ? "تاریخ تولد (شمسی)" : "Birth date (Jalali/شمسی)"} *
                </label>
                <JalaliDatePicker
                  value={form.birthDate}
                  onChange={(iso) => setForm({ ...form, birthDate: iso })}
                />
                {(() => {
                  const parsed = parseBirthDate(form.birthDate);
                  if (!parsed) return null;
                  const age = calculateAgeYears(parsed);
                  return (
                    <p className="text-[11px] mt-1.5 leading-5 text-gray-500">
                      {lang === "fa" ? (
                        <>سن ثبت‌شده: <b>{age.toLocaleString("fa-IR")} سال</b>. محدودیت سنی خودکار برای پرداخت اعمال نمی‌شود؛ مسئولیت صحت اعلام سن با کاربر است.</>
                      ) : (
                        <>Registered age: <b>{age}</b>. No automatic age block is applied; the user is responsible for the age declaration.</>
                      )}
                    </p>
                  );
                })()}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {lang === "fa" ? "کد ملی" : "National ID (کد ملی)"} *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  dir="ltr"
                  maxLength={10}
                  className="gaming-input text-left"
                  placeholder="0012345678"
                  value={form.nationalId}
                  onChange={(e) =>
                    setForm({ ...form, nationalId: e.target.value.replace(/\D/g, "").slice(0, 10) })
                  }
                />
                <p className="text-[11px] text-gray-500 mt-1.5 leading-5">
                  {lang === "fa"
                    ? "برای احراز هویت مالی الزامی است. با شخص دیگری قابل اشتراک‌گذاری نیست."
                    : "Required for financial identity verification. Cannot be shared with anyone else."}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t.auth.password} *
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                className="gaming-input"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <PasswordStrengthMeter password={form.password} lang={lang} />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t.auth.confirmPassword} *
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                className="gaming-input"
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              />
              {form.confirmPassword && form.confirmPassword !== form.password && (
                <p className="text-[11px] text-red-400 mt-1.5">
                  {lang === "fa" ? "رمز عبور و تکرار آن یکسان نیستند" : "Passwords do not match"}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-7 text-amber-100">
              <h2 className="mb-2 font-black text-amber-300">توضیحات، اخطارها و محدودیت‌های مهم</h2>
              <ul className="list-disc space-y-1 pr-5">
                <li>مسابقات Flexa مهارتی هستند و نتیجه بر اساس عملکرد، قوانین روم و تصمیم داوری تعیین می‌شود.</li>
                <li>پرداخت ورودی، شارژ کیف پول و دریافت جایزه باید مطابق قوانین، توضیحات هر روم و وضعیت کیف پول انجام شود.</li>
                <li>در صورت تقلب، تیم‌آپ، ورود با اکانت غیرمجاز، نداشتن مدرک یا نقض قوانین، امکان جریمه، بن یا ابطال نتیجه وجود دارد.</li>
                <li>مسئولیت صحت اطلاعات هویتی، UID بازی، شماره تماس، ایمیل و دسترسی به حساب با کاربر است.</li>
                <li>با تأیید این بخش اعلام می‌کنید که حداقل {MIN_ADULT_AGE} سال دارید یا مسئولیت قانونی استفاده از سرویس را می‌پذیرید.</li>
              </ul>
              <label className="mt-4 flex cursor-pointer select-none items-start gap-3 rounded-xl border border-amber-400/30 bg-black/20 p-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 accent-amber-500"
                  checked={form.riskAndAgeAccepted}
                  onChange={(e) => setForm({ ...form, riskAndAgeAccepted: e.target.checked })}
                />
                <span>همه اخطارها و محدودیت‌ها را خوانده‌ام و تأیید می‌کنم که بالای {MIN_ADULT_AGE} سال هستم / مسئولیت اعلام سن و استفاده از سرویس را می‌پذیرم.</span>
              </label>
            </div>

            <label className="flex items-start gap-3 bg-dark-800/70 border border-gaming-border rounded-2xl p-4 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-purple-600"
                checked={form.termsAccepted}
                onChange={(e) => setForm({ ...form, termsAccepted: e.target.checked })}
              />
              <span className="text-xs text-gray-300 leading-7">
                با ثبت‌نام تأیید می‌کنم که
                <Link href="/rules" target="_blank" className="text-neon-blue font-black mx-1 hover:underline">
                  قوانین، مقررات و شرایط استفاده Flexa
                </Link>
                را کامل مطالعه کرده‌ام و همه بندهای آن، از جمله ماهیت مهارتی مسابقات، هزینه خدمات، شرایط جوایز، داوری، امنیت و پیگیری‌های قانونی را می‌پذیرم.
              </span>
            </label>

            <button
              type="submit"
              disabled={
                loading ||
                !form.termsAccepted ||
                !form.riskAndAgeAccepted ||
                !isPasswordStrong(form.password) ||
                form.password !== form.confirmPassword
              }
              className="gaming-btn w-full py-3 text-base disabled:opacity-50 mt-6"
            >
              {loading ? t.auth.registering : t.auth.registerButton}
            </button>
          </form>

          {/* Login Link */}
          <div className="text-center mt-6 text-sm text-gray-400">
            {t.auth.haveAccount}{" "}
            <Link href="/login" className="text-neon-blue hover:underline">
              {t.auth.login}
            </Link>
          </div>
        </div>
        </TiltCard>
      </div>
      </div>
    </div>
  );
}
