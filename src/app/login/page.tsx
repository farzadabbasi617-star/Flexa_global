"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import AnimatedFlexaLogo from "@/components/AnimatedFlexaLogo";
import TiltCard from "@/components/fx/TiltCard";
import ParticleField from "@/components/fx/ParticleField";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import OtpCodeInput from "@/components/OtpCodeInput";
import { EMAIL_OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/email-policy";

export default function LoginPage() {
  const { t, lang } = useLanguage();
  const { login, verifyEmailOtp, resendEmailOtp } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Shown instead of the form when login is blocked pending email OTP
  // confirmation (e.g. the user abandoned registration before verifying).
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(form.identifier.trim(), form.password, rememberMe);

    if (result.success) {
      router.push("/");
    } else if (result.pendingVerification && result.email) {
      setPendingEmail(result.email);
    } else {
      setError(result.error || (lang === "fa" ? "ورود ناموفق بود" : "Login failed"));
    }
    setLoading(false);
  }

  /** Fires automatically once the sixth digit lands; no submit button. */
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
          <div className="max-w-lg mx-auto px-4 py-8 sm:py-16" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
            <TiltCard maxTilt={4} liftZ={10} glare={false} className="rounded-2xl">
              <div className="gaming-card p-5 sm:p-8">
                <div className="text-center mb-6 sm:mb-8">
                  <AnimatedFlexaLogo size="lg" showLabel className="mb-6" />
                  <div className="text-4xl mb-3">📧</div>
                  <h1 className="text-2xl font-bold neon-text-purple">
                    {lang === "fa" ? "تایید ایمیل لازم است" : "Email verification required"}
                  </h1>
                  <p className="text-gray-400 mt-2 text-sm leading-7">
                    {lang === "fa"
                      ? <>حساب شما هنوز تایید نشده. کد ۶ رقمی به آدرس <span dir="ltr" className="text-white font-bold">{pendingEmail}</span> ارسال شد.</>
                      : <>Your account isn&apos;t verified yet. A 6-digit code was sent to <span dir="ltr" className="text-white font-bold">{pendingEmail}</span>.</>}
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
                  verifiedTitle={lang === "fa" ? "تأیید شد" : "Verified"}
                  verifiedSubtitle={lang === "fa" ? "در حال ورود..." : "Signing you in..."}
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
                    {lang === "fa" ? "بازگشت به ورود" : "Back to login"}
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

      <div className="max-w-lg mx-auto px-4 py-8 sm:py-16" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
        <TiltCard maxTilt={4} liftZ={10} glare={false} className="rounded-2xl">
        <div className="gaming-card p-5 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <AnimatedFlexaLogo size="lg" showLabel className="mb-6" />
            <h1 className="text-2xl font-bold neon-text-purple">{t.auth.loginTitle}</h1>
            <p className="text-gray-400 mt-1">{t.auth.loginSubtitle}</p>
          </div>

          <div className="bg-neon-blue/10 border border-neon-blue/30 text-neon-blue px-4 py-3 rounded-xl mb-6 text-xs leading-6">
            {lang === "fa"
              ? "ورود با شماره موبایل، ایمیل یا نام کاربری و رمز عبور انجام می‌شود. تایید حساب از طریق کد ارسالی به ایمیل است."
              : "Login works with mobile, email or username and password. Account verification is done via an emailed code."}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {lang === "fa" ? "شماره موبایل، ایمیل یا نام کاربری" : "Mobile, email or username"}
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                className="gaming-input"
                placeholder={lang === "fa" ? "مثلاً 09123456789 یا ShadowGamer" : "09123456789 or ShadowGamer"}
                value={form.identifier}
                onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="block text-sm text-gray-400">
                  {t.auth.password}
                </label>
                <Link href="/forgot-password" className="text-xs text-neon-blue hover:underline">
                  {lang === "fa" ? "رمز را فراموش کرده‌اید؟" : "Forgot password?"}
                </Link>
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="gaming-input"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
              <input
                type="checkbox"
                className="h-4 w-4 accent-purple-600"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className="text-sm text-gray-300">
                {lang === "fa" ? "مرا به خاطر بسپار" : "Remember me"}
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="gaming-btn w-full py-3 text-base disabled:opacity-50"
            >
              {loading ? t.auth.loggingIn : t.auth.loginButton}
            </button>
          </form>

          {/* Register Link */}
          <div className="text-center mt-6 text-sm text-gray-400">
            {t.auth.noAccount}{" "}
            <Link href="/register" className="text-neon-blue hover:underline">
              {t.auth.register}
            </Link>
          </div>
        </div>
        </TiltCard>
      </div>
      </div>
    </div>
  );
}
