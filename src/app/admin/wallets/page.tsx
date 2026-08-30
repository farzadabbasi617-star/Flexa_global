"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface WalletRow {
  walletId: string | null;
  userId: string;
  displayName: string;
  username: string | null;
  phoneNumber: string;
  role: string;
  balanceToman: number;
  usableToman: number;
  withdrawableToman: number;
  nonWithdrawableToman: number;
  currency: string | null;
  updatedAt: string | null;
}

interface PendingTransaction {
  id: string;
  walletId: string;
  userId: string | null;
  displayName: string;
  username: string | null;
  phoneNumber: string | null;
  type: "deposit" | "withdrawal";
  status: string;
  amountToman: number;
  referenceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

function metaText(tx: PendingTransaction, key: string) {
  const value = tx.metadata?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function copyText(value: string) {
  if (!value) return;
  navigator.clipboard?.writeText(value).catch(() => undefined);
}

export default function AdminWalletsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WalletRow | null>(null);
  const [amountToman, setAmountToman] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [reason, setReason] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [paymentTrackingNumber, setPaymentTrackingNumber] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/wallets", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) {
        setRows(data);
        setPendingTransactions([]);
      } else {
        setRows(Array.isArray(data.wallets) ? data.wallets : []);
        setPendingTransactions(Array.isArray(data.pendingTransactions) ? data.pendingTransactions : []);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [query, rows]);

  const pendingWithdrawals = useMemo(() => pendingTransactions.filter((tx) => tx.type === "withdrawal"), [pendingTransactions]);
  const pendingDeposits = useMemo(() => pendingTransactions.filter((tx) => tx.type === "deposit"), [pendingTransactions]);
  const pendingWithdrawalTotal = useMemo(() => pendingWithdrawals.reduce((sum, tx) => sum + tx.amountToman, 0), [pendingWithdrawals]);

  async function adjust(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/wallets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ userId: selected.userId, amountToman, direction, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ذخیره نشد");
      setMessage("اصلاح موجودی ثبت شد.");
      setSelected(null);
      setAmountToman("");
      setReason("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیره نشد");
    } finally {
      setSaving(false);
    }
  }

  async function reviewTransaction(tx: PendingTransaction, decision: "approve" | "reject") {
    const confirmText = decision === "approve"
      ? tx.type === "deposit"
        ? "این شارژ تایید و به موجودی کاربر اضافه شود؟"
        : "این برداشت تایید شود؟ مطمئن شوید پرداخت بانکی انجام شده است."
      : "این درخواست رد شود؟";
    if (decision === "approve" && tx.type === "withdrawal" && !paymentTrackingNumber.trim()) {
      if (!confirm("شماره پیگیری پرداخت وارد نشده است. آیا مطمئنید پرداخت بانکی انجام شده و بدون شماره پیگیری تأیید شود؟")) return;
    }
    if (!confirm(confirmText)) return;

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/wallets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ transactionId: tx.id, decision, adminNote, paymentTrackingNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "بررسی درخواست انجام نشد");
      setMessage(decision === "approve" ? "درخواست تایید شد." : "درخواست رد شد.");
      setAdminNote("");
      setPaymentTrackingNumber("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "بررسی درخواست انجام نشد");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
        <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button>
        <h1 className="text-3xl font-black neon-text-purple mb-2">💳 مدیریت کیف پول‌ها</h1>
        <p className="text-gray-500 text-sm mb-6">مدیریت درخواست‌های شارژ/برداشت، موجودی قابل برداشت و اصلاح دستی</p>
        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 rounded-xl p-3 mb-5 text-sm">{message}</div>}

        <section className="gaming-card p-4 sm:p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-black text-xl">درخواست‌های در انتظار</h2>
              <p className="text-xs text-gray-500 mt-1">رسیدهای کارت‌به‌کارت بعد از تطبیق با حساب بانکی تأیید شوند؛ برداشت بعد از پرداخت بانکی توسط ادمین تأیید شود.</p>
            </div>
            <button onClick={load} className="px-4 py-2 rounded-xl bg-dark-700 text-sm font-bold">🔄 بروزرسانی</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-2xl bg-orange-500/10 border border-orange-500/20 p-4">
              <div className="text-xs text-orange-200 mb-1">برداشت‌های در انتظار</div>
              <div className="text-2xl font-black text-orange-300">{pendingWithdrawals.length.toLocaleString("fa-IR")}</div>
            </div>
            <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/20 p-4">
              <div className="text-xs text-yellow-200 mb-1">جمع مبلغ برداشت</div>
              <div className="text-2xl font-black text-yellow-300">{pendingWithdrawalTotal.toLocaleString("fa-IR")} USDT</div>
            </div>
            <div className="rounded-2xl bg-green-500/10 border border-green-500/20 p-4">
              <div className="text-xs text-green-200 mb-1">شارژهای pending</div>
              <div className="text-2xl font-black text-green-300">{pendingDeposits.length.toLocaleString("fa-IR")}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <input className="gaming-input" placeholder="یادداشت ادمین (اختیاری)" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
            <input className="gaming-input" placeholder="شماره پیگیری پرداخت برداشت (اختیاری)" value={paymentTrackingNumber} onChange={(e) => setPaymentTrackingNumber(e.target.value)} />
          </div>
          {pendingTransactions.length ? (
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 scrollbar-hide">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-dark-800 text-gray-400"><tr><th className="p-3 text-right">نوع</th><th className="p-3 text-right">کاربر</th><th className="p-3 text-right">مبلغ</th><th className="p-3 text-right">اطلاعات</th><th className="p-3 text-right">زمان</th><th className="p-3 text-right">عملیات</th></tr></thead>
                <tbody>
                  {pendingTransactions.map((tx) => (
                    <tr key={tx.id} className="border-t border-white/5 align-top">
                      <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs ${tx.type === "deposit" ? "bg-green-500/10 text-green-300" : "bg-orange-500/10 text-orange-300"}`}>{tx.type === "deposit" ? "شارژ" : "برداشت"}</span></td>
                      <td className="p-3"><div className="font-bold">{tx.displayName}</div><div className="text-xs text-gray-500">@{tx.username || "-"} • {tx.phoneNumber || "—"}</div></td>
                      <td className="p-3 font-black text-neon-green">{tx.amountToman.toLocaleString("fa-IR")} USDT</td>
                      <td className="p-3 text-xs text-gray-300 leading-6">
                        {tx.type === "withdrawal" ? (
                          <>
                            <div>صاحب حساب: <b className="text-white">{metaText(tx, "accountOwner") || "—"}</b></div>
                            <div>کد ملی: <button type="button" onClick={() => copyText(metaText(tx, "nationalId"))} dir="ltr" className="text-cyan-300 hover:underline">{metaText(tx, "nationalId") || "—"}</button></div>
                            <div>شبا: <button type="button" onClick={() => copyText(metaText(tx, "iban"))} dir="ltr" className="text-cyan-300 hover:underline break-all">{metaText(tx, "iban") || "—"}</button></div>
                            <div>توضیح کاربر: {metaText(tx, "note") || "—"}</div>
                          </>
                        ) : (
                          <>
                            <div>روش: کارت‌به‌کارت / تأیید دستی</div>
                            <div>شماره پیگیری/۴ رقم آخر: <button type="button" onClick={() => copyText(metaText(tx, "trackingNumber"))} dir="ltr" className="text-cyan-300 hover:underline">{metaText(tx, "trackingNumber") || "—"}</button></div>
                            {metaText(tx, "receiptUrl") ? (
                              <a href={metaText(tx, "receiptUrl")} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-xl border border-purple-400/25 bg-purple-500/10 px-3 py-2 text-purple-200 hover:bg-purple-500/20">
                                <span>مشاهده فیش واریز</span>
                                <span className="text-[10px] text-gray-400">{metaText(tx, "receiptFileName") || "receipt"}</span>
                              </a>
                            ) : (
                              <div className="text-yellow-300/80">فیش تصویری ارسال نشده</div>
                            )}
                            <div>توضیح: {metaText(tx, "note") || "—"}</div>
                          </>
                        )}
                      </td>
                      <td className="p-3 text-xs text-gray-500">{new Date(tx.createdAt).toLocaleString("fa-IR")}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button disabled={saving} onClick={() => reviewTransaction(tx, "approve")} className="px-3 py-2 rounded-lg bg-green-600/20 text-green-300 text-xs font-bold disabled:opacity-50">تایید</button>
                          <button disabled={saving} onClick={() => reviewTransaction(tx, "reject")} className="px-3 py-2 rounded-lg bg-red-600/20 text-red-300 text-xs font-bold disabled:opacity-50">رد</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="text-center text-gray-500 text-sm py-8">درخواست pending وجود ندارد.</div>}
        </section>

        <input className="gaming-input max-w-md mb-5" placeholder="جستجوی کاربر..." value={query} onChange={(e) => setQuery(e.target.value)} />

        {selected && (
          <form onSubmit={adjust} className="gaming-card p-4 sm:p-5 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 animate-slide-up">
            <div className="sm:col-span-4 text-sm text-gray-300">اصلاح موجودی برای <b>{selected.displayName}</b> — موجودی کل: {selected.balanceToman.toLocaleString("fa-IR")} USDT، قابل برداشت: {selected.withdrawableToman.toLocaleString("fa-IR")} USDT</div>
            <select className="gaming-select" value={direction} onChange={(e) => setDirection(e.target.value as "increase" | "decrease")}><option value="increase">افزایش</option><option value="decrease">کاهش</option></select>
            <input className="gaming-input" placeholder="مبلغ USDT" value={amountToman} onChange={(e) => setAmountToman(e.target.value)} />
            <input className="gaming-input sm:col-span-2" placeholder="دلیل اصلاح" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button disabled={saving} className="gaming-btn disabled:opacity-50">ثبت اصلاح</button>
            <button type="button" onClick={() => setSelected(null)} className="px-4 py-3 rounded-xl bg-dark-700 text-gray-300">انصراف</button>
          </form>
        )}

        {busy ? <div className="text-center py-20 text-4xl animate-neon-pulse">💳</div> : (
          <div className="gaming-card overflow-hidden -mx-1 sm:mx-0">
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 scrollbar-hide">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-dark-800 text-gray-400"><tr><th className="p-3 text-right">کاربر</th><th className="p-3 text-right">موبایل</th><th className="p-3 text-right">نقش</th><th className="p-3 text-right">کل</th><th className="p-3 text-right">قابل مصرف</th><th className="p-3 text-right">قابل برداشت</th><th className="p-3 text-right">عملیات</th></tr></thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.userId} className="border-t border-white/5 hover:bg-white/[.03]">
                      <td className="p-3"><div className="font-bold">{row.displayName}</div><div className="text-xs text-gray-500">@{row.username || "-"}</div></td>
                      <td className="p-3" dir="ltr">{row.phoneNumber}</td>
                      <td className="p-3">{row.role}</td>
                      <td className="p-3 font-black text-neon-green">{row.balanceToman.toLocaleString("fa-IR")}</td>
                      <td className="p-3 font-bold text-neon-blue">{row.usableToman.toLocaleString("fa-IR")}</td>
                      <td className="p-3 font-bold text-yellow-300">{row.withdrawableToman.toLocaleString("fa-IR")}</td>
                      <td className="p-3"><button onClick={() => setSelected(row)} className="text-neon-blue text-xs font-bold">اصلاح موجودی</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
