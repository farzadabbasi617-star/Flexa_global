"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { AVATAR_OPTIONS } from "@/lib/avatars";
import { useAuth } from "@/contexts/AuthContext";
import JalaliDatePicker from "@/components/JalaliDatePicker";

interface TelegramLinkAccount {
  telegramId: string;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  linkedAt: string;
}

interface IdentityState {
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  nationalIdMasked: string | null;
  phoneNumber: string;
  email: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  complete: boolean;
  locked: { firstName: boolean; lastName: boolean; birthDate: boolean; nationalId: boolean };
}


export default function UserProfileSettingsPage() {
  const { user, loading, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("/icons/profile_icon.png");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [identity, setIdentity] = useState<IdentityState | null>(null);
  const [identityForm, setIdentityForm] = useState({ firstName: "", lastName: "", birthDate: "", nationalId: "" });
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityMessage, setIdentityMessage] = useState("");
  const [identityError, setIdentityError] = useState("");

  const [telegramAccount, setTelegramAccount] = useState<TelegramLinkAccount | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramMessage, setTelegramMessage] = useState("");
  const [telegramError, setTelegramError] = useState("");

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName || "");
    setSelectedAvatar(user.avatarUrl || "/icons/profile_icon.png");
  }, [user]);

  const loadIdentity = useCallback(async () => {
    if (!user) return;
    setIdentityLoading(true);
    try {
      const res = await fetch("/api/profile/identity", { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "اطلاعات هویتی دریافت نشد");
      const next = json.identity as IdentityState;
      setIdentity(next);
      setIdentityForm({
        firstName: next.firstName || user.firstName || "",
        lastName: next.lastName || user.lastName || "",
        birthDate: next.birthDate || user.birthDate || "",
        nationalId: "",
      });
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : "اطلاعات هویتی دریافت نشد");
    } finally {
      setIdentityLoading(false);
    }
  }, [user]);

  const loadTelegramLink = useCallback(async () => {
    if (!user) return;
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/link", { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (res.ok) setTelegramAccount(json.account || null);
    } catch {
      setTelegramAccount(null);
    } finally {
      setTelegramLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadTelegramLink();
    loadIdentity();
  }, [loadTelegramLink, loadIdentity]);

  async function saveProfile(nextAvatar?: string) {
    if (!user) return;
    setSaving(true);
    setMessage("");
    setError("");
    const avatarUrl = nextAvatar || selectedAvatar;
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ displayName: displayName.trim(), avatarUrl }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "ذخیره پروفایل انجام نشد.");
      setSelectedAvatar(avatarUrl);
      setMessage("پروفایل با موفقیت ذخیره شد.");
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیره پروفایل انجام نشد.");
    } finally {
      setSaving(false);
    }
  }

  async function chooseAvatar(url: string) {
    setSelectedAvatar(url);
    await saveProfile(url);
  }

  async function saveIdentity() {
    setIdentityLoading(true);
    setIdentityMessage("");
    setIdentityError("");
    try {
      const res = await fetch("/api/profile/identity", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({
          ...(!identity?.locked.firstName ? { firstName: identityForm.firstName } : {}),
          ...(!identity?.locked.lastName ? { lastName: identityForm.lastName } : {}),
          ...(!identity?.locked.birthDate ? { birthDate: identityForm.birthDate } : {}),
          ...(!identity?.locked.nationalId ? { nationalId: identityForm.nationalId } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "ثبت اطلاعات هویتی انجام نشد");
      setIdentity(json.identity);
      setIdentityForm((current) => ({ ...current, nationalId: "" }));
      setIdentityMessage("اطلاعات هویتی با موفقیت ثبت و قفل شد.");
      await refreshUser();
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : "ثبت اطلاعات هویتی انجام نشد");
    } finally {
      setIdentityLoading(false);
    }
  }

  async function submitTelegramCode() {
    setTelegramMessage("");
    setTelegramError("");
    const code = telegramCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setTelegramError("کد اتصال باید ۶ رقم باشد.");
      return;
    }
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "اتصال تلگرام انجام نشد.");
      setTelegramMessage("حساب تلگرام با موفقیت لینک شد.");
      setTelegramCode("");
      await loadTelegramLink();
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : "اتصال تلگرام انجام نشد.");
    } finally {
      setTelegramLoading(false);
    }
  }

  async function unlinkTelegram() {
    if (!confirm("اتصال تلگرام حذف شود؟")) return;
    setTelegramMessage("");
    setTelegramError("");
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/link", {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "حذف اتصال انجام نشد.");
      setTelegramAccount(null);
      setTelegramMessage("اتصال تلگرام حذف شد.");
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : "حذف اتصال انجام نشد.");
    } finally {
      setTelegramLoading(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center"><div className="text-4xl animate-neon-pulse">👤</div></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center px-5">
        <div className="glass-panel rounded-3xl p-8 text-center max-w-sm w-full">
          <div className="text-5xl mb-4">👤</div>
          <h1 className="font-black text-xl mb-4">برای ویرایش پروفایل وارد شو</h1>
          <Link href="/login" className="gaming-btn block">ورود</Link>
        </div>
      </div>
    );
  }

  const gameIds = [
    { label: "کلش رویال", icon: "/icons/icon-clash_royale.png", id: user.clashRoyaleId, username: user.clashRoyaleUsername },
    { label: "کالاف موبایل", icon: "/icons/icon-cod_mobile.png", id: user.codMobileId, username: user.codMobileUsername },
    { label: "فورتنایت", icon: "/icons/icon-fortnite.png", id: user.fortniteId, username: user.fortniteUsername },
  ];

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,_rgba(92,0,160,.68)_0%,_rgba(32,0,56,.42)_34%,_transparent_72%)]" />
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-purple-700/20 blur-[80px]" />
      </div>

      <main className="relative z-10 max-w-[620px] mx-auto px-4 sm:px-5 py-6 sm:py-8" style={{ paddingBottom: "var(--bottom-nav-space)" }} dir="rtl">
        <Link href="/profile" className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-white mb-5">← بازگشت به تنظیمات</Link>

        <header className="text-right mb-6">
          <div className="inline-flex items-center gap-2 text-[10px] font-black text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1 mb-3">
            <img src="/icons/profile_icon.png" alt="پروفایل" className="w-5 h-5 object-contain" loading="lazy" decoding="async" />
            پروفایل کاربری
          </div>
          <h1 className="text-3xl font-black">پروفایل</h1>
          <p className="text-xs text-gray-500 mt-1 leading-6">نام بازیکن عمومی، اطلاعات هویتی خصوصی، آواتار، آیدی بازی‌ها و اتصال تلگرام</p>
        </header>

        <section className="glass-panel rounded-[32px] sm:rounded-[38px] p-4 sm:p-6 border border-white/5 mb-6">
          <div className="flex items-center gap-4 mb-5">
            <div className="p-0.5 rounded-full bg-gradient-to-tr from-[#bc00ff] to-[#00d2ff] shadow-[0_0_20px_rgba(188,0,255,0.35)]">
              <img src={selectedAvatar} alt="Avatar" className="w-20 h-20 rounded-full border-4 border-[#09071f] object-cover bg-black/40" onError={(e) => ((e.target as HTMLImageElement).src = "/icons/profile_icon.png")} />
            </div>
            <div className="text-right">
              <div className="font-black text-xl">{user.displayName}</div>
              <div className="text-xs text-gray-500 mt-1 num-en">@{user.username || "user"}</div>
              <div className="text-[10px] text-purple-300 mt-2 num-en">{user.flexaId}</div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-black text-purple-200 mb-1.5">🎮 نام داخل Flexa و مسابقات (عمومی)</label>
              <div className="flex gap-2">
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} dir="auto" className="flex-1 bg-black/25 border border-purple-500/25 rounded-2xl px-4 py-3 text-sm outline-none focus:border-purple-400" placeholder="مثلاً Farzadov" minLength={2} maxLength={100} />
                <button onClick={() => saveProfile()} disabled={saving || displayName.trim().length < 2} className="px-4 rounded-2xl bg-purple-600 disabled:opacity-50 text-xs font-black">ذخیره</button>
              </div>
              <p className="text-[9px] text-gray-500 mt-2 leading-5">این نام در پروفایل، جدول‌ها و Matchها دیده می‌شود؛ نام و نام خانوادگی واقعی بخش هویتی پایین خصوصی و مستقل است.</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="block text-[10px] font-black text-purple-300 tracking-wider">🌟 انتخاب آواتار انحصاری Flexa</label>
                <span className="text-[9px] text-gray-500">جهت اعمال کلیک کنید</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                {AVATAR_OPTIONS.map((avatar) => {
                  const active = selectedAvatar === avatar.url;
                  return (
                    <button
                      key={avatar.url}
                      type="button"
                      onClick={() => chooseAvatar(avatar.url)}
                      disabled={saving}
                      // title is a hover tooltip and never appears on touch, so
                      // the name is also rendered below the image.
                      title={avatar.label}
                      aria-pressed={active}
                      aria-label={avatar.label}
                      className={`rounded-2xl p-1 border transition-all flex flex-col items-center gap-1 relative ${active ? "border-yellow-500 bg-yellow-500/10 shadow-[0_0_16px_rgba(234,179,8,.2)]" : "border-white/10 bg-black/20 hover:border-purple-400/50"}`}
                    >
                      <img src={avatar.url} alt="" className="w-full aspect-square rounded-xl object-cover" loading="lazy" decoding="async" />
                      <span className="w-full truncate text-center text-[8px] leading-3 text-gray-400 px-0.5 pb-0.5">{avatar.label}</span>
                      {active && <span className="absolute -top-1 -right-1 text-[10px] bg-yellow-500 text-black rounded-full w-5 h-5 grid place-items-center font-black">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {message && <div className="text-green-300 text-xs mt-2">{message}</div>}
            {error && <div className="text-red-300 text-xs mt-2">{error}</div>}
          </div>
        </section>

        <section className="glass-panel rounded-[34px] p-5 border border-emerald-500/20 bg-emerald-950/5 mb-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-black">🪪 اطلاعات شخصی و هویتی</h2>
              <p className="text-[10px] text-gray-500 mt-1 leading-5">فقط برای احراز هویت، برداشت، کیف پول و مسابقات پولی است؛ نام عمومی بازیکن را تغییر نمی‌دهد.</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black ${identity?.complete ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
              {identityLoading ? "در حال بررسی" : identity?.complete ? "✅ تکمیل‌شده" : "نیاز به تکمیل"}
            </span>
          </div>

          {identity && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 mb-1.5">نام واقعی</label>
                  <input value={identityForm.firstName} onChange={(e) => setIdentityForm({ ...identityForm, firstName: e.target.value })} disabled={identity.locked.firstName} className="w-full bg-black/25 border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-emerald-400 disabled:opacity-60" placeholder="نام مطابق مدرک هویتی" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 mb-1.5">نام خانوادگی واقعی</label>
                  <input value={identityForm.lastName} onChange={(e) => setIdentityForm({ ...identityForm, lastName: e.target.value })} disabled={identity.locked.lastName} className="w-full bg-black/25 border border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-emerald-400 disabled:opacity-60" placeholder="نام خانوادگی مطابق مدرک" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 mb-1.5">تاریخ تولد شمسی</label>
                <JalaliDatePicker value={identityForm.birthDate} onChange={(birthDate) => setIdentityForm({ ...identityForm, birthDate })} disabled={identity.locked.birthDate} />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-500 mb-1.5">کد ملی</label>
                {identity.locked.nationalId ? (
                  <div className="w-full bg-black/25 border border-emerald-500/20 rounded-2xl px-4 py-3 text-sm text-emerald-200 font-mono" dir="ltr">{identity.nationalIdMasked}</div>
                ) : (
                  <input value={identityForm.nationalId} onChange={(e) => setIdentityForm({ ...identityForm, nationalId: e.target.value.replace(/\D/g, "").slice(0, 10) })} inputMode="numeric" maxLength={10} dir="ltr" className="w-full bg-black/25 border border-white/10 rounded-2xl px-4 py-3 text-sm text-left outline-none focus:border-emerald-400" placeholder="0012345678" />
                )}
                <p className="text-[9px] text-gray-600 mt-1.5 leading-5">اطلاعات هویتی پس از ثبت قفل می‌شوند؛ برای اصلاح باید با پشتیبانی تماس بگیری.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-2xl bg-black/20 border border-white/5 p-3"><span className="text-gray-500">شماره موبایل</span><div className="mt-1 font-bold" dir="ltr">{identity.phoneNumber}</div></div>
                <div className="rounded-2xl bg-black/20 border border-white/5 p-3"><span className="text-gray-500">ایمیل {identity.emailVerified ? "✅" : "⚠️"}</span><div className="mt-1 font-bold truncate" dir="ltr">{identity.email || "ثبت نشده"}</div></div>
              </div>

              {!identity.complete && (
                <button onClick={saveIdentity} disabled={identityLoading || (!identity.locked.firstName && identityForm.firstName.trim().length < 2) || (!identity.locked.lastName && identityForm.lastName.trim().length < 2) || (!identity.locked.birthDate && !identityForm.birthDate) || (!identity.locked.nationalId && identityForm.nationalId.length !== 10)} className="w-full rounded-2xl bg-emerald-600 py-3.5 text-xs font-black disabled:opacity-40">
                  {identityLoading ? "در حال ثبت..." : "ثبت و قفل اطلاعات هویتی"}
                </button>
              )}
              {identityMessage && <div className="text-emerald-300 text-xs">{identityMessage}</div>}
              {identityError && <div className="text-red-300 text-xs">{identityError}</div>}
            </div>
          )}
        </section>

        <section className="glass-panel rounded-[34px] p-5 border border-white/10 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-black">🎮 آیدی و اکانت بازی‌ها</h2>
              <p className="text-[10px] text-gray-500 mt-0.5">شناسه‌ها و گیم‌تگ‌های متصل شده شما</p>
            </div>
            <Link href="/profile/edit" className="text-[10px] bg-purple-500/10 text-purple-200 px-3 py-1.5 rounded-xl border border-purple-500/20">ویرایش شناسه‌ها</Link>
          </div>
          <div className="space-y-2.5">
            {gameIds.map((game) => (
              <div key={game.label} className="flex items-center gap-3 bg-black/20 border border-white/5 rounded-2xl p-3">
                <img src={game.icon} alt={game.label} className="w-9 h-9 rounded-xl object-contain bg-white/5 shrink-0" loading="lazy" decoding="async" />
                <div className="flex-1 text-right min-w-0">
                  <div className="text-xs font-black">{game.label}</div>
                  <div className="text-[10px] text-gray-400 mt-1 truncate" dir="ltr">{game.id || game.username ? `${game.username || "بدون نام"} ${game.id ? `• ${game.id}` : ""}` : "ثبت نشده"}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="telegram" className="glass-panel p-5 rounded-[34px] border border-cyan-500/20 bg-gradient-to-br from-cyan-900/10 to-purple-900/10 mb-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="text-right">
              <h2 className="text-sm font-black">🔗 اتصال بات تلگرام</h2>
              <p className="text-[10px] text-gray-500 mt-1 leading-4">در تلگرام آیدی <span dir="ltr" className="text-cyan-300 font-bold">@FlexaTournamentBot</span> را استارت کرده، دستور <code className="text-cyan-300">/link</code> را بزنید و کد دریافت شده را اینجا وارد کنید.</p>
            </div>
            <Link href="https://t.me/FlexaTournamentBot" className="text-[10px] bg-cyan-500/15 text-cyan-200 px-3 py-1.5 rounded-xl border border-cyan-500/20 whitespace-nowrap">ربات تلگرام</Link>
          </div>

          {telegramAccount ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-4">
              <div className="text-xs font-black text-green-300 mb-1">✅ تلگرام با موفقیت لینک شد</div>
              <div className="text-[11px] text-gray-300 num-en" dir="ltr">{telegramAccount.telegramUsername ? `@${telegramAccount.telegramUsername}` : `ID: ${telegramAccount.telegramId}`}</div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 mb-4" dir="ltr">
              <input value={telegramCode} onChange={(e) => setTelegramCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="flex-1 bg-black/25 border border-white/10 rounded-2xl px-4 py-3 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-cyan-400 num-en" placeholder="123456" inputMode="numeric" maxLength={6} />
              <button onClick={submitTelegramCode} disabled={telegramLoading || telegramCode.replace(/\D/g, "").length !== 6} className="bg-gradient-to-r from-cyan-600 to-blue-600 disabled:opacity-40 px-5 rounded-2xl text-xs font-black shrink-0">اتصال</button>
            </div>
          )}

          {telegramMessage && <div className="text-green-300 text-xs mb-3">{telegramMessage}</div>}
          {telegramError && <div className="text-red-300 text-xs mb-3">{telegramError}</div>}
          {telegramAccount && <button onClick={unlinkTelegram} disabled={telegramLoading} className="text-[10px] text-red-300 bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/20">حذف اتصال تلگرام</button>}
        </section>
      </main>

      <BottomNav />
      <style jsx global>{`
        .glass-panel { background: rgba(18, 18, 22, 0.7); backdrop-filter: blur(20px); }
        .num-en { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      `}</style>
    </div>
  );
}
