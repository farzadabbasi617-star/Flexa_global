"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface FinanceData {
  summary: Record<string, number | string>;
  transactions: Array<Record<string, any>>;
  tournamentFunds: Array<Record<string, any>>;
  anomalies: {
    duplicateReferences: Array<{ referenceId: string; occurrences: number }>;
    negativeWallets: string[];
    stalePending: number;
    overpaidTournaments: Array<{ id: string; name: string; overpaidToman: number }>;
  };
}

export default function AdminFinancePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<FinanceData | null>(null);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/finance", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "گزارش مالی بارگذاری نشد");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "گزارش مالی بارگذاری نشد");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.push("/"); }, [loading, user, isAdmin, router]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const rows = data?.transactions || [];
    const q = query.toLowerCase();
    return q ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : rows;
  }, [data, query]);

  async function updateTransaction(transactionId: string, action: "approve" | "reject") {
    if (!confirm(action === "approve" ? "این درخواست شارژ تأیید و موجودی کاربر افزایش یابد؟" : "این درخواست رد شود؟")) return;
    setError("");
    try {
      const res = await fetch("/api/admin/finance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ transactionId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "عملیات انجام نشد");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "عملیات انجام نشد");
    }
  }

  function exportCsv() {
    const rows = filtered;
    const header = ["createdAt", "displayName", "username", "type", "status", "amountToman", "referenceId"];
    const transactionCsv = [header.join(","), ...rows.map((r) => header.map((h) => `"${String(r[h] ?? "").replaceAll('"', '""')}"`).join(","))];
    const fundHeader = ["tournament", "registered", "noShow", "entryFeesToman", "refundsToman", "commissionToman", "expectedPrizeToman", "paidPrizeToman", "varianceToman"];
    const fundRows = (data?.tournamentFunds || []).map((fund) => [fund.name, fund.registeredCount, fund.noShowCount, fund.entryFeesToman, fund.refundsToman, fund.commissionToman, fund.expectedPrizeToman, fund.paidPrizeToman, fund.varianceToman].map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","));
    const csv = [...transactionCsv, "", "TOURNAMENT_FUNDS", fundHeader.join(","), ...fundRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flexa-finance-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !user || !isAdmin) return null;
  const s = data?.summary;

  return (
    <div className="min-h-screen bg-dark-900 text-white"><Navbar /><main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button>
      <div className="flex justify-between gap-4 mb-6"><div><h1 className="text-3xl font-black neon-text-purple">📈 گزارش مالی</h1><p className="text-gray-500 text-sm mt-2">تأیید شارژها، تراکنش‌ها، موجودی‌ها، درآمدها و خروجی CSV</p></div><button onClick={exportCsv} className="gaming-btn text-sm">خروجی CSV</button></div>
      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}
      {busy ? <div className="text-center py-20 text-4xl animate-neon-pulse">📈</div> : data && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[['واریز کل', s?.totalDepositsToman], ['برداشت کل', s?.totalWithdrawalsToman], ['ورودی تورنومنت', s?.totalEntryFeesToman], ['جوایز پرداختی', s?.totalTournamentWinsToman], ['کارمزد پلتفرم', s?.totalCommissionToman], ['موجودی کیف پول‌ها', s?.totalWalletBalanceToman], ['No-show', s?.noShowCount], ['هشدار مغایرت', s?.anomalyCount]].map(([label, value]) => <div key={label} className="gaming-card p-4"><div className="text-xs text-gray-500 mb-2">{label}</div><div className="text-xl font-black text-neon-green">{Number(value || 0).toLocaleString("fa-IR")}</div></div>)}
        </div>
        {Number(s?.anomalyCount || 0) > 0 && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <div className="font-black mb-2">🚨 مغایرت مالی نیازمند بررسی</div>
            <div>رفرنس تکراری: {data.anomalies.duplicateReferences.length} • کیف پول منفی: {data.anomalies.negativeWallets.length} • درخواست قدیمی: {data.anomalies.stalePending} • پرداخت بیشتر از استخر: {data.anomalies.overpaidTournaments.length}</div>
          </div>
        )}
        <div className="gaming-card overflow-hidden mb-8">
          <div className="p-4 font-black text-neon-purple">🏆 صندوق مالی تورنمنت‌ها</div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-dark-800 text-gray-400"><tr><th className="p-3 text-right">تورنومنت</th><th>ثبت‌نام/No-show</th><th>ورودی</th><th>Refund</th><th>کارمزد</th><th>استخر مورد انتظار</th><th>پرداخت‌شده</th><th>مانده</th></tr></thead><tbody>{data.tournamentFunds.map((fund) => <tr key={fund.id} className="border-t border-white/5"><td className="p-3 font-bold">{fund.name}</td><td>{fund.registeredCount}/{fund.noShowCount}</td><td>{Number(fund.entryFeesToman).toLocaleString("fa-IR")}</td><td>{Number(fund.refundsToman).toLocaleString("fa-IR")}</td><td>{Number(fund.commissionToman).toLocaleString("fa-IR")}</td><td>{Number(fund.expectedPrizeToman).toLocaleString("fa-IR")}</td><td>{Number(fund.paidPrizeToman).toLocaleString("fa-IR")}</td><td className={Number(fund.varianceToman) < 0 ? "text-red-300 font-black" : "text-green-300 font-black"}>{Number(fund.varianceToman).toLocaleString("fa-IR")}</td></tr>)}</tbody></table></div>
        </div>
        <input className="gaming-input max-w-md mb-5" placeholder="جستجو در تراکنش‌ها..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="gaming-card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-dark-800 text-gray-400"><tr><th className="p-3 text-right">زمان</th><th className="p-3 text-right">کاربر</th><th className="p-3 text-right">نوع</th><th className="p-3 text-right">وضعیت</th><th className="p-3 text-right">مبلغ</th><th className="p-3 text-right">رفرنس</th><th className="p-3 text-right">عملیات</th></tr></thead><tbody>{filtered.map((tx) => <tr key={tx.id} className="border-t border-white/5"><td className="p-3">{new Date(tx.createdAt).toLocaleString("fa-IR")}</td><td className="p-3">{tx.displayName || tx.username || "—"}</td><td className="p-3 text-neon-blue">{tx.type}</td><td className="p-3">{tx.status}</td><td className="p-3 text-neon-green font-black">{Number(tx.amountToman || 0).toLocaleString("fa-IR")} USDT</td><td className="p-3" dir="ltr">{tx.referenceId || "—"}</td><td className="p-3">{tx.type === "deposit" && tx.status === "pending" ? <div className="flex gap-2"><button onClick={() => updateTransaction(tx.id, "approve")} className="text-green-300 text-xs font-bold">تأیید</button><button onClick={() => updateTransaction(tx.id, "reject")} className="text-red-300 text-xs font-bold">رد</button></div> : <span className="text-gray-600 text-xs">—</span>}</td></tr>)}</tbody></table></div></div>
      </>}
    </main></div>
  );
}
