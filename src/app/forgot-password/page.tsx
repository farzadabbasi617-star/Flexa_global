"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { useLanguage } from "@/contexts/LanguageContext";
import OtpCodeInput from "@/components/OtpCodeInput";
import { EMAIL_OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/email-policy";

export default function ForgotPasswordPage() {
  const { lang } = useLanguage();
  const [step, setStep] = useState<"email" | "reset" | "success">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  function startResendCooldown() {
    setResendCooldown(EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
  }

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ارسال کد انجام نشد");
      setMessage(lang === "fa"
        ? `${data.message || "اگر حسابی وجود داشته باشد، کد ارسال می‌شود."} اگر پیام را در Inbox ندیدی، پوشه Spam / Junk را بررسی کن.`
        : `${data.message || "If an account exists, a code will be sent."} If it is not in your inbox, check Spam / Junk.`);
      setStep("reset");
      startResendCooldown();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ارسال کد انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (resendCooldown > 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ارسال مجدد انجام نشد");
      setMessage(lang === "fa" ? "درخواست ارسال مجدد ثبت شد. پوشه Spam را هم بررسی کن." : "A new request was sent. Check your spam folder too.");
      startResendCooldown();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ارسال مجدد انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError(lang === "fa" ? "تکرار رمز عبور مطابقت ندارد" : "Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تغییر رمز انجام نشد");
      setMessage(data.message || "رمز عبور تغییر کرد.");
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تغییر رمز انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Navbar />
      <main className="max-w-md mx-auto px-4 py-10 sm:py-16">
        <div className="gaming-card p-6 sm:p-8">
          <div className="text-center mb-7">
            <div className="text-5xl mb-3">🔐</div>
            <h1 className="text-2xl font-black neon-text-purple">
              {lang === "fa" ? "بازیابی رمز عبور" : "Reset password"}
            </h1>
            <p className="text-sm text-gray-400 mt-2 leading-7">
              {step === "email"
                ? (lang === "fa" ? "ایمیل حساب را وارد کن تا کد یک‌بارمصرف دریافت کنی؛ پوشه Spam / Junk را هم بررسی کن." : "Enter your account email to receive a one-time code; check Spam / Junk too.")
                : step === "reset"
                  ? (lang === "fa" ? "کد ایمیل و رمز جدید را وارد کن. اگر کد را ندیدی، پوشه Spam / Junk را بررسی کن." : "Enter the emailed code and your new password. Check Spam / Junk if the code is missing.")
                  : (lang === "fa" ? "بازیابی حساب کامل شد." : "Account recovery is complete.")}
            </p>
          </div>

          {error && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
          {message && step !== "success" && <div className="mb-5 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs leading-6 text-blue-200">{message}</div>}

          {step === "email" && (
            <form onSubmit={requestCode} className="space-y-5">
              <div>
                <label className="block text-sm text-gray-400 mb-2">{lang === "fa" ? "ایمیل حساب" : "Account email"}</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  dir="ltr"
                  className="gaming-input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value.trim())}
                  placeholder="name@example.com"
                />
              </div>
              <button disabled={busy} className="gaming-btn w-full py-3 disabled:opacity-50">
                {busy ? "..." : (lang === "fa" ? "ارسال کد بازیابی" : "Send recovery code")}
              </button>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={resetPassword} className="space-y-5">
              <div>
                <label className="block text-sm text-gray-400 mb-3">{lang === "fa" ? "کد ۶ رقمی" : "6-digit code"}</label>
                {/* No auto-submit here: the form also needs a new password, so
                    completing the code is not the end of the interaction. */}
                <OtpCodeInput value={code} onChange={setCode} length={6} disabled={busy} autoFocus={false} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">{lang === "fa" ? "رمز عبور جدید" : "New password"}</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  className="gaming-input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <PasswordStrengthMeter password={password} lang={lang} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">{lang === "fa" ? "تکرار رمز جدید" : "Confirm new password"}</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  className="gaming-input"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              <button disabled={busy || code.length !== 6} className="gaming-btn w-full py-3 disabled:opacity-50">
                {busy ? "..." : (lang === "fa" ? "تغییر رمز عبور" : "Change password")}
              </button>
              <div className="flex items-center justify-center gap-4 text-xs">
                <button
                  type="button"
                  onClick={resendCode}
                  disabled={resendCooldown > 0 || busy}
                  className="text-neon-blue hover:underline disabled:text-gray-600 disabled:no-underline"
                >
                  {resendCooldown > 0
                    ? (lang === "fa" ? `ارسال مجدد (${resendCooldown})` : `Resend (${resendCooldown})`)
                    : (lang === "fa" ? "ارسال مجدد کد" : "Resend code")}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep("email"); setCode(""); setError(""); setMessage(""); }}
                  className="text-gray-400 hover:text-white hover:underline"
                >
                  {lang === "fa" ? "تغییر ایمیل" : "Change email"}
                </button>
              </div>
            </form>
          )}

          {step === "success" && (
            <div className="text-center space-y-5">
              <div className="text-5xl">✅</div>
              <p className="text-emerald-300 leading-7">{message}</p>
              <Link href="/login" className="gaming-btn block w-full py-3">
                {lang === "fa" ? "ورود با رمز جدید" : "Login with new password"}
              </Link>
            </div>
          )}

          {step !== "success" && (
            <div className="text-center mt-7 text-sm text-gray-500">
              <Link href="/login" className="text-neon-blue hover:underline">
                {lang === "fa" ? "بازگشت به صفحه ورود" : "Back to login"}
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
