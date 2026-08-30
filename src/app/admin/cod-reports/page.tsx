"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { parseTomanToRial } from "@/lib/money";

interface CodReportRow {
  id: string;
  roomId: string;
  roomTitle: string;
  roomStatus: string;
  category: string;
  description: string;
  evidenceUrl: string | null;
  status: string;
  resolution: string | null;
  adminNote: string | null;
  accusedCodUsername: string | null;
  reporterName: string;
  reporterFlexaId: string;
  accusedName: string | null;
  accusedFlexaId: string | null;
  reviewerName: string | null;
  createdAt: string;
}

const categoryFa: Record<string, string> = {
  cheat: "چیت / هک",
  teaming: "تیم‌آپ",
  no_recording: "نداشتن رکورد",
  banned_item: "آیتم ممنوع",
  toxic_behavior: "رفتار/فحاشی",
  wrong_result: "نتیجه اشتباه",
  no_show: "No-show",
  other: "سایر",
};

const statusFa: Record<string, string> = {
  pending: "در انتظار",
  in_review: "در بررسی",
  resolved: "حل‌شده",
  rejected: "ردشده",
};

function localDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(date);
}

function fineToRial(value: string) {
  return parseTomanToRial(value || "0").toString();
}

export default function AdminCodReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<CodReportRow[]>([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [forms, setForms] = useState<Record<string, { adminNote: string; penaltyType: string; fineToman: string; durationHours: string }>>({});

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => { if (!authLoading && (!user || !isAdmin)) router.push("/"); }, [authLoading, user, isAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = status === "all" ? "" : `?status=${status}`;
      const response = await fetch(`/api/admin/cod/reports${query}`, { cache: "no-store", credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "گزارش‌ها دریافت نشد");
      setReports(Array.isArray(data.reports) ? data.reports : []);
    } catch (err) { setError(err instanceof Error ? err.message : "گزارش‌ها دریافت نشد"); }
    finally { setLoading(false); }
  }, [status]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  function formFor(id: string) {
    return forms[id] || { adminNote: "", penaltyType: "none", fineToman: "50000", durationHours: "72" };
  }

  async function resolve(report: CodReportRow, nextStatus: "in_review" | "resolved" | "rejected") {
    const form = formFor(report.id);
    const penalty = nextStatus === "resolved" && form.penaltyType !== "none" ? {
      type: form.penaltyType,
      reason: form.adminNote || `رسیدگی به گزارش ${categoryFa[report.category] || report.category}`,
      fineRial: form.penaltyType === "fine" ? fineToRial(form.fineToman) : "0",
      durationHours: form.penaltyType === "temp_ban" ? Number(form.durationHours || 72) : null,
    } : null;
    setBusyId(report.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/cod/reports", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({
          id: report.id,
          status: nextStatus,
          resolution: nextStatus === "resolved" ? "confirmed" : nextStatus,
          adminNote: form.adminNote || null,
          penalty,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "ذخیره نشد");
      setMessage("وضعیت گزارش ذخیره شد.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ذخیره نشد"); }
    finally { setBusyId(null); }
  }

  if (authLoading || !isAdmin) return null;

  return <div className="min-h-screen bg-[#070707] text-white"><Navbar />
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-7" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><Link href="/admin" className="text-xs text-gray-500">← داشبورد</Link><h1 className="text-3xl font-black mt-3">🚨 گزارش‌ها و جریمه‌های COD Arena</h1><p className="text-xs text-gray-500 mt-2">بررسی گزارش چیت، تیم‌آپ، رکورد، آیتم ممنوع و اعمال اخطار/جریمه/بن</p></div>
        <div className="flex rounded-2xl bg-[#111] border border-white/10 p-1">
          {["pending", "in_review", "resolved", "rejected", "all"].map((item) => <button key={item} onClick={() => setStatus(item)} className={`px-4 py-2 rounded-xl text-xs font-black ${status === item ? "bg-red-500 text-black" : "text-gray-400"}`}>{item === "all" ? "همه" : statusFa[item]}</button>)}
        </div>
      </div>
      {error && <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {message && <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}
      {loading ? <div className="p-12 text-center text-gray-500">در حال بارگذاری...</div> : reports.length === 0 ? <div className="mt-7 rounded-3xl border border-white/5 p-12 text-center text-gray-500">گزارشی برای این فیلتر وجود ندارد.</div> : <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-7">
        {reports.map((report) => {
          const form = formFor(report.id);
          const busy = busyId === report.id;
          return <article key={report.id} className="rounded-[2rem] border border-white/10 bg-white/[.025] p-5">
            <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2 text-[10px]"><span className="rounded-full bg-red-500/10 text-red-300 px-3 py-1">{categoryFa[report.category] || report.category}</span><span className="rounded-full bg-white/5 px-3 py-1">{statusFa[report.status] || report.status}</span><span className="rounded-full bg-orange-500/10 text-orange-300 px-3 py-1">{localDate(report.createdAt)}</span></div><h2 className="font-black text-lg mt-3">{report.roomTitle}</h2><p className="text-[11px] text-gray-500 mt-1">گزارش‌دهنده: {report.reporterName} ({report.reporterFlexaId})</p></div><Link href={`/cod-arena/${report.roomId}`} className="rounded-xl border border-white/10 px-3 py-2 text-xs shrink-0">نمای روم</Link></div>
            <div className="mt-4 rounded-2xl bg-black/25 p-4 text-xs leading-7 whitespace-pre-line">{report.description}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs"><div className="rounded-xl bg-black/25 p-3"><span className="text-gray-500">متهم:</span> <b dir="ltr">{report.accusedCodUsername || report.accusedName || "نامشخص"}</b></div>{report.evidenceUrl && (report.evidenceUrl.startsWith("telegram_file:") ? <div className="rounded-xl bg-sky-500/10 text-sky-300 p-3 text-center">مدرک داخل تلگرام ثبت شده</div> : <a href={report.evidenceUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-purple-500/10 text-purple-300 p-3 text-center">مشاهده مدرک</a>)}</div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2"><textarea value={form.adminNote} onChange={(e) => setForms({ ...forms, [report.id]: { ...form, adminNote: e.target.value } })} rows={3} placeholder="یادداشت ادمین / دلیل تصمیم" className="sm:col-span-2 rounded-xl bg-black/40 border border-white/10 px-3 py-3 text-xs outline-none focus:border-red-400" /><select value={form.penaltyType} onChange={(e) => setForms({ ...forms, [report.id]: { ...form, penaltyType: e.target.value } })} className="rounded-xl bg-black/40 border border-white/10 px-3 py-3 text-xs"><option value="none">بدون جریمه</option><option value="warning">اخطار</option><option value="fine">جریمه نقدی</option><option value="temp_ban">بن موقت</option><option value="permanent_ban">بن دائم</option><option value="result_void">باطل‌کردن نتیجه</option></select>{form.penaltyType === "fine" ? <input value={form.fineToman} onChange={(e) => setForms({ ...forms, [report.id]: { ...form, fineToman: e.target.value } })} placeholder="مبلغ جریمه USDT" className="rounded-xl bg-black/40 border border-white/10 px-3 py-3 text-xs" /> : form.penaltyType === "temp_ban" ? <input type="number" min={1} max={720} value={form.durationHours} onChange={(e) => setForms({ ...forms, [report.id]: { ...form, durationHours: e.target.value } })} placeholder="مدت بن ساعت" className="rounded-xl bg-black/40 border border-white/10 px-3 py-3 text-xs" /> : <div />}</div>
            <div className="flex flex-wrap gap-2 mt-4"><button disabled={busy} onClick={() => resolve(report, "in_review")} className="rounded-xl border border-white/10 px-4 py-3 text-xs disabled:opacity-40">در بررسی</button><button disabled={busy} onClick={() => resolve(report, "rejected")} className="rounded-xl border border-red-500/20 text-red-300 px-4 py-3 text-xs disabled:opacity-40">رد گزارش</button><button disabled={busy} onClick={() => resolve(report, "resolved")} className="rounded-xl bg-emerald-500 text-black px-5 py-3 text-xs font-black disabled:opacity-40">تأیید و اعمال تصمیم</button></div>
          </article>;
        })}
      </div>}
    </main>
  </div>;
}
