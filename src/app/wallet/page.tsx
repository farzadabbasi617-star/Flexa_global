"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";

interface WalletData {
  wallet: {
    balanceToman: number;
    balanceRial: string;
    usableToman: number;
    usableRial: string;
    withdrawableToman: number;
    withdrawableRial: string;
    nonWithdrawableToman: number;
    nonWithdrawableRial: string;
    currency: string;
  };
  onlinePayment?: { available: boolean; provider: string };
  transactions: Array<{
    id: string;
    amountToman: number;
    type: string;
    status: string;
    referenceId: string | null;
    metadata: unknown;
    createdAt: string;
  }>;
}

const WALLET_TERMS_ONLINE =
  "شارژ کیف پول Flexa فقط از طریق درگاه پرداخت اینترنتی زرین‌پال انجام می‌شود و بلافاصله پس از تأیید بانک به موجودی شما اضافه می‌گردد. پیش از پرداخت حتماً فیلترشکن (VPN) خود را خاموش کنید؛ درگاه‌های بانکی ایران با آی‌پی خارج از کشور کار نمی‌کنند و پرداخت ناموفق می‌شود. توصیه می‌شود پرداخت را از داخل سایت انجام دهید، نه از مرورگر داخل تلگرام یا اینستاگرام. مبالغ شارژ شده صرفاً برای خدمات داخل پلتفرم مثل ثبت‌نام تورنومنت قابل استفاده است و به‌صورت مستقیم قابل برداشت نیست. مبالغ قابل برداشت شامل جوایز، پاداش‌های رسمی و مبالغی است که طبق قوانین Flexa قابل تسویه اعلام شده‌اند. درخواست‌های برداشت پس از ثبت اطلاعات بانکی معتبر و بررسی توسط تیم پشتیبانی، طی ۲۴ تا ۷۲ ساعت کاری پرداخت می‌شوند.";

const TYPE_LABELS: Record<string, string> = {
  deposit: "شارژ کیف پول",
  withdrawal: "برداشت",
  tournament_win: "جایزه تورنومنت",
  entry_fee: "ورودی تورنومنت",
  refund: "برگشت وجه",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "در حال بررسی",
  completed: "تکمیل‌شده",
  failed: "ناموفق",
  cancelled: "لغوشده",
};

const QUICK_DEPOSIT_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000];
const DEPOSIT_CARD_OWNER = "فرزاد عباسی";
const DEPOSIT_BANK_NAME = "بانک سپه";

function formatTomanInput(value: string) {
  const digits = value.replace(/[^\d۰-۹٠-٩]/g, "");
  if (!digits) return "";
  const englishDigits = digits
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return Number(englishDigits).toLocaleString("en-US");
}

function txSign(type: string) {
  return type === "entry_fee" || type === "withdrawal" ? "-" : "+";
}

function txColor(type: string) {
  return type === "entry_fee" || type === "withdrawal" ? "text-red-400" : "text-emerald-400";
}

function transactionIcon(type: string) {
  if (type === "withdrawal" || type === "entry_fee") return "↗";
  if (type === "tournament_win") return "🏆";
  return "↙";
}

export default function WalletPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<WalletData | null>(null);
  const [busy, setBusy] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [walletDialog, setWalletDialog] = useState<"deposit" | "withdrawal" | "">("");
  const [depositTermsOpen, setDepositTermsOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [accountOwner, setAccountOwner] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [iban, setIban] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [submitting, setSubmitting] = useState<"deposit" | "withdrawal" | "online" | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setAcceptedTerms(localStorage.getItem("flexa_wallet_terms_accepted") === "true");
  }, []);

  function toggleTerms(value: boolean) {
    setAcceptedTerms(value);
    localStorage.setItem("flexa_wallet_terms_accepted", value ? "true" : "false");
  }

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/wallet/transactions", { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "کیف پول بارگذاری نشد");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "کیف پول بارگذاری نشد");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
    else setBusy(false);
  }, [user, load]);

  const pendingDeposits = useMemo(() => data?.transactions.filter((tx) => tx.type === "deposit" && tx.status === "pending") || [], [data]);
  const pendingWithdrawals = useMemo(() => data?.transactions.filter((tx) => tx.type === "withdrawal" && tx.status === "pending") || [], [data]);
  const canContinueDeposit = acceptedTerms && Boolean(depositAmount);
  const onlinePaymentAvailable = data?.onlinePayment?.available === true;

  // Deposits are age-gated on national id + birth date. Accounts created
  // before registration collected those fields fail that check server-side,
  // which previously surfaced only as an error *after* the user entered an
  // amount and pressed pay, with no way to act on it. Detect it up front and
  // send them straight to the form instead.
  const identityComplete = Boolean(
    user?.nationalId && String(user.nationalId).trim() && user?.birthDate && String(user.birthDate).trim()
  );

  // Hands off to ZarinPal. The pending transaction and the credited amount are
  // both decided server-side; this only forwards the user to the bank page.
  async function startOnlineDeposit() {
    setError("");
    setMessage("");
    setSubmitting("online");
    try {
      const res = await fetch("/api/wallet/deposit/cryptopayment", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ amountToman: depositAmount, acceptTerms: true }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.paymentUrl) {
        setError(payload?.error || "شروع پرداخت اینترنتی با خطا مواجه شد.");
        setSubmitting("");
        return;
      }
      window.location.href = payload.paymentUrl;
    } catch {
      setError("ارتباط با درگاه پرداخت برقرار نشد.");
      setSubmitting("");
    }
  }

  function openDeposit() {
    setError("");
    setMessage("");
    setDepositTermsOpen(false);
    setWalletDialog("deposit");
  }

  function openWithdrawal() {
    setError("");
    setMessage("");
    setWalletDialog("withdrawal");
  }

  function closeWalletDialog() {
    if (submitting) return;
    setWalletDialog("");
    setDepositTermsOpen(false);
  }

  async function requestWithdrawal(e: FormEvent) {
    e.preventDefault();
    setSubmitting("withdrawal");
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/wallet/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({
          action: "withdrawal",
          amountToman: withdrawAmount,
          accountOwner,
          nationalId,
          iban,
          note: withdrawNote,
          acceptTerms: acceptedTerms,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "درخواست برداشت ثبت نشد");
      setMessage(json.message || "درخواست برداشت ثبت شد");
      setWithdrawAmount("");
      setAccountOwner("");
      setNationalId("");
      setIban("");
      setWithdrawNote("");
      setWalletDialog("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "درخواست برداشت ثبت نشد");
    } finally {
      setSubmitting("");
    }
  }

  if (loading || busy) {
    return <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center"><div className="text-4xl animate-neon-pulse">💳</div></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-dark-900 text-white">
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <div className="gaming-card p-8">
            <div className="text-6xl mb-4">💳</div>
            <h1 className="text-2xl font-black mb-3">برای مشاهده کیف پول وارد شو</h1>
            <Link href="/login" className="gaming-btn w-full">ورود</Link>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_22%_8%,rgba(255,214,10,.22),transparent_35%),radial-gradient(circle_at_80%_12%,rgba(139,92,246,.35),transparent_38%),linear-gradient(140deg,#050508,#0b0b10_45%,#050508)]" />
      <div className="fixed inset-0 pointer-events-none opacity-25 bg-[linear-gradient(125deg,transparent_0_20%,rgba(255,255,255,.08)_20%_21%,transparent_21%_42%,rgba(255,255,255,.05)_42%_43%,transparent_43%)]" />
      <Navbar />

      <main className="relative z-10 max-w-[760px] mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "var(--bottom-nav-space)" }} dir="rtl">
        <div className="flex items-center justify-between gap-4 mb-7">
          <div>
            <p className="text-xs font-black text-cyan-300 mb-2 tracking-[0.24em]">GAMENT WALLET</p>
            <h1 className="text-3xl font-black neon-text-purple">کیف پول</h1>
          </div>
          <button onClick={load} className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-300/20 text-lg font-bold hover:bg-purple-500/20">🔄</button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-2xl p-3 mb-5 text-sm leading-7">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 rounded-2xl p-3 mb-5 text-sm leading-7">{message}</div>}

        <section className="relative mb-7">
          <div className="absolute -inset-4 rounded-[2.5rem] bg-[radial-gradient(circle_at_22%_10%,rgba(34,211,238,.22),transparent_36%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,.24),transparent_38%)] blur-xl" />
          <div className="relative min-h-[235px] rounded-[2.25rem] border border-purple-300/20 bg-gradient-to-br from-[#161021]/95 via-[#0d1020]/95 to-[#071b22]/95 shadow-[0_0_60px_rgba(124,58,237,.20)] p-6 sm:p-8 overflow-hidden">
            <div className="absolute -top-24 -right-24 w-56 h-56 rounded-full bg-purple-500/20 blur-2xl" />
            <div className="absolute -bottom-20 -left-16 w-56 h-56 rounded-full bg-cyan-400/15 blur-2xl" />
            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-l from-transparent via-cyan-200/60 to-transparent" />
            <div className="relative flex items-start justify-between gap-4 mb-10">
              <div>
                <div className="text-xs font-black text-purple-200 mb-2">اعتبار قابل استفاده</div>
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl sm:text-6xl font-black num-en tracking-tighter text-white">{(data?.wallet.usableToman || 0).toLocaleString("fa-IR")}</span>
                  <span className="text-lg font-black text-cyan-200">USDT</span>
                </div>
              </div>
              <div className="w-16 h-16 rounded-[1.5rem] bg-white/5 border border-white/10 flex items-center justify-center shadow-[0_0_30px_rgba(34,211,238,.18)]">
                <span className="text-3xl">◇</span>
              </div>
            </div>
            <div className="relative grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/[.06] border border-white/10 p-3">
                <div className="text-[11px] text-gray-400 mb-1">وضعیت واریز</div>
                <div className="font-black text-purple-200">{pendingDeposits.length ? `${pendingDeposits.length.toLocaleString("fa-IR")} در بررسی` : "بدون درخواست"}</div>
              </div>
              <div className="rounded-2xl bg-white/[.06] border border-white/10 p-3">
                <div className="text-[11px] text-gray-400 mb-1">وضعیت برداشت</div>
                <div className="font-black text-cyan-200">{pendingWithdrawals.length ? `${pendingWithdrawals.length.toLocaleString("fa-IR")} در بررسی` : "بدون درخواست"}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4 mb-8">
          <button onClick={openDeposit} className="group relative overflow-hidden min-h-[112px] rounded-[2rem] bg-[#120d1c]/80 border border-purple-300/25 shadow-[0_0_35px_rgba(139,92,246,.18)] p-4 flex flex-col items-start justify-between text-right active:scale-[.98] transition-transform hover:border-purple-300/50">
            <span className="absolute -left-10 -top-10 w-28 h-28 bg-purple-500/25 rounded-full blur-2xl" />
            <span className="relative w-14 h-14 rounded-2xl bg-purple-500/15 border border-purple-300/30 text-purple-200 flex items-center justify-center text-4xl group-hover:rotate-[-8deg] transition-transform">↙</span>
            <span className="relative text-2xl font-black">واریز</span>
          </button>
          <button onClick={openWithdrawal} className="group relative overflow-hidden min-h-[112px] rounded-[2rem] bg-[#07171b]/80 border border-cyan-300/25 shadow-[0_0_35px_rgba(45,212,191,.16)] p-4 flex flex-col items-start justify-between text-right active:scale-[.98] transition-transform hover:border-cyan-300/50">
            <span className="absolute -left-10 -top-10 w-28 h-28 bg-cyan-400/20 rounded-full blur-2xl" />
            <span className="relative w-14 h-14 rounded-2xl bg-cyan-400/15 border border-cyan-300/30 text-cyan-200 flex items-center justify-center text-4xl group-hover:rotate-[-8deg] transition-transform">↗</span>
            <span className="relative text-2xl font-black">برداشت</span>
          </button>
        </section>

        <section className="grid grid-cols-2 gap-3 mb-8">
          <div className="rounded-3xl bg-white/[.06] border border-white/10 p-4">
            <div className="text-xs text-gray-500 mb-1">قابل برداشت</div>
            <div className="text-xl font-black text-purple-300">{(data?.wallet.withdrawableToman || 0).toLocaleString("fa-IR")}</div>
          </div>
          <div className="rounded-3xl bg-white/[.06] border border-white/10 p-4">
            <div className="text-xs text-gray-500 mb-1">اعتبار غیرقابل برداشت</div>
            <div className="text-xl font-black text-cyan-300">{(data?.wallet.nonWithdrawableToman || 0).toLocaleString("fa-IR")}</div>
          </div>
        </section>

        <section className="rounded-t-[2.25rem] rounded-b-[1.5rem] bg-white/[.08] border border-white/10 backdrop-blur-xl overflow-hidden shadow-2xl">
          <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
            <span className="font-black text-xl">تراکنش‌ها</span>
            <span className="text-xs text-gray-400">{data?.transactions.length || 0} مورد</span>
          </div>
          {data?.transactions.length ? (
            <div className="divide-y divide-white/10 text-sm">
              {data.transactions.map((tx) => (
                <div key={tx.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 ${tx.type === "withdrawal" || tx.type === "entry_fee" ? "bg-teal-400/15 text-teal-300" : "bg-purple-500/20 text-purple-300"}`}>{transactionIcon(tx.type)}</div>
                    <div className="min-w-0">
                      <div className="font-black truncate">{TYPE_LABELS[tx.type] || tx.type}</div>
                      <div className="text-xs text-gray-500 mt-1 leading-6">
                        {new Date(tx.createdAt).toLocaleString("fa-IR")} • {STATUS_LABELS[tx.status] || tx.status}
                      </div>
                    </div>
                  </div>
                  <div className={`font-black text-lg num-en whitespace-nowrap ${txColor(tx.type)}`}>
                    {txSign(tx.type)}{tx.amountToman.toLocaleString("fa-IR")}
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="p-10 text-center text-gray-500 text-sm">هنوز تراکنشی ثبت نشده است.</div>}
        </section>
      </main>

      {walletDialog === "deposit" && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-start justify-center px-3 pt-2" dir="rtl">
          <div className="w-full max-w-md max-h-[calc(100dvh-12px)] overflow-y-auto rounded-[2.25rem] bg-[#111016] border border-white/10 shadow-[0_0_80px_rgba(139,92,246,.25)] p-4 sm:p-5 animate-slide-up overscroll-contain">
            <div className="flex items-center justify-between mb-5">
              <button onClick={closeWalletDialog} className="w-11 h-11 rounded-full bg-white text-gray-700 text-2xl leading-none">×</button>
              <h2 className="text-2xl font-black">افزایش موجودی</h2>
              <div className="w-11 h-11 rounded-2xl bg-purple-500/20 text-purple-200 flex items-center justify-center text-2xl">↙</div>
            </div>

            {!onlinePaymentAvailable ? (
              <div className="space-y-5">
                <div className="rounded-[2rem] bg-amber-500/10 border border-amber-300/25 p-5 text-center">
                  <div className="text-4xl mb-3">🛠</div>
                  <div className="font-black text-amber-100 mb-2">شارژ کیف پول موقتاً در دسترس نیست</div>
                  <p className="text-sm leading-7 text-amber-100/80">
                    درگاه پرداخت در حال حاضر فعال نیست. لطفاً کمی بعد دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.
                  </p>
                </div>
                <Link href="/support" className="gaming-btn w-full block text-center">تماس با پشتیبانی</Link>
              </div>
            ) : !identityComplete ? (
              <div className="space-y-5">
                <div className="rounded-[2rem] bg-amber-500/10 border border-amber-300/25 p-5 text-center">
                  <div className="text-4xl mb-3">🪪</div>
                  <div className="font-black text-amber-100 mb-2">ابتدا اطلاعات هویتی را کامل کنید</div>
                  <p className="text-sm leading-7 text-amber-100/80">
                    طبق قوانین، شارژ کیف پول و شرکت در مسابقات پولی فقط برای کاربران
                    بالای ۱۸ سال با هویت ثبت‌شده امکان‌پذیر است.
                  </p>
                  <p className="text-xs leading-6 text-amber-100/60 mt-3">
                    کافی است <b>کد ملی</b> و <b>تاریخ تولد</b> را یک‌بار ثبت کنید؛ بعد از آن
                    شارژ بدون محدودیت انجام می‌شود.
                  </p>
                </div>
                <Link href="/profile/user" className="gaming-btn w-full block text-center">
                  تکمیل اطلاعات هویتی
                </Link>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-[2rem] bg-gradient-to-br from-purple-950/80 to-[#191421] border border-purple-400/25 p-4">
                  <div className="text-xs font-black text-purple-200 mb-2">مبلغی که می‌خواهید واریز کنید</div>
                  <div className="flex items-center justify-center rounded-[1.75rem] bg-white/10 border border-white/10 p-4 mb-3">
                    <span className="text-3xl sm:text-4xl font-black num-en">{depositAmount || "0"}</span>
                    <span className="mr-2 font-bold text-purple-200">USDT</span>
                  </div>
                  <input
                    className="gaming-input text-left num-en"
                    dir="ltr"
                    inputMode="numeric"
                    placeholder="مثلاً 200,000 USDT"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(formatTomanInput(e.target.value))}
                  />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {QUICK_DEPOSIT_AMOUNTS.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setDepositAmount(amount.toLocaleString("en-US"))}
                        className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-black text-purple-100 hover:border-purple-400/40"
                      >
                        {amount.toLocaleString("fa-IR")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Iranian payment gateways reject foreign IPs, so a VPN is the most
                    common cause of a failed deposit. Warning before payment is far
                    cheaper than a support ticket about money that did not arrive. */}
                <div className="rounded-[2rem] bg-rose-500/10 border border-rose-300/30 p-4">
                  <div className="flex items-center gap-2 font-black text-rose-100 mb-2">
                    <span className="text-xl">⚠️</span>
                    <span>قبل از پرداخت حتماً بخوانید</span>
                  </div>
                  <ul className="text-[13px] leading-7 text-rose-50/90 space-y-1.5 pr-1">
                    <li>🔴 <b>فیلترشکن (VPN) خود را حتماً خاموش کنید.</b> درگاه‌های بانکی ایران با آی‌پی خارجی کار نمی‌کنند و پرداخت شما ناموفق می‌شود.</li>
                    <li>💻 ترجیحاً پرداخت را <b>از داخل سایت</b> انجام دهید، نه از مرورگر داخل تلگرام یا اینستاگرام.</li>
                    <li>⏳ بعد از پرداخت تا بازگشت کامل به سایت صبر کنید و صفحه را نبندید.</li>
                  </ul>
                </div>

                <label className="flex items-start gap-3 rounded-3xl bg-purple-500/10 border border-purple-300/20 p-4 cursor-pointer">
                  <input type="checkbox" checked={acceptedTerms} onChange={(e) => toggleTerms(e.target.checked)} className="mt-1 w-5 h-5 accent-purple-500" />
                  <span className="text-sm font-black leading-7 text-purple-100">قوانین کیف پول را خوانده‌ام و قبول دارم.</span>
                </label>

                <button
                  type="button"
                  disabled={!canContinueDeposit || submitting === "online"}
                  onClick={startOnlineDeposit}
                  className="gaming-btn w-full disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting === "online" ? "در حال انتقال به درگاه..." : "پرداخت اینترنتی (آنی)"}
                </button>

                <div className="rounded-3xl bg-white/[.04] border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDepositTermsOpen((value) => !value)}
                    className="w-full p-4 flex items-center justify-between gap-3 text-right"
                  >
                    <span className="font-black text-gray-100">قوانین واریز</span>
                    <span className={`w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-300/20 flex items-center justify-center text-purple-200 transition-transform ${depositTermsOpen ? "rotate-180" : ""}`}>⌄</span>
                  </button>
                  {depositTermsOpen && (
                    <div className="px-4 pb-4">
                      <p className="text-xs leading-7 text-gray-400">{WALLET_TERMS_ONLINE}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {walletDialog === "withdrawal" && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-start justify-center px-3 pt-2" dir="rtl">
          <form onSubmit={requestWithdrawal} className="w-full max-w-md max-h-[calc(100dvh-12px)] overflow-y-auto rounded-[2.25rem] bg-[#111016] border border-white/10 shadow-[0_0_80px_rgba(45,212,191,.18)] p-4 sm:p-5 animate-slide-up space-y-4 overscroll-contain">
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={closeWalletDialog} className="w-11 h-11 rounded-full bg-white text-gray-700 text-2xl leading-none">×</button>
              <h2 className="text-2xl font-black">درخواست برداشت</h2>
              <div className="w-11 h-11 rounded-2xl bg-teal-400/20 text-teal-200 flex items-center justify-center text-2xl">↗</div>
            </div>
            <div className="rounded-3xl bg-teal-400/10 border border-teal-300/20 p-4 text-sm leading-7 text-gray-300">برداشت فقط از موجودی قابل برداشت مثل جوایز و پاداش‌های رسمی امکان‌پذیر است. حداقل برداشت ۵۰٬۰۰۰ USDT.</div>
            <input className="gaming-input text-left num-en" dir="ltr" inputMode="numeric" placeholder="مبلغ برداشت (مثلاً 200,000 USDT)" value={withdrawAmount} onChange={(e) => setWithdrawAmount(formatTomanInput(e.target.value))} />
            <input className="gaming-input" placeholder="نام و نام خانوادگی صاحب حساب" value={accountOwner} onChange={(e) => setAccountOwner(e.target.value)} />
            <input className="gaming-input" placeholder="کد ملی صاحب حساب" value={nationalId} onChange={(e) => setNationalId(e.target.value)} dir="ltr" />
            <input className="gaming-input" placeholder="شماره شبا مثل IRxxxxxxxxxxxxxxxxxxxxxxxx" value={iban} onChange={(e) => setIban(e.target.value)} dir="ltr" />
            <textarea className="gaming-input min-h-20" placeholder="توضیح اختیاری" value={withdrawNote} onChange={(e) => setWithdrawNote(e.target.value)} />
            <label className="flex items-start gap-3 rounded-3xl bg-white/[.04] border border-white/10 p-4 cursor-pointer">
              <input type="checkbox" checked={acceptedTerms} onChange={(e) => toggleTerms(e.target.checked)} className="mt-1 w-5 h-5 accent-teal-400" />
              <span className="text-sm font-bold leading-7">قوانین کیف پول را خوانده‌ام و قبول دارم.</span>
            </label>
            <button disabled={!acceptedTerms || submitting === "withdrawal" || (data?.wallet.withdrawableToman || 0) <= 0} className="gaming-btn w-full disabled:opacity-40 disabled:cursor-not-allowed">{submitting === "withdrawal" ? "در حال ثبت..." : "ثبت درخواست برداشت"}</button>
          </form>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
